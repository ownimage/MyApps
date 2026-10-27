"""UDP intake for Hid telemetry (daemon thread, no Flask imports)."""

from __future__ import annotations

import socket
import threading

from .protocol import DATA_SIZE, is_ping, is_pong, parse_frame, pong_reply


class HidUdpReceiver:
    def __init__(self, engine, host: str = "0.0.0.0", port: int = 7801) -> None:
        self.engine = engine
        self.host = host
        self.port = port
        self.bad_packets = 0
        # Reachability probe counters (`mouse-capture --ping`).
        self.pings = 0
        self.pongs_sent = 0

        self._socket: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((self.host, self.port))
        sock.settimeout(0.5)
        self._socket = sock
        self.port = sock.getsockname()[1]

        self._thread = threading.Thread(target=self._loop, name="mouseCapture-udp", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        sock = self._socket
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass

    def _loop(self) -> None:
        assert self._socket is not None
        while not self._stop.is_set():
            try:
                data, addr = self._socket.recvfrom(max(2048, DATA_SIZE))
            except socket.timeout:
                continue
            except OSError:
                break

            # `mouse-capture --ping` is the documented reachability probe. Answer
            # it before anything else: a ping must work whether or not the
            # foreground app has a Hid profile (that is the point of the test).
            if is_ping(data):
                self.pings += 1
                try:
                    self._socket.sendto(pong_reply(data), addr)
                    self.pongs_sent += 1
                except OSError:
                    pass
                continue

            # Never answer a pong: two listeners must not echo each other.
            if is_pong(data):
                continue

            frame = parse_frame(data)
            if frame is None:
                self.bad_packets += 1
                continue
            self.engine.feed(frame)

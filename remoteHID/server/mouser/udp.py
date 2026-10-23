"""UDP intake for Mouser telemetry (daemon thread, no Flask imports)."""

from __future__ import annotations

import socket
import threading

from .protocol import DATA_SIZE, parse_frame


class MouserUdpReceiver:
    def __init__(self, engine, host: str = "0.0.0.0", port: int = 7801) -> None:
        self.engine = engine
        self.host = host
        self.port = port
        self.bad_packets = 0

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

        self._thread = threading.Thread(target=self._loop, name="mouser-udp", daemon=True)
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
                data, _addr = self._socket.recvfrom(max(2048, DATA_SIZE))
            except socket.timeout:
                continue
            except OSError:
                break

            frame = parse_frame(data)
            if frame is None:
                self.bad_packets += 1
                continue
            self.engine.feed(frame)

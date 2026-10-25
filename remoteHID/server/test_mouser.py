"""Unit tests for the Mouser package (protocol, ratchet, engine, UDP intake).

These are pure/threaded tests: they never touch the real capture client, the
real config, or the Windows key injector. Run from the repo root:

    py -3.13 -m pytest remoteHID/server/test_mouser.py -q
"""

import socket
import struct
import time

import pytest

from mouser.axes import AxisModel, build_axes
from mouser.engine import MouserEngine
from mouser.protocol import (
    DATA_SIZE,
    MAGIC_PING,
    MAGIC_PONG,
    MAGIC_V1,
    MAGIC_V2,
    MODE_OFF,
    MODE_ROTATE,
    MODE_TRANSLATE,
    PING_SIZE,
    is_ping,
    is_pong,
    parse_frame,
    pong_reply,
)
from mouser.udp import MouserUdpReceiver


def make_frame(dx=0.0, dy=0.0, wheel=0.0, mode=MODE_ROTATE, *,
               sequence=1, qpc=0, magic=MAGIC_V2, pad=0):
    return struct.pack("<IIqfffHH", magic, sequence, qpc, dx, dy, wheel, mode, pad)


def make_ping(sequence=1, qpc=1234, magic=MAGIC_PING):
    return struct.pack("<IIq", magic, sequence, qpc)


def rotate_profile(**overrides):
    block = {"enabled": True, "axes": {}}
    block["axes"].update(overrides)
    return {"key": "blender", "mouser": block}


# --------------------------------------------------------------------------- #
# Wire format
# --------------------------------------------------------------------------- #

class TestProtocol:
    def test_a_valid_v2_frame_round_trips(self):
        frame = parse_frame(make_frame(12.5, -3.0, 120.0, MODE_TRANSLATE, sequence=7, qpc=99))
        assert frame is not None
        assert (frame.sequence, frame.qpc) == (7, 99)
        assert frame.dx == pytest.approx(12.5)
        assert frame.dy == pytest.approx(-3.0)
        assert frame.wheel == pytest.approx(120.0)
        assert frame.mode == MODE_TRANSLATE

    def test_the_frame_is_still_32_bytes(self):
        assert DATA_SIZE == 32
        assert len(make_frame()) == 32

    def test_the_old_magic_is_rejected(self):
        # v1 put a boolean gate in the same u16; a stale capture build must not
        # be silently interpreted as "rotate".
        assert parse_frame(make_frame(magic=MAGIC_V1)) is None

    def test_unknown_modes_and_short_datagrams_are_rejected(self):
        assert parse_frame(make_frame(mode=3)) is None
        assert parse_frame(make_frame(mode=0xFFFF)) is None
        assert parse_frame(make_frame()[:31]) is None
        assert parse_frame(b"") is None
        assert parse_frame(None) is None

    def test_extra_trailing_bytes_are_ignored(self):
        assert parse_frame(make_frame() + b"junk") is not None


# --------------------------------------------------------------------------- #
# Ratchet
# --------------------------------------------------------------------------- #

class TestAxisModel:
    def test_a_press_needs_a_full_step(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0)
        assert axis.feed(99, now=1.0) == []
        assert axis.feed(1, now=1.1) == ["F13"]
        assert axis.acc == pytest.approx(0.0)
        assert axis.value == pytest.approx(5.0)
        assert axis.presses == 1

    def test_a_large_delta_produces_multiple_presses(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0)
        assert axis.feed(250, now=1.0) == ["F13", "F13"]   # 12.5 units -> 2 steps
        assert axis.acc == pytest.approx(2.5)

    def test_a_zero_delta_frame_drains_capped_steps(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0)
        assert axis.feed(1000, now=1.0, max_presses=3) == ["F13"] * 3
        assert axis.acc == pytest.approx(35.0)
        # The remaining 35 units are 7 steps; the next stationary frames drain
        # them 3 at a time instead of leaving them banked forever.
        assert axis.feed(0, now=1.02, max_presses=3) == ["F13"] * 3
        assert axis.feed(0, now=1.04, max_presses=3) == ["F13"] * 3
        assert axis.feed(0, now=1.06, max_presses=3) == ["F13"]
        assert axis.acc == pytest.approx(0.0)

    def test_negative_motion_uses_the_negative_key_and_keeps_its_sign(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0)
        assert axis.feed(-100, now=1.0) == ["F14"]
        assert axis.acc == pytest.approx(0.0)
        assert axis.value == pytest.approx(-5.0)

    def test_deadband_ignores_small_deltas_without_accumulating(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0, deadband=4)
        assert axis.feed(3, now=1.0) == []
        assert axis.acc == 0
        assert axis.feed(4, now=1.1) == []
        assert axis.acc == 0

    def test_an_unbound_direction_consumes_its_steps(self):
        axis = AxisModel(positive="F13", negative="", gain=0.05, step=5.0)
        assert axis.feed(-100, now=1.0) == []
        # It must not bank 5 units and dump them as F13 when the mouse reverses.
        assert axis.acc == pytest.approx(0.0)
        assert axis.feed(100, now=1.1) == ["F13"]

    def test_the_per_frame_cap_keeps_the_remainder(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0)
        assert axis.feed(1000, now=1.0, max_presses=3) == ["F13"] * 3
        assert axis.acc == pytest.approx(35.0)   # 50 units - 3 * 5

    def test_the_minimum_interval_carries_steps_instead_of_dropping_them(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0)
        assert axis.feed(100, now=1.000, min_interval_s=0.010) == ["F13"]
        # Too soon: the press is deferred, and its units stay in acc.
        assert axis.feed(100, now=1.005, min_interval_s=0.010) == []
        assert axis.acc == pytest.approx(5.0)
        assert axis.feed(100, now=1.020, min_interval_s=0.010) == ["F13", "F13"]
        assert axis.acc == pytest.approx(0.0)

    def test_reset_clears_the_accumulator_but_not_the_press_counter(self):
        axis = AxisModel(positive="F13", negative="F14", gain=0.05, step=5.0)
        axis.feed(100, now=1.0)
        axis.reset()
        assert (axis.acc, axis.value) == (0.0, 0.0)
        assert axis.presses == 1

    def test_build_axes_falls_back_to_the_defaults(self):
        models = build_axes({})
        assert models["rx"].positive == "F13"
        assert models["ry"].positive == "F15"
        assert models["tz"].negative == "F24"
        assert models["rx"].gain == pytest.approx(0.05)
        assert models["tx"].gain == pytest.approx(0.0001)

    def test_build_axes_clamps_bad_numbers(self):
        models = build_axes({"axes": {"rx": {"gain": 0, "step": -2, "deadband": "x"}}})
        assert models["rx"].gain > 0
        assert models["rx"].step > 0
        assert models["rx"].deadband == 0


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #

class TestEngine:
    def make_engine(self, presses=None, profile=None):
        presses = presses if presses is not None else []
        # append() returns None; the engine treats a falsy return as a failed
        # injection, so wrap it to report success.
        engine = MouserEngine(lambda key: (presses.append(key), True)[1],
                              max_presses_per_frame=3)
        engine.set_profile(profile if profile is not None else rotate_profile(), global_enabled=True)
        return engine, presses

    def test_rotate_maps_dx_to_ry_dy_to_rx_and_wheel_to_rz(self):
        engine, presses = self.make_engine()
        assert engine.feed(parse_frame(make_frame(dx=100, mode=MODE_ROTATE)), now=1.0) == ["F15"]
        assert engine.feed(parse_frame(make_frame(dy=100, mode=MODE_ROTATE)), now=1.1) == ["F13"]
        assert engine.feed(parse_frame(make_frame(wheel=2400, mode=MODE_ROTATE)), now=1.2) == ["F17"] * 3
        assert presses == ["F15", "F13", "F17", "F17", "F17"]

    def test_translate_maps_dx_to_tx_dy_to_tz_and_wheel_to_ty(self):
        engine, presses = self.make_engine()
        assert engine.feed(parse_frame(make_frame(dx=100, mode=MODE_TRANSLATE)), now=1.0) == ["F19"]
        assert engine.feed(parse_frame(make_frame(dy=100, mode=MODE_TRANSLATE)), now=1.1) == ["F23"]
        assert engine.feed(parse_frame(make_frame(wheel=100, mode=MODE_TRANSLATE)), now=1.2) == ["F21"]
        assert presses == ["F19", "F23", "F21"]

    def test_an_empty_mode_resets_the_accumulator(self):
        engine, _ = self.make_engine()
        engine.feed(parse_frame(make_frame(dx=99, mode=MODE_ROTATE)), now=1.0)
        assert engine.feed(parse_frame(make_frame(mode=MODE_OFF)), now=1.1) == []
        # The last count must not combine with pre-release motion.
        assert engine.feed(parse_frame(make_frame(dx=1, mode=MODE_ROTATE)), now=1.2) == []

    def test_switching_modes_resets_the_accumulator(self):
        engine, _ = self.make_engine()
        engine.feed(parse_frame(make_frame(dx=99, mode=MODE_ROTATE)), now=1.0)
        engine.feed(parse_frame(make_frame(mode=MODE_TRANSLATE)), now=1.1)
        assert engine.feed(parse_frame(make_frame(dx=1, mode=MODE_ROTATE)), now=1.2) == []

    def test_a_disabled_profile_or_global_switch_presses_nothing(self):
        engine, presses = self.make_engine(profile={"key": "x", "mouser": {"enabled": False}})
        assert engine.feed(parse_frame(make_frame(dx=100)), now=1.0) == []
        engine.set_profile(rotate_profile(), global_enabled=False)
        assert engine.feed(parse_frame(make_frame(dx=100)), now=1.1) == []
        assert presses == []

    def test_a_layout_without_a_mouser_block_is_disabled(self):
        engine, presses = self.make_engine(profile={"key": "plain"})
        assert engine.feed(parse_frame(make_frame(dx=100)), now=1.0) == []
        assert engine.snapshot(now=1.0)["enabled"] is False
        assert presses == []

    def test_a_failed_injection_still_reports_the_attempt(self):
        tried = []
        engine = MouserEngine(lambda key: tried.append(key) or False)
        engine.set_profile(rotate_profile(), global_enabled=True)
        assert engine.feed(parse_frame(make_frame(dx=100)), now=1.0) == ["F15"]
        assert tried == ["F15"]
        assert engine.snapshot(now=1.0)["pressesPerSecond"] == 0

    def test_snapshot_reports_the_mode_values_and_presses(self):
        engine, _ = self.make_engine()
        engine.feed(parse_frame(make_frame(dx=100, mode=MODE_ROTATE)), now=1.0)
        snap = engine.snapshot(now=1.0)
        assert snap["mode"] == MODE_ROTATE
        assert snap["enabled"] is True
        assert snap["app"] is None
        assert snap["layout"] == "blender"
        assert snap["axes"]["ry"]["value"] == pytest.approx(5.0)
        assert snap["axes"]["ry"]["presses"] == 1
        assert snap["pressesPerSecond"] == 1

    def test_set_profile_records_the_app_name(self):
        engine, _ = self.make_engine()
        engine.set_profile(rotate_profile(), app_name="Blender", global_enabled=True)
        assert engine.snapshot()["app"] == "Blender"


# --------------------------------------------------------------------------- #
# UDP intake
# --------------------------------------------------------------------------- #

class TestMouserUdpReceiver:
    def test_it_parses_datagrams_and_feeds_the_engine(self):
        presses = []
        engine = MouserEngine(presses.append, max_presses_per_frame=5)
        engine.set_profile(rotate_profile(), global_enabled=True)

        receiver = MouserUdpReceiver(engine, "127.0.0.1", 0)
        receiver.start()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
                sender.sendto(make_frame(dx=100, mode=MODE_ROTATE), ("127.0.0.1", receiver.port))
            deadline = time.monotonic() + 2.0
            while not presses and time.monotonic() < deadline:
                time.sleep(0.01)
            assert presses == ["F15"]
            assert receiver.bad_packets == 0
        finally:
            receiver.stop()

    def test_it_counts_garbage_and_wrong_versions(self):
        engine = MouserEngine(lambda key: True)
        engine.set_profile(rotate_profile(), global_enabled=True)

        receiver = MouserUdpReceiver(engine, "127.0.0.1", 0)
        receiver.start()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
                sender.sendto(b"not a frame", ("127.0.0.1", receiver.port))
                sender.sendto(make_frame(dx=100, magic=MAGIC_V1), ("127.0.0.1", receiver.port))
            deadline = time.monotonic() + 2.0
            while receiver.bad_packets < 2 and time.monotonic() < deadline:
                time.sleep(0.01)
            assert receiver.bad_packets == 2
        finally:
            receiver.stop()


# --------------------------------------------------------------------------- #
# Ping / pong reachability probe
#
# `mouser-capture --ping --udp <server>:<port>` is the documented way to prove
# the capture machine can reach the server (Mouser README T8). `--recv` answers
# it, but the Flask server did not, so a ping against the real server always
# timed out even when the link was fine. The server now echoes PONG.
# --------------------------------------------------------------------------- #

class TestPingReply:
    def test_a_ping_is_recognised_and_a_data_frame_is_not(self):
        assert is_ping(make_ping()) is True
        assert is_ping(make_frame()) is False
        assert is_ping(b"") is False
        assert is_ping(b"\x47\x4e\x49\x50") is False  # too short

    def test_a_pong_is_recognised_and_a_ping_is_not(self):
        assert is_pong(make_ping(magic=MAGIC_PONG)) is True
        assert is_pong(make_ping()) is False

    def test_pong_reply_echoes_the_payload_and_swaps_the_magic(self):
        reply = pong_reply(make_ping(sequence=42, qpc=987654321))

        assert len(reply) == PING_SIZE
        assert struct.unpack_from("<I", reply)[0] == MAGIC_PONG
        # Everything after the magic is echoed verbatim, so the capture can match
        # its own sequence/qpc (it only checks the magic today).
        assert reply[4:] == make_ping(sequence=42, qpc=987654321)[4:]

    def test_the_receiver_answers_a_ping_even_when_the_engine_is_disabled(self):
        # Reachability must be provable with no layout/enable state involved.
        presses = []
        engine = MouserEngine(presses.append)          # no profile: disabled

        receiver = MouserUdpReceiver(engine, "127.0.0.1", 0)
        receiver.start()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
                client.settimeout(2.0)
                client.sendto(make_ping(sequence=7, qpc=1234), ("127.0.0.1", receiver.port))
                reply, _ = client.recvfrom(64)

            assert len(reply) == PING_SIZE
            assert struct.unpack_from("<I", reply)[0] == MAGIC_PONG
            assert struct.unpack_from("<I", reply, 4)[0] == 7
            assert presses == []
            assert receiver.pings == 1
            assert receiver.bad_packets == 0
        finally:
            receiver.stop()

    def test_a_pong_is_ignored_so_two_servers_cannot_ping_pong(self):
        engine = MouserEngine(lambda key: True)
        receiver = MouserUdpReceiver(engine, "127.0.0.1", 0)
        receiver.start()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
                client.settimeout(0.4)
                client.sendto(make_ping(magic=MAGIC_PONG), ("127.0.0.1", receiver.port))
                with pytest.raises(OSError):
                    client.recvfrom(64)

            assert receiver.pings == 0
            assert receiver.bad_packets == 0
        finally:
            receiver.stop()

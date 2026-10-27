"""Hid: UDP telemetry from the capture client -> ratcheted key presses."""

from .axes import AXES, DEFAULT_AXES, AxisModel, build_axes
from .engine import MODE_AXES, HidEngine
from .protocol import (
    DATA_SIZE,
    MAGIC_PING,
    MAGIC_PONG,
    MAGIC_V1,
    MAGIC_V2,
    MODE_OFF,
    MODE_ROTATE,
    MODE_TRANSLATE,
    PING_SIZE,
    Frame,
    is_ping,
    is_pong,
    parse_frame,
    pong_reply,
)
from .udp import HidUdpReceiver

__all__ = [
    "AXES",
    "DATA_SIZE",
    "DEFAULT_AXES",
    "Frame",
    "MAGIC_PING",
    "MAGIC_PONG",
    "MAGIC_V1",
    "MAGIC_V2",
    "MODE_AXES",
    "MODE_OFF",
    "MODE_ROTATE",
    "MODE_TRANSLATE",
    "PING_SIZE",
    "AxisModel",
    "HidEngine",
    "HidUdpReceiver",
    "build_axes",
    "is_ping",
    "is_pong",
    "parse_frame",
    "pong_reply",
]

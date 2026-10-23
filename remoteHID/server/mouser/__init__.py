"""Mouser: UDP telemetry from the capture client -> ratcheted key presses."""

from .axes import AXES, DEFAULT_AXES, AxisModel, build_axes
from .engine import MODE_AXES, MouserEngine
from .protocol import (
    DATA_SIZE,
    MAGIC_V1,
    MAGIC_V2,
    MODE_OFF,
    MODE_ROTATE,
    MODE_TRANSLATE,
    Frame,
    parse_frame,
)
from .udp import MouserUdpReceiver

__all__ = [
    "AXES",
    "DATA_SIZE",
    "DEFAULT_AXES",
    "Frame",
    "MAGIC_V1",
    "MAGIC_V2",
    "MODE_AXES",
    "MODE_OFF",
    "MODE_ROTATE",
    "MODE_TRANSLATE",
    "AxisModel",
    "MouserEngine",
    "MouserUdpReceiver",
    "build_axes",
    "parse_frame",
]

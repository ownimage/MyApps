"""Wire format for the Mouser capture client (UDP, little-endian).

One datagram is a fixed 32-byte telemetry frame:

    offset  type  field
    0       u32   magic   0x4D365331 ("M6S1")
    4       u32   sequence
    8       i64   qpc
    16      f32   dx
    20      f32   dy
    24      f32   wheel     (raw counts: one wheel notch is +/-120)
    28      u16   mode      0 = off, 1 = rotate, 2 = translate
    30      u16   pad

The v1 magic (0x4D365330) put a boolean gate in the u16 at offset 28. It is
rejected so a stale capture build cannot be interpreted as a mode.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

MAGIC_V2 = 0x4D365331
MAGIC_V1 = 0x4D365330
DATA_SIZE = 32

MODE_OFF = 0
MODE_ROTATE = 1
MODE_TRANSLATE = 2

VALID_MODES = (MODE_OFF, MODE_ROTATE, MODE_TRANSLATE)

_FRAME = struct.Struct("<IIqfffHH")


@dataclass(frozen=True)
class Frame:
    sequence: int
    qpc: int
    dx: float
    dy: float
    wheel: float
    mode: int


def parse_frame(data: bytes | bytearray | memoryview) -> Frame | None:
    """Return a Frame for a valid v2 datagram, or None for anything else."""
    if data is None or len(data) < DATA_SIZE:
        return None

    magic, sequence, qpc, dx, dy, wheel, mode, _pad = _FRAME.unpack_from(data)
    if magic != MAGIC_V2:
        return None
    if mode not in VALID_MODES:
        return None

    return Frame(
        sequence=sequence,
        qpc=qpc,
        dx=float(dx),
        dy=float(dy),
        wheel=float(wheel),
        mode=int(mode),
    )

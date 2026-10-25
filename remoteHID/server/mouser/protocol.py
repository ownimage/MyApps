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

`--ping` sends a separate 16-byte probe

    0  u32  magic 0x50494E47 ("PING")
    4  u32  sequence
    8  i64  qpc

and expects the same 16 bytes back with the magic rewritten to PONG
(0x504F4E47). `mouser-capture --recv` has always answered that; the server
answers it too now, so `mouser-capture --ping --udp <server>:7801` is a real
one-way reachability test for the machine that actually injects the keys.
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

# The `--ping` probe (see the module docstring). Same numbers as the capture's
# Wire.MagicPing / MagicPong / PingSize in remoteHID/Mouser/capture/Net.cs.
MAGIC_PING = 0x50494E47
MAGIC_PONG = 0x504F4E47
PING_SIZE = 16

_PING_MAGIC = struct.Struct("<I")


def is_ping(data: bytes | bytearray | memoryview) -> bool:
    """True for a `--ping` probe datagram."""
    if data is None or len(data) < PING_SIZE:
        return False
    return _PING_MAGIC.unpack_from(data)[0] == MAGIC_PING


def is_pong(data: bytes | bytearray | memoryview) -> bool:
    """True for an already-answered probe (so two listeners cannot ping-pong)."""
    if data is None or len(data) < PING_SIZE:
        return False
    return _PING_MAGIC.unpack_from(data)[0] == MAGIC_PONG


def pong_reply(data: bytes | bytearray | memoryview) -> bytes:
    """The reply to a ping: the same 16 bytes with the magic swapped to PONG."""
    reply = bytearray(data[:PING_SIZE])
    _PING_MAGIC.pack_into(reply, 0, MAGIC_PONG)
    return bytes(reply)


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

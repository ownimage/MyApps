"""The Hid state machine: frame -> physical deltas -> key presses.

The engine owns no transport. The caller supplies `press_key(key_string)` (the
server's fast injection path) and feeds frames from the UDP receiver.
"""

from __future__ import annotations

import threading
import time
from collections import deque

from .axes import AXES, AxisModel, build_axes
from .protocol import MODE_OFF, MODE_ROTATE, MODE_TRANSLATE

# Fixed physical -> logical map for v1. dx/dy are mouse counts; wheel is raw
# rolling counts (+/-120 per notch).
MODE_AXES = {
    MODE_ROTATE: (("ry", "dx"), ("rx", "dy"), ("rz", "wheel")),
    MODE_TRANSLATE: (("tx", "dx"), ("tz", "dy"), ("ty", "wheel")),
}


class HidEngine:
    def __init__(
        self,
        press_key,
        *,
        max_presses_per_frame: int = 3,
        min_press_interval_ms: float = 10.0,
    ) -> None:
        self._press_key = press_key
        self._max_presses = max(1, int(max_presses_per_frame))
        self._min_interval_s = max(0.0, float(min_press_interval_ms) / 1000.0)

        self._lock = threading.Lock()
        self._axes: dict[str, AxisModel] = build_axes(None)
        self._mode = MODE_OFF
        self._profile_enabled = False
        self._global_enabled = True
        self._app: str | None = None
        self._layout_key: str | None = None
        self._warned: set[str] = set()
        self._recent_presses: deque[float] = deque(maxlen=200)

    # -- profile ---------------------------------------------------------

    def set_profile(
        self,
        layout: dict | None,
        *,
        app_name: str | None = None,
        global_enabled: bool | None = None,
    ) -> None:
        with self._lock:
            if global_enabled is not None:
                self._global_enabled = bool(global_enabled)

            block = (layout or {}).get("hid") or (layout or {}).get("mouser") or {}
            self._profile_enabled = bool(block.get("enabled"))
            self._axes = build_axes(block)
            self._app = app_name
            self._layout_key = (layout or {}).get("key")
            self._mode = MODE_OFF
            self._recent_presses.clear()

    def set_global_enabled(self, enabled: bool) -> None:
        with self._lock:
            self._global_enabled = bool(enabled)

    # -- input -----------------------------------------------------------

    def feed(self, frame, now: float | None = None) -> list[str]:
        """Feed one frame; return the key strings that were pressed."""
        now = time.monotonic() if now is None else now
        emitted: list[str] = []

        with self._lock:
            if not self._enabled or frame.mode == MODE_OFF:
                self._mode = MODE_OFF
                for model in self._axes.values():
                    model.reset()
                return emitted

            if frame.mode != self._mode:
                for model in self._axes.values():
                    model.reset()
                self._mode = frame.mode

            for axis_name, source in MODE_AXES[frame.mode]:
                delta = float(getattr(frame, source))
                keys = self._axes[axis_name].feed(
                    delta,
                    now,
                    max_presses=self._max_presses,
                    min_interval_s=self._min_interval_s,
                )
                for key in keys:
                    ok = self._press_key(key)
                    if ok:
                        self._recent_presses.append(now)
                    elif key not in self._warned:
                        self._warned.add(key)
                    emitted.append(key)

        return emitted

    @property
    def _enabled(self) -> bool:
        return self._global_enabled and self._profile_enabled

    # -- diagnostics -----------------------------------------------------

    def snapshot(self, now: float | None = None) -> dict:
        now = time.monotonic() if now is None else now
        with self._lock:
            axes = {
                axis: {
                    "value": round(model.value, 3),
                    "acc": round(model.acc, 3),
                    "presses": model.presses,
                }
                for axis, model in self._axes.items()
            }
            # Presses in the last second across all axes (display only).
            recent = sum(1 for t in self._recent_presses if now - t <= 1.0)
            return {
                "mode": self._mode,
                "enabled": self._enabled,
                "app": self._app,
                "layout": self._layout_key,
                "axes": axes,
                "pressesPerSecond": recent,
            }

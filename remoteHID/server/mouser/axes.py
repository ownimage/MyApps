"""Per-axis ratchet model. Pure maths: no sockets, no Flask, no key injection.

`gain` is units per mouse count, `step` is units per key press, so a press
happens every `step / gain` counts. `value` is the total since the mode was
engaged (display only); `acc` is the unspent remainder.
"""

from __future__ import annotations

from dataclasses import dataclass, field

AXES = ("rx", "ry", "rz", "tx", "ty", "tz")

# Starting bindings: F13/F14 ... F23/F24 in axis order. The UI can change them.
DEFAULT_AXES = {
    "rx": {"positive": "F13", "negative": "F14", "gain": 0.05, "step": 5.0, "deadband": 0.0},
    "ry": {"positive": "F15", "negative": "F16", "gain": 0.05, "step": 5.0, "deadband": 0.0},
    "rz": {"positive": "F17", "negative": "F18", "gain": 0.05, "step": 5.0, "deadband": 0.0},
    "tx": {"positive": "F19", "negative": "F20", "gain": 0.0001, "step": 0.01, "deadband": 0.0},
    "ty": {"positive": "F21", "negative": "F22", "gain": 0.0001, "step": 0.01, "deadband": 0.0},
    "tz": {"positive": "F23", "negative": "F24", "gain": 0.0001, "step": 0.01, "deadband": 0.0},
}


@dataclass
class AxisModel:
    positive: str = ""
    negative: str = ""
    gain: float = 0.05
    step: float = 5.0
    deadband: float = 0.0

    acc: float = 0.0
    value: float = 0.0
    presses: int = 0
    last_press: float = field(default=float("-inf"), repr=False)

    def reset(self) -> None:
        self.acc = 0.0
        self.value = 0.0
        self.last_press = float("-inf")

    def feed(
        self,
        delta: float,
        now: float,
        *,
        max_presses: int = 3,
        min_interval_s: float = 0.010,
    ) -> list[str]:
        """Consume one frame's delta and return the key strings to press."""
        # A zero-delta frame must still drain steps left over from a capped or
        # interval-throttled frame; otherwise a fast flick loses the remainder
        # the moment the user stops moving.
        if delta and abs(delta) > self.deadband:
            self.value += delta * self.gain
            self.acc += delta * self.gain

        if self.acc == 0:
            return []

        sign = 1 if self.acc > 0 else -1
        # The epsilon keeps an exact step (5.0) from flooring to 4.999... .
        count = int(abs(self.acc) / self.step + 1e-9)
        if count <= 0:
            return []

        count = min(count, max(0, max_presses))
        if count <= 0:
            return []

        # Consume the steps even when the direction key is unbound, or an
        # unconfigured axis would accumulate forever and dump a burst later.
        key = self.positive if sign > 0 else self.negative

        # The flood guard: keep the steps in `acc` when the interval has not
        # elapsed, so they drain on the next frame instead of being dropped.
        if key and now - self.last_press < min_interval_s:
            return []

        self.acc -= sign * count * self.step

        if not key:
            return []

        self.last_press = now
        self.presses += count
        return [key] * count


def build_axes(mouser: dict | None) -> dict[str, AxisModel]:
    """Build all six models from a layout's `mouser` block (missing = defaults)."""
    axes_cfg = (mouser or {}).get("axes") or {}
    models: dict[str, AxisModel] = {}

    for axis in AXES:
        defaults = DEFAULT_AXES[axis]
        raw = axes_cfg.get(axis) or {}
        models[axis] = AxisModel(
            positive=_text(raw.get("positive"), defaults["positive"]),
            negative=_text(raw.get("negative"), defaults["negative"]),
            gain=_number(raw.get("gain"), defaults["gain"], minimum=1e-6),
            step=_number(raw.get("step"), defaults["step"], minimum=1e-6),
            deadband=_number(raw.get("deadband"), defaults["deadband"], minimum=0.0),
        )

    return models


def _text(value, default: str) -> str:
    if value is None:
        return default
    return str(value).strip()


def _number(value, default: float, *, minimum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number or number in (float("inf"), float("-inf")):
        return default
    return max(minimum, number)

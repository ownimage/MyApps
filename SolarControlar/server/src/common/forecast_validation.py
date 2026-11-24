"""Validate pipeline inputs without changing their persisted JSON schema."""
from datetime import datetime, timedelta
import math
import pytz


def number(value, context, nonnegative=True):
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or (nonnegative and value < 0)):
        raise ValueError(f"{context}: expected a finite {'non-negative ' if nonnegative else ''}number, got {value!r}")
    return value


def mapping(value, context):
    if not isinstance(value, dict):
        raise ValueError(f"{context}: expected a JSON object")
    return value


def day_slots(day, tz):
    start = tz.localize(datetime.combine(day, datetime.min.time())).astimezone(pytz.UTC)
    end = tz.localize(datetime.combine(day + timedelta(days=1), datetime.min.time())).astimezone(pytz.UTC)
    slots = set()
    while start < end:
        slots.add(start.astimezone(tz).strftime('%H:%M'))
        start += timedelta(minutes=30)
    return slots


def forecast_day(data, day, tz, context):
    mapping(data, context)
    if set(data) != day_slots(day, tz):
        raise ValueError(f"{context}: incomplete forecast for {day} ({len(data)} half-hours)")
    for slot, period in data.items():
        mapping(period, f"{context} {slot}")
        for key in ('pv_estimate', 'pv_estimate10', 'pv_estimate90'):
            number(period.get(key), f"{context} {slot} {key}")
    return data

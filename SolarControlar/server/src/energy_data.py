"""Bounded energy graph projections; never sum lifetime counters."""
import calendar
import math
from datetime import date, time

FIELDS = {'grid_import': 'grid_import_total', 'grid_export': 'grid_export_total',
          'ac_charge': 'ac_charge_total', 'solar': 'solar', 'usage': 'usage'}
MAX_COUNTER_CHANGE_KWH = 1000


def _period(period):
    if period not in ('day', 'month', 'year'):
        raise ValueError('period must be day, month or year')


def _rows(data):
    result = []
    if not isinstance(data, dict):
        return result
    for day, readings in data.items():
        try:
            if len(day) != 10 or date.fromisoformat(day).isoformat() != day:
                continue
        except (TypeError, ValueError):
            continue
        if not isinstance(readings, dict):
            continue
        for stamp, row in readings.items():
            try:
                parsed = time.fromisoformat(stamp)
                if parsed.tzinfo is not None:
                    continue
            except (TypeError, ValueError):
                continue
            if (isinstance(row, dict) and isinstance(row.get('usage_method'), str)
                    and row['usage_method'].strip() and isinstance(row.get('solar_method'), str)
                    and row['solar_method'].strip()):
                result.append((day, parsed, row))
    return sorted(result, key=lambda item: (item[0], item[1]))


def energy_values(data, period):
    _period(period)
    length = {'day': 10, 'month': 7, 'year': 4}[period]
    return sorted({day[:length] for day, _, _ in _rows(data)}, reverse=True)


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def _methods(row):
    return row['usage_method'], row['solar_method']


def _total(rows, field):
    if not rows or any(_methods(row) != _methods(rows[0]) for row in rows):
        return None
    values = [row.get(field) for row in rows if _number(row.get(field))]
    if len(values) < 2 or any(abs(round(b - a, 6)) > MAX_COUNTER_CHANGE_KWH for a, b in zip(values, values[1:])):
        return None
    return round(values[-1] - values[0], 6)


def energy_plot(data, period, value):
    _period(period)
    try:
        if period == 'day':
            parsed = date.fromisoformat(value)
            valid = parsed.isoformat() == value
        elif period == 'month':
            parsed = date.fromisoformat(value + '-01')
            valid = len(value) == 7 and parsed.strftime('%Y-%m') == value
        else:
            valid = len(value) == 4 and value.isascii() and value.isdigit() and 1 <= int(value) <= 9999
        if not valid:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('invalid value for the selected period') from None
    rows = [item for item in _rows(data) if item[0].startswith(value)]
    series = {key: [] for key in FIELDS}
    labels = []
    if period == 'day' and rows:
        baseline = rows[0][2]
        previous = {}
        broken = {key: False for key in FIELDS}
        buckets = {}
        for _, stamp, row in rows:
            bucket = (stamp.hour * 60 + stamp.minute) // 5
            for key, field in FIELDS.items():
                number = row.get(field)
                if _methods(row) != _methods(baseline) or (_number(number) and key in previous and abs(round(number - previous[key], 6)) > MAX_COUNTER_CHANGE_KWH):
                    broken[key] = True
                if _number(number):
                    previous[key] = number
            if bucket not in buckets:
                buckets[bucket] = {
                    key: round(row[field] - baseline[field], 6)
                    if not broken[key] and _number(row.get(field)) and _number(baseline.get(field)) else None
                    for key, field in FIELDS.items()
                }
        for bucket in range(min(buckets), max(buckets) + 1):
            labels.append(f'{bucket * 5 // 60:02}:{bucket * 5 % 60:02}')
            for key in FIELDS:
                series[key].append(buckets.get(bucket, {}).get(key))
    elif period in ('month', 'year'):
        count = calendar.monthrange(int(value[:4]), int(value[5:]))[1] if period == 'month' else 12
        for index in range(1, count + 1):
            label = f'{value}-{index:02}'
            labels.append(label)
            group = [row for day, _, row in rows if day.startswith(label)]
            for key, field in FIELDS.items():
                series[key].append(_total(group, field))
    return {'period': period, 'value': value, 'labels': labels, 'series': series}

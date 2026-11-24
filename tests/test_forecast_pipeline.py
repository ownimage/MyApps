"""Forecast regressions: synthetic stores, mocked HTTP, no inverter access."""
import copy
from datetime import datetime, timedelta, timezone
import math
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'SolarControlar/server/src'))
import pytz
from solar_forecast_generator import SolarForecastGenerator
from solarcontrolar.solcast import SolCast
from config_generator import ConfigGenerator
import forecast_pipeline
from calc_error import CalcError
from common.json_store import JsonStore
import tempfile
import json
import os


def store(data):
    result = Mock()
    result.read.return_value = copy.deepcopy(data)
    return result


def settings():
    result = Mock()
    result.timezone.return_value = pytz.timezone('Europe/London')
    result.battery_capacity_kwh.return_value = 9.6
    result.battery_min_kwh.return_value = 0.4
    result.min_charge_to_bias_kwh.return_value = -3
    result.max_charge_to_bias_kwh.return_value = -1
    result.usage_multiplier.return_value = 1.45
    result.solar_forecast_multiplier.return_value = 1
    return result


def day(value=1):
    return {f'{hour:02}:{minute:02}': dict(pv_estimate=value, pv_estimate10=value, pv_estimate90=value)
            for hour in range(24) for minute in (0, 30)}


class ForecastTests(unittest.TestCase):
    def generator(self, history=None):
        return SolarForecastGenerator(api_key='test', site_id='test', settings=settings(),
                                      forecast_history_store=store(history or {}))

    def payload(self, generator, values=None):
        start = generator.tomorrow
        return {'forecasts': [dict(period_end=(datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
                                  + timedelta(minutes=30 * (i + 1))).isoformat(), period='PT30M',
                                  **(values or dict(pv_estimate=1, pv_estimate10=0.5, pv_estimate90=2)))
                              for i in range(48)]}

    def test_empty_and_partial_cached_forecasts_are_retried(self):
        generator = self.generator()
        for cached in ({}, {'12:00': day()['12:00']}):
            self.assertFalse(generator.check_already_exists({generator.tomorrow_key: cached}))

    def test_complete_cached_forecast_is_kept(self):
        generator = self.generator()
        self.assertTrue(generator.check_already_exists({generator.tomorrow_key: day()}))

    def test_invalid_cached_numbers_are_retried(self):
        generator = self.generator()
        self.assertFalse(generator.check_already_exists({generator.tomorrow_key: day(float('nan'))}))

    def test_utc_period_start_is_converted_to_local_summer_time(self):
        generator = self.generator()
        # Derive a summer day from the runtime year, independent of today's season.
        generator.tomorrow = generator.tomorrow.replace(month=7, day=15)
        generator.tomorrow_key = generator.tomorrow.isoformat()
        midnight = datetime.combine(generator.tomorrow, datetime.min.time(), tzinfo=timezone.utc)
        payload = {'forecasts': [dict(period_end=(midnight - timedelta(minutes=30)).isoformat(),
                                      period='PT30M', pv_estimate=1, pv_estimate10=0.5, pv_estimate90=2)]}
        self.assertIn('00:00', generator.half_hourly_forecast(payload)[generator.tomorrow_key])

    def test_empty_response_does_not_poison_history(self):
        generator = self.generator()
        with patch.object(generator, 'fetch_forecast', return_value={'forecasts': []}):
            with self.assertRaisesRegex(ValueError, 'forecast|Forecast'):
                generator.run()
        generator.forecast_history_store.write.assert_not_called()

    def test_invalid_api_values_name_the_field(self):
        for value in (None, 'bad', float('nan'), -1, True):
            with self.subTest(value=value):
                generator = self.generator()
                payload = self.payload(generator, dict(pv_estimate=value, pv_estimate10=0.5, pv_estimate90=2))
                with self.assertRaisesRegex(ValueError, 'pv_estimate'):
                    generator.half_hourly_forecast(payload)

    def test_missing_forecasts_has_actionable_error(self):
        with self.assertRaisesRegex(ValueError, 'forecasts'):
            self.generator().half_hourly_forecast({})

    def test_non_half_hour_response_rejected(self):
        generator = self.generator()
        payload = self.payload(generator)
        payload['forecasts'][0]['period'] = 'PT60M'
        with self.assertRaisesRegex(ValueError, 'period'):
            generator.half_hourly_forecast(payload)

    def test_explicit_refresh_replaces_forecast_and_preserves_other_days(self):
        generator = self.generator()
        other = (generator.tomorrow - timedelta(days=1)).isoformat()
        generator.forecast_history_store.read.return_value = {other: day(2), generator.tomorrow_key: day(0)}
        with patch.object(generator, 'fetch_forecast', return_value=self.payload(generator)) as fetch:
            generator.run(refresh=True)
        fetch.assert_called_once()
        written = generator.forecast_history_store.write.call_args.args[0]
        self.assertEqual(written[other], day(2))
        self.assertEqual(set(written[generator.tomorrow_key]['12:00']), {'pv_estimate', 'pv_estimate10', 'pv_estimate90'})

    def test_solcast_failures_are_standard_exceptions_and_bounded(self):
        with patch('solarcontrolar.solcast.requests.get') as get:
            get.return_value.status_code = 429
            get.return_value.text = 'quota exhausted'
            try:
                SolCast('test', 'test').forecast()
            except Exception as error:
                self.assertIn('429', str(error))
            else:
                self.fail('HTTP failure was swallowed')
            self.assertIn('timeout', get.call_args.kwargs)

    def test_stage_three_uses_settings_written_by_stage_two(self):
        with patch.object(forecast_pipeline, 'Settings', side_effect=settings), \
             patch.object(forecast_pipeline, 'SolarForecastGenerator'), \
             patch.object(forecast_pipeline, 'CalcError'), \
             patch.object(forecast_pipeline, 'ConfigGenerator') as config:
            forecast_pipeline.run()
        self.assertIn('settings', config.call_args.kwargs)

    def test_bad_usage_rejected_before_config_write(self):
        tomorrow = (datetime.now(settings().timezone()) + timedelta(days=1)).date()
        usage_day = (tomorrow - timedelta(days=7)).isoformat()
        config = store({'charge_to_percentage': 73})
        generator = ConfigGenerator(settings=settings(), solar_forecast_store=store({tomorrow.isoformat(): day()}),
                                    usage_forecast_store=store({}), usage_actuals_store=store({usage_day: {'05:00': None}}),
                                    config_store=config)
        with self.assertRaisesRegex(ValueError, 'usage_actuals.*05:00'):
            generator.run()
        config.write.assert_not_called()


class CalibrationTests(unittest.TestCase):
    def calibration(self):
        config = settings()
        config.read.return_value = {'solar_forecast_multiplier': 0.75}
        calc = CalcError(forecast_store=store({}), actuals_store=store({}), settings_store=config, days=0)
        key = calc.end_date.isoformat()
        calc.forecast_data = {key: day()}
        calc.actuals_data = {key: {slot: 0.5 for slot in day()}}
        return calc, config, key

    def test_complete_matching_periods_calibrate(self):
        calc, config, key = self.calibration()
        calc.run()
        config.write.assert_called_once_with({'solar_forecast_multiplier': 1.0})

    def test_same_count_with_different_periods_does_not_calibrate(self):
        calc, config, key = self.calibration()
        calc.actuals_data[key]['05:01'] = calc.actuals_data[key].pop('05:00')
        calc.run()
        config.write.assert_not_called()

    def test_spring_clock_change_is_a_complete_46_period_day(self):
        calc, config, key = self.calibration()
        # Find a short London day in a runtime-derived year.
        date = calc.end_date.replace(month=3, day=1)
        while date.weekday() != 6 or (date + timedelta(days=7)).month == 3:
            date += timedelta(days=1)
        calc.start_date = calc.end_date = date
        slots = {slot: period for slot, period in day().items() if slot not in ('01:00', '01:30')}
        calc.forecast_data = {date.isoformat(): slots}
        calc.actuals_data = {date.isoformat(): {slot: 0.5 for slot in slots}}
        calc.run()
        config.write.assert_called_once()

    def test_invalid_actual_names_file_and_period(self):
        calc, config, key = self.calibration()
        calc.actuals_data[key]['05:00'] = None
        with self.assertRaisesRegex(ValueError, 'solar_actuals.*05:00'):
            calc.run()
        config.write.assert_not_called()

    def test_invalid_json_reports_line_and_column(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'broken.json'
            path.write_text('{\n  "value": invalid\n}', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, r'broken.json.*line 2.*column'):
                JsonStore(str(path)).read()

    def test_failed_json_write_preserves_previous_document(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            path.write_text('{"charge_to_percentage": 73}', encoding='utf-8')
            previous = path.read_bytes()
            with self.assertRaises((ValueError, TypeError)):
                JsonStore(str(path)).write({'charge_to_percentage': object()})
            self.assertEqual(path.read_bytes(), previous)

    def test_nan_cannot_be_written_as_invalid_json(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                JsonStore(str(Path(directory) / 'config.json')).write({'charge_to_percentage': float('nan')})

    def test_pipeline_end_to_end_uses_new_calibration_and_keeps_json_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            cwd = Path.cwd()
            try:
                os.chdir(directory)
                today = datetime.now(settings().timezone()).date()
                tomorrow = today + timedelta(days=1)
                options = dict(timezone='Europe/London', battery_capacity_kWh=9.6, battery_min_kWh=0.4,
                               min_charge_to_bias_kwh=-3, max_charge_to_bias_kwh=-1,
                               usage_multiplier=1.45, solar_forecast_multiplier=0.75, forecast_error_window=3)
                forecast = {(today - timedelta(days=i)).isoformat(): day() for i in range(1, 5)}
                actuals = {key: {slot: 0.6 for slot in day()} for key in forecast}
                forecast[tomorrow.isoformat()] = day(0.4)
                for name, data in (('settings.json', options), ('solar_forecast_history.json', forecast),
                                   ('solar_actuals.json', actuals), ('config.json', {'charge_to_percentage': 73, 'other': 'keep'})):
                    JsonStore(name).write(data)
                with patch('solar_forecast_generator.SolCast') as api:
                    forecast_pipeline.run()
                api.assert_not_called()
                calibrated = JsonStore('settings.json').read()
                self.assertAlmostEqual(calibrated['solar_forecast_multiplier'], 1.2)
                result = JsonStore('config.json').read()
                expected = int((9.6 - (-1 + 23 * 0.4 * calibrated['solar_forecast_multiplier'] / 2)) * 100 / 9.6)
                self.assertEqual(result, {'charge_to_percentage': expected, 'other': 'keep'})
                self.assertEqual(JsonStore('solar_forecast_history.json').read(), forecast)
            finally:
                os.chdir(cwd)


if __name__ == '__main__':
    unittest.main()

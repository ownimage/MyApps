import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'SolarControlar' / 'server' / 'src'))
from energy_data import energy_values, energy_plot


def row(n, **changes):
    result = dict(usage_method='givtcp_dc_hybrid_v2', solar_method='pv_ir11_12_v1',
                  grid_import_total=100+n, grid_export_total=200+n,
                  ac_charge_total=300+n, solar=400+n, usage=500+n)
    result.update(changes)
    return result


class EnergyTests(unittest.TestCase):
    def test_values_exclude_legacy_invalid_dates_and_missing_tags(self):
        data = {'2026-01-01': {'00:00:00': row(0)},
                '2026-02-01': {'00:00:00': row(1, solar_method='')},
                '2025-12-31': {'23:59:00': row(2)},
                'bad': {'00:00:00': row(1)}}
        self.assertEqual(energy_values(data, 'day'), ['2026-01-01', '2025-12-31'])
        self.assertEqual(energy_values(data, 'month'), ['2026-01', '2025-12'])
        self.assertEqual(energy_values(data, 'year'), ['2026', '2025'])

    def test_day_has_at_most_288_points_and_zero_baseline(self):
        day = {f'{m//60:02}:{m%60:02}:00': row(m) for m in range(1440)}
        plot = energy_plot({'2026-01-01': day}, 'day', '2026-01-01')
        self.assertEqual(len(plot['labels']), 288)
        for values in plot['series'].values():
            self.assertEqual(values[:2], [0, 5])
            self.assertEqual(values[-1], 1435)

    def test_daily_totals_are_differences_not_summed_counters(self):
        data = {'2026-02-01': {'00:00:00': row(2), '23:59:00': row(9)},
                '2026-02-02': {'00:00:00': row(9), '23:59:00': row(20)},
                '2026-03-01': {'00:00:00': row(999)}}
        plot = energy_plot(data, 'month', '2026-02')
        self.assertEqual(len(plot['labels']), 28)
        self.assertEqual(plot['series']['usage'][:3], [7, 11, None])
        self.assertEqual(energy_plot(data, 'year', '2026')['series']['solar'][:3], [None, 18, None])
        self.assertEqual(len(energy_plot(data, 'year', '2026')['labels']), 12)

    def test_day_missing_bins_and_invalid_counters_are_gaps(self):
        data = {'2026-01-01': {'00:00:00': row(0), '00:10:00': row(5, ac_charge_total=None)}}
        plot = energy_plot(data, 'day', '2026-01-01')
        self.assertEqual(plot['series']['solar'], [0, None, 5])
        self.assertEqual(plot['series']['ac_charge'], [0, None, None])

    def test_resets_and_method_transitions_do_not_create_false_totals(self):
        for last in [row(999), row(2004, usage_method='different')]:
            data = {'2026-01-01': {'00:00:00': row(2000), '00:05:00': last}}
            self.assertIsNone(energy_plot(data, 'day', '2026-01-01')['series']['solar'][-1])
            self.assertIsNone(energy_plot(data, 'month', '2026-01')['series']['solar'][0])

    def test_usage_anomaly_does_not_break_later_day_month_or_year_values(self):
        data = {'2026-01-01': {'00:00:00': row(0),
                '00:05:00': row(1, usage=499.9), '00:10:00': row(2, usage=505.3)}}
        self.assertEqual(energy_plot(data, 'day', '2026-01-01')['series']['usage'], [0,-0.1,5.3])
        for period, value in [('month','2026-01'),('year','2026')]:
            self.assertEqual(energy_plot(data, period, value)['series']['usage'][0], 5.3)

    def test_only_changes_strictly_over_1000_kwh_break_a_series(self):
        for change in [-1000.1,-1000,-0.1,0.1,1000,1000.1]:
            data = {'2026-01-01': {'00:00:00': row(2000), '00:05:00': row(2000+change)}}
            for period, value, index in [('day','2026-01-01',1),('month','2026-01',0),('year','2026',0)]:
                for series in energy_plot(data, period, value)['series'].values():
                    with self.subTest(change=change,period=period):
                        if abs(change)>1000:
                            self.assertIsNone(series[index])
                        else:
                            self.assertIsNotNone(series[index])
                            self.assertAlmostEqual(series[index],change)

    def test_validation_and_empty_history(self):
        self.assertEqual(energy_values({}, 'day'), [])
        self.assertEqual(energy_plot({}, 'day', '2026-01-01')['labels'], [])
        for period, value in [('week', '2026-01-01'), ('day', '../x'), ('month', '2026-13'), ('year', 'abc')]:
            with self.assertRaises(ValueError): energy_plot({}, period, value)

class EnergyRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import builtins
        import io
        from unittest.mock import patch
        original_open = builtins.open
        def safe_open(file, *args, **kwargs):
            if Path(file).name == '.secret_key':
                return io.StringIO('isolated-test-key')
            return original_open(file, *args, **kwargs)
        with patch('builtins.open', side_effect=safe_open):
            import flask_app
        cls.server = flask_app
        cls.client = flask_app.app.test_client()

    def test_routes_filter_history_and_bound_payloads_under_proxy_prefix(self):
        from unittest.mock import patch
        history = {'2026-01-01': {f'{m//60:02}:{m%60:02}:00': row(m) for m in range(1440)},
                   '2025-12-31': {'00:00:00': row(0, solar_method=None)}}
        with patch.object(self.server, '_energy_history', return_value=history):
            for prefix in ('', '/solar'):
                response = self.client.get(prefix+'/api/energy_values?period=day')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json, {'period':'day','values':['2026-01-01']})
                response = self.client.get(prefix+'/api/energy_data?period=day&value=2026-01-01')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(response.json['labels']), 288)
                self.assertEqual(set(response.json), {'period','value','labels','series'})
                self.assertEqual(len(response.json['series']), 5)
                self.assertEqual(response.json['series']['usage'][:2], [0,5])
                for period, value, count in [('month','2026-01',31),('year','2026',12)]:
                    grouped=self.client.get(prefix+'/api/energy_data?period='+period+'&value='+value)
                    self.assertEqual(grouped.status_code,200)
                    self.assertEqual(len(grouped.json['labels']),count)
                    self.assertEqual(grouped.json['series']['usage'][0],1439)
                    self.assertTrue(all(v is None for v in grouped.json['series']['usage'][1:]))

    def test_bad_query_does_not_read_history_and_read_failure_is_safe(self):
        from unittest.mock import patch
        with patch.object(self.server, '_energy_history') as read:
            for query in ('period=week&value=x', 'period=day&value=../x', 'period=month&value=2026-13'):
                self.assertEqual(self.client.get('/solar/api/energy_data?'+query).status_code, 400)
            self.assertEqual(self.client.get('/solar/api/energy_values?period=week').status_code, 400)
            read.assert_not_called()
        with patch.object(self.server, '_energy_history', side_effect=OSError('private path')):
            response=self.client.get('/solar/api/energy_values?period=day')
            self.assertEqual(response.status_code,500)
            self.assertNotIn('private path',response.get_data(as_text=True))

    def test_history_loader_uses_only_the_energy_file_and_handles_missing_history(self):
        import json
        from unittest.mock import mock_open, patch
        history={'2026-01-01':{'00:00:00':row(0)}}
        reader=mock_open(read_data=json.dumps(history))
        with patch('builtins.open', reader):
            self.assertEqual(self.server._energy_history(),history)
        self.assertEqual(Path(reader.call_args.args[0]).name,'minute_totals.json')
        with patch('builtins.open',side_effect=FileNotFoundError):
            self.assertEqual(self.server._energy_history(),{})

if __name__ == '__main__': unittest.main()

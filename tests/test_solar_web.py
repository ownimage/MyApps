"""Isolated Flask web delivery tests and browser fixture; no operational data."""
import builtins
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'SolarControlar/server/src'))
original_open = builtins.open

def safe_open(file, *args, **kwargs):
    if Path(file).name == '.secret_key':
        return io.StringIO('isolated-web-test-key')
    return original_open(file, *args, **kwargs)

with patch('builtins.open', side_effect=safe_open):
    import flask_app as server

class SolarWebTests(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()

    def test_root_uses_shared_frontend_and_explicit_server_context(self):
        with patch.object(server, 'load_settings') as settings:
            for path in ('/', '/solar/', '/solar/ui/SolarControlar/'):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                body = response.get_data(as_text=True)
                self.assertTrue('<smd-tabs id="mainTabs"' in body, 'shared dashboard is missing')
                self.assertIn('name="solar-server-base" content="/solar"', body)
                self.assertIn('<base href="/solar/ui/SolarControlar/">', body)
                self.assertIn('no-cache', response.headers['Cache-Control'])
            settings.assert_not_called()

    def test_forwarded_prefix_is_used_for_frontend_and_api_context(self):
        response = self.client.get('/energy/', headers={'X-Forwarded-Prefix': '/energy'})
        body = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn('<base href="/energy/ui/SolarControlar/">', body)
        self.assertIn('name="solar-server-base" content="/energy"', body)

    def test_only_public_frontend_assets_are_exposed(self):
        for path in ('SolarControlar/js/app.js', 'SolarControlar/manifest.json',
                     'SolarControlar/icon.svg', 'shared/css/styles.css',
                     'shared/js/build-number.js', 'shared/vendor/bootstrap-icons.css'):
            with self.subTest(path=path):
                response = self.client.get('/solar/ui/' + path)
                self.assertEqual(response.status_code, 200)
                response.close()
        for path in ('SolarControlar/server/settings.json', 'SolarControlar/server/.secret_key',
                     'SolarControlar/AGENTS.md', 'shared/../AGENTS.md',
                     'SolarControlar/js/../../server/settings.json', '../AGENTS.md'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get('/solar/ui/' + path).status_code, 404)

    def test_dashboard_data_contains_only_public_settings_and_config(self):
        with patch.object(server, 'load_settings', return_value={'tolerance_percent': 0.8, 'secret':'private'}), \
             patch.object(server, 'load_config', return_value={'charge_to_percentage': 73, 'secret':'private'}):
            response = self.client.get('/solar/api/dashboard')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['config'], {'charge_to_percentage':73})
            field = next(f for f in response.json['settings'] if f['key'] == 'tolerance_percent')
            self.assertEqual(field['value'], 0.8)
            self.assertNotIn('private', response.get_data(as_text=True))

    def test_existing_settings_and_config_posts_are_preserved(self):
        with patch.object(server, 'load_settings', return_value={}), \
             patch.object(server, 'save_settings') as save:
            response = self.client.post('/solar/', data={'tolerance_percent': '0.8'})
            self.assertEqual(response.status_code, 302)
            self.assertEqual(save.call_args.args[0]['tolerance_percent'], 0.8)
        with patch.object(server, 'load_config', return_value={}), \
             patch.object(server, 'save_config') as save:
            response = self.client.post('/solar/api/config', data={'charge_to_percentage': '73'})
            self.assertEqual(response.status_code, 302)
            self.assertEqual(save.call_args.args[0]['charge_to_percentage'], 73)

def serve_fixture():
    from werkzeug.serving import make_server
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        settings = folder / 'settings.json'
        config = folder / 'config.json'
        power = folder / 'minute_power.json'
        settings.write_text(json.dumps({'timezone':'Europe/London', 'tolerance_percent':0.8}))
        config.write_text(json.dumps({'charge_to_percentage':73}))
        from datetime import date
        power.write_text(json.dumps({date.today().isoformat(): {'08:00:00': {
            'solar':300, 'grid':300, 'home':500, 'battery':200, 'battery_level':50}}}))
        with patch.object(server, 'SETTINGS_FILE', str(settings)), \
             patch.object(server, 'CONFIG_FILE', str(config)), \
             patch.object(server, 'POWER_FILE', str(power)), \
             patch.object(server, '_energy_history', return_value={}), \
             patch.object(server, 'FILES', {'config_apply': str(folder / 'missing.log')}):
            http = make_server('127.0.0.1', 0, server.app, threaded=True)
            print('SOLAR_TEST_URL=http://127.0.0.1:' + str(http.server_port), flush=True)
            http.serve_forever()

if __name__ == '__main__':
    if '--serve' in sys.argv:
        serve_fixture()
    else:
        unittest.main()

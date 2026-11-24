import logging
import os
from datetime import datetime, timedelta

import pytz

from solarcontrolar.solcast import SolCast
from common.json_store import JsonStore
from filenames import Filenames
from settings import Settings
from common.forecast_validation import forecast_day, mapping, number

logger = logging.getLogger(__name__)


class SolarForecastGenerator:
    LOCAL_TZ = pytz.timezone('Europe/London')

    def __init__(self, api_key: str = None, site_id: str = None,
                 forecast_history_store=JsonStore(Filenames.SOLAR_FORECAST_FILE.value),
                 settings=None,
                 os=os,
                 datetime=datetime,
                 timedelta=timedelta
                 ):
        self.api_key = api_key or os.getenv("SOLCAST_API_KEY")
        self.site_id = site_id or os.getenv("SOLCAST_SITE_ID")
        settings = settings if settings is not None else Settings()
        self.timezone = settings.timezone()
        self.tomorrow = (datetime.now(self.timezone) + timedelta(days=1)).date()
        self.tomorrow_key = self.tomorrow.isoformat()
        self.forecast_history_store = forecast_history_store

    # TODO need to be able to inject SolCast
    def fetch_forecast(self):
        logger.debug("Fetching SolCast forecast")
        solcast = SolCast(self.api_key, self.site_id)
        forecast = solcast.forecast()
        if isinstance(forecast, dict) and isinstance(forecast.get("forecasts"), list):
            logger.debug("SolCast returned %d forecast entries", len(forecast["forecasts"]))
        else:
            logger.debug("SolCast response did not contain a forecasts list: %r", type(forecast).__name__)
        return forecast

    def check_already_exists(self, forecast) -> bool:
        mapping(forecast, "solar_forecast_history.json")
        try:
            forecast_day(forecast.get(self.tomorrow_key), self.tomorrow, self.timezone,
                         "solar_forecast_history.json")
        except ValueError:
            return False
        return True

    def half_hourly_forecast(self, data):
        hh = {}
        mapping(data, "Solcast response")
        if not isinstance(data.get('forecasts'), list):
            raise ValueError("Solcast response: expected a forecasts list")
        for index, entry in enumerate(data['forecasts']):
            context = f"Solcast forecasts[{index}]"
            mapping(entry, context)
            if entry.get('period') != 'PT30M':
                raise ValueError(f"{context}: expected period PT30M")
            try:
                end = datetime.fromisoformat(entry['period_end'].replace('Z', '+00:00'))
                if end.tzinfo is None:
                    raise ValueError("missing timezone")
                dt = (end.astimezone(pytz.UTC) - timedelta(minutes=30)).astimezone(self.timezone)
                if dt.minute not in (0, 30) or dt.second or dt.microsecond:
                    raise ValueError("not a half-hour boundary")
            except (KeyError, AttributeError, TypeError, ValueError) as error:
                raise ValueError(f"{context}: invalid period_end") from error
            for key in ('pv_estimate', 'pv_estimate10', 'pv_estimate90'):
                number(entry.get(key), f"{context} {key}")
            if dt.date() == self.tomorrow:
                hh[dt.strftime("%H:%M")] = {
                    'pv_estimate': entry['pv_estimate'],
                    'pv_estimate10': entry['pv_estimate10'],
                    'pv_estimate90': entry['pv_estimate90'],
                }
        logger.debug("Extracted %d half-hour periods for %s", len(hh), self.tomorrow_key)
        if hh:
            daily_total = sum(period["pv_estimate"] for period in hh.values())
            logger.debug("Raw pv_estimate total for %s: %.2f kW (kWh/day = %.2f)",
                         self.tomorrow_key, daily_total, daily_total * 0.5)
        return {self.tomorrow_key: hh}

    def run(self, refresh=False):
        forecast_history = self.forecast_history_store.read()
        mapping(forecast_history, "solar_forecast_history.json")
        logger.debug("Forecast history contains %d days", len(forecast_history))
        if refresh or not self.check_already_exists(forecast_history):
            logger.info("Fetching %s forecast from Solcast%s", self.tomorrow_key, " (refresh requested)" if refresh else "")
            new_forecast = self.fetch_forecast()
            tomorrow_hh = self.half_hourly_forecast(new_forecast)
            forecast_day(tomorrow_hh[self.tomorrow_key], self.tomorrow, self.timezone,
                         "Solcast forecast")
            self.forecast_history_store.write({**forecast_history, **tomorrow_hh})
            logger.info("Wrote forecast for %s to %s",
                        self.tomorrow_key, Filenames.SOLAR_FORECAST_FILE.value)
        else:
            logger.debug("Skipping SolCast fetch, forecast for %s already stored", self.tomorrow_key)


if __name__ == '__main__':
    from common.logging_setup import setup_logging
    setup_logging()
    manager = SolarForecastGenerator()
    manager.run()

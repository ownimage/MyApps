import argparse
import logging
import sys
from datetime import datetime

from common.logging_setup import setup_logging

setup_logging(stream=sys.stdout)

from solar_forecast_generator import SolarForecastGenerator
from calc_error import CalcError
from config_generator import ConfigGenerator
from settings import Settings

logger = logging.getLogger(__name__)


def run(refresh=False):
    print("=" * 60)
    now = datetime.now(Settings().timezone())
    logger.info("forecast pipeline: start")
    print(f"forecast pipeline run at: {now.strftime('%Y-%m-%d %H:%M:%S %Z (%z)')}")
    logger.info("stage 1/3: fetching solar forecast for tomorrow")
    SolarForecastGenerator().run(refresh=refresh)

    logger.info("stage 2/3: comparing recent forecasts with actuals")
    CalcError(days=Settings().forecast_error_window()).run()

    logger.info("stage 3/3: working out battery charge level for tomorrow")
    ConfigGenerator(settings=Settings()).run()

    logger.info("forecast pipeline: complete")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Generate tomorrow's battery charge target")
    parser.add_argument('--refresh', action='store_true', help='Fetch a fresh forecast even when tomorrow is cached')
    run(refresh=parser.parse_args().refresh)

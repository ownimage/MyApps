# SolarControlar contributor guidance

Read ../AGENTS.md for repository-wide rules and ../AGENTS-solar.md for the focused frontend guide. Backend-specific architecture and hardware safety rules are in server/AGENTS.md.

## Server test ownership and execution

The backend source is in SolarControlar/server/src. Its two top-level unit-test files belong in the MAIN repository tests directory, not SolarControlar/server/tests:

- tests/test_battery_flags.py (8 tests)
- tests/test_metering.py (21 tests)

Paths above are relative to the MyApps repository root. Keep these as the single copies; do not recreate duplicate tests under server/tests.

tests/solarcontrolar-server.spec.js runs both files through Python unittest as part of the normal Playwright chromium project. No extra playwright.config.js registration is necessary: the existing *.spec.js discovery picks up the wrapper. Run from the MyApps root:

    .\node_modules\.bin\playwright.cmd test tests/solarcontrolar-server.spec.js --workers=2 --retries=0

A normal npm test also includes them. Each Python module is a separate Playwright result; verbose unittest output is attached to the report on success or failure. Python failures, missing dependencies and zero collected cases fail rather than silently skipping.

The wrapper uses SOLARCONTROLAR_PYTHON if set, otherwise server/venv/Scripts/python.exe on Windows (venv/bin/python elsewhere), then py -3.13 on Windows or python3 elsewhere. Install server/requirements.txt into the selected environment. The supplied server venv was verified with Python 3.13.3.

The relocated files resolve imports from SolarControlar/server/src relative to their own paths. The wrapper uses a fresh working directory under the Playwright test output, suppresses bytecode, and bounds each Python process. Metering JSON stores use TemporaryDirectory; inverter transports and locks are mocked. Do not start Flask, cron, forecast_pipeline, config_apply, or live Modbus access to run these tests. Preserve the server's real JSON/log/configuration data and secrets.

## Verification (2026-11-11)

Both Playwright entries passed with retries disabled, running all 29 Python cases. Playwright --list confirmed exactly two chromium entries and no duplicate project execution. Test/documentation integration only; frontend build number unchanged.

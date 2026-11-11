// Python server unit tests participate in the ordinary Playwright run. No browser,
// Flask process, inverter connection or scheduled server job is started here.
const { test, expect } = require('@playwright/test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');
const localPython = path.join(root, 'SolarControlar', 'server', 'venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.SOLARCONTROLAR_PYTHON ||
  (fs.existsSync(localPython) ? localPython : process.platform === 'win32' ? 'py' : 'python3');
const prefix = !process.env.SOLARCONTROLAR_PYTHON && !fs.existsSync(localPython) && process.platform === 'win32' ? ['-3.13'] : [];

test.describe('SolarControlar server (Python)', () => {
  test.setTimeout(120000);
  for (const file of ['test_battery_flags.py', 'test_metering.py', 'test_kwh.py']) {
    test(file + ' passes', async ({}, testInfo) => {
      const cwd = testInfo.outputPath('python-work');
      fs.mkdirSync(cwd, { recursive: true });
      // An isolated working directory prevents relative JSON paths from touching
      // the imported server's operational data, even if future tests read files.
      const args = [...prefix, '-B', '-m', 'unittest', 'discover', '-s', __dirname, '-p', file, '-v'];
      let output;
      try {
        const result = await run(python, args, {
          cwd, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024,
          windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' }
        });
        output = result.stdout + result.stderr;
      } catch (error) {
        output = (error.stdout || '') + (error.stderr || '') + '\n' + error.message;
        await testInfo.attach('Python unittest output', { body: output, contentType: 'text/plain' });
        throw new Error(`${file} failed using ${python}. Install SolarControlar/server/requirements.txt in that environment or set SOLARCONTROLAR_PYTHON.\n${output}`);
      }
      await testInfo.attach('Python unittest output', { body: output, contentType: 'text/plain' });
      expect(output, 'unittest must collect and run tests').toMatch(/Ran [1-9]\d* tests?\b/);
      expect(output.trim()).toMatch(/\bOK$/);
      const summary = output.match(/Ran \d+ tests?[^\n]*/)?.[0];
      testInfo.annotations.push({ type: 'Python unittest', description: summary });
      process.stdout.write(`\n[solarcontrolar-server] ${file}: ${summary}\n`);
    });
  }
});

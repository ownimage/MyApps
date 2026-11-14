const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

async function startSolarWebServer() {
  const local = path.resolve(__dirname, '../SolarControlar/server/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.SOLARCONTROLAR_PYTHON || (fs.existsSync(local) ? local : process.platform === 'win32' ? 'py' : 'python3');
  const prefix = python === 'py' ? ['-3.13'] : [];
  const child = spawn(python, [...prefix, '-B', path.join(__dirname, 'test_solar_web.py'), '--serve'], {
    cwd: __dirname, windowsHide: true, env: {...process.env, PYTHONIOENCODING:'utf-8'}
  });
  let output = '';
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Flask fixture did not start: ' + output)), 20000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error('Flask fixture exited ' + code + ': ' + output)); });
      child.stderr.on('data', data => { output += data; });
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/SOLAR_TEST_URL=(http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    return {url, stop: () => new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve); child.kill();
    })};
  } catch (error) { child.kill(); throw error; }
}
module.exports = { startSolarWebServer };

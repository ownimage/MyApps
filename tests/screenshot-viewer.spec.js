const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../screenshots/viewer');

let root;
let server;
let baseUrl;

function write(relativePath) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from('synthetic'));
}

async function json(url) {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return response.json();
}

test.beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-viewer-'));
  [
    'pmd/alpha/light/scene.png',
    'pmd/alpha/dark/scene.png',
    'pmd/alpha/scene.png',
    'pmd/beta/light/scene-two.png',
    'cmd/alpha/light/scene.png',
    'cmd/alpha/dark/scene.png',
    'legacy/alpha/scene.png'
  ].forEach(write);
  server = createServer(root);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

test('scans both layouts and renders app, theme, and mode sections', async ({ page }) => {
  const galleries = await json(`${baseUrl}/api/galleries`);
  expect(galleries).toEqual([
    { id: 'pmd', label: 'Plan My Day' },
    { id: 'cmd', label: 'Count My Days' },
    { id: 'legacy', label: 'legacy' }
  ]);

  expect(await json(`${baseUrl}/api/themes?group=pmd`)).toEqual([
    {
      name: 'alpha',
      modes: [
        { name: 'light', path: 'pmd/alpha/light', images: ['scene.png'] },
        { name: 'dark', path: 'pmd/alpha/dark', images: ['scene.png'] }
      ]
    },
    {
      name: 'beta',
      modes: [
        { name: 'light', path: 'pmd/beta/light', images: ['scene-two.png'] }
      ]
    }
  ]);
  expect(await json(`${baseUrl}/api/themes?group=legacy`)).toEqual([
    {
      name: 'alpha',
      modes: [
        { name: 'default', path: 'legacy/alpha', images: ['scene.png'] }
      ]
    }
  ]);

  const imageResponse = await fetch(`${baseUrl}/pmd/alpha/light/scene.png`);
  expect(imageResponse.status).toBe(200);
  expect(imageResponse.headers.get('content-type')).toBe('image/png');

  await page.addInitScript(() => localStorage.setItem('screenshotViewerGallery', 'cmd'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl);
  await expect(page.locator('#appSelect')).toHaveValue('cmd');
  await expect(page.locator('#themeSelect option')).toHaveText(['All themes', 'alpha']);
  await expect(page.locator('#modeSelect option')).toHaveText(['All modes', 'Light', 'Dark']);
  await expect(page.locator('.mode-section')).toHaveCount(2);
  await expect(page.locator('.mode-section').first()).toContainText('Count My Days');
  await expect(page.locator('.mode-section').first()).toContainText('alpha');
  await expect(page.locator('.mode-section').first()).toContainText('Light');
  expect(await page.locator('.image-card img').first().getAttribute('src')).toContain('/cmd/alpha/light/scene.png');

  await page.locator('#themeSelect').selectOption('alpha');
  await page.locator('#modeSelect').selectOption('light');
  await expect(page.locator('.mode-section')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('screenshotViewerGallery'))).toBe('cmd');
  expect(await page.evaluate(() => localStorage.getItem('screenshotViewerTheme'))).toBe('alpha');
  expect(await page.evaluate(() => localStorage.getItem('screenshotViewerMode'))).toBe('light');

  await page.locator('.mode-section .theme-header').click();
  await expect(page.locator('.mode-section')).not.toHaveClass(/open/);
  await page.locator('#appSelect').selectOption('pmd');
  await expect(page.locator('.mode-section')).toHaveCount(1);
  await expect(page.locator('.mode-section')).toHaveClass(/open/);
  await page.locator('#appSelect').selectOption('cmd');
  await expect(page.locator('.mode-section')).toHaveCount(1);
  await expect(page.locator('.mode-section')).not.toHaveClass(/open/);

  await page.locator('#appSelect').selectOption('legacy');
  await expect(page.locator('#modeSelect option')).toHaveText(['All modes', 'Light', 'Dark', 'Default']);
  await expect(page.locator('.mode-section')).toHaveCount(1);
  await expect(page.locator('.mode-section')).toContainText('Default');
  expect(await page.locator('.image-card img').getAttribute('src')).toContain('/legacy/alpha/scene.png');
  expect(errors).toEqual([]);
});

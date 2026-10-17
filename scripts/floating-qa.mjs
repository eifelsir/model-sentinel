import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMockServer } from './mock-server.mjs';
import { verifyFloating } from './floating-checks.mjs';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-floating-'));
const fixture = await createMockServer();
const checks = [], errors = [];
let app;
try {
  await mkdir('artifacts/screenshots', { recursive: true });
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`] });
  let page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  checks.push(...await verifyFloating(page, {
    baseUrl: fixture.baseUrl,
    getFloating: async () => app.windows().find(window => window.url().includes('view=float')),
    screenshotPrefix: resolve('artifacts/screenshots/floating'),
  }));
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    const area = screen.getPrimaryDisplay().workArea;
    window.setPosition(area.x + 6, area.y + 100);
  });
  await expect.poll(async () => app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    return window.getBounds().x - screen.getPrimaryDisplay().workArea.x;
  })).toBe(0);
  const readPlacement = async () => {
    try { return JSON.parse(await readFile(join(profile, 'window.json'), 'utf8')); }
    catch { return {}; }
  };
  const edge = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea.x);
  await expect.poll(async () => (await readPlacement()).x).toBe(edge);
  const savedPlacement = await readPlacement();
  await page.evaluate(() => window.sentinel.expandFloat(true));
  const resized = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    window.setSize(520, 620);
    return window.getBounds();
  });
  await expect.poll(async () => (await readPlacement()).detailWidth).toBe(resized.width);
  await expect.poll(async () => (await readPlacement()).detailHeight).toBe(resized.height);
  await page.evaluate(() => window.sentinel.expandFloat(false));
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    const area = screen.getPrimaryDisplay().workArea;
    window.setPosition(area.x - 80, area.y - 80);
  });
  await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    const area = screen.getPrimaryDisplay().workArea;
    const { x, y } = window.getBounds();
    return { x: x - area.x, y: y - area.y };
  })).toEqual({ x: 0, y: 0 });
  await app.close(); app = null;
  app = await electron.launch({ args: [resolve('.'), `--profile=${profile}`] });
  page = await app.firstWindow();
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'))?.getBounds().x)).toBe(savedPlacement.x);
  await page.evaluate(() => window.sentinel.expandFloat(true));
  const restored = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float')).getBounds());
  expect(Math.abs(restored.width - resized.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(restored.height - resized.height)).toBeLessThanOrEqual(2);
  expect((await readPlacement()).detailWidth).toBe(resized.width);
  expect((await readPlacement()).detailHeight).toBe(resized.height);
  checks.push('native dragging snaps near screen edges and restores both compact location and resized details after restart');
  const floating = app.windows().find(window => window.url().includes('view=float'));
  await floating.getByRole('button', { name: '固定悬浮窗', exact: true }).click();
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    const area = screen.getPrimaryDisplay().workArea;
    window.setBounds({ x: area.x, y: area.y, width: area.width + 160, height: area.height + 100 });
  });
  await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const bounds = window.getBounds();
    return bounds.width <= area.width + 2 && bounds.height <= area.height + 2;
  })).toBe(true);
  await expect(floating.getByTestId('float-expanded')).toBeVisible();
  checks.push('oversized detail resizing is constrained to the work area while remaining expanded');
  expect(errors).toEqual([]);
  await writeFile('artifacts/floating-results.json', JSON.stringify({ passed: true, profile, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await writeFile('artifacts/floating-results.json', JSON.stringify({ passed: false, profile, checks, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  await app?.close();
  await fixture.close();
}

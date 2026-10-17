import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'model-sentinel-edge-'));
const checks = [], samples = [], errors = [];
let app;
const scaleArgs = process.env.SENTINEL_TEST_SCALE ? [`--force-device-scale-factor=${process.env.SENTINEL_TEST_SCALE}`] : [];
const launch = () => electron.launch(process.argv[2]
  ? { executablePath: resolve(process.argv[2]), args: [`--profile=${profile}`, ...scaleArgs] }
  : { args: [resolve('.'), `--profile=${profile}`, ...scaleArgs] });
const geometry = () => app.evaluate(({ BrowserWindow, screen }) => {
  const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
  return { bounds: window.getBounds(), content: window.getContentBounds(), area: screen.getDisplayMatching(window.getBounds()).workArea, scale: screen.getDisplayMatching(window.getBounds()).scaleFactor };
});
const placement = async () => {
  try { return JSON.parse(await readFile(join(profile, 'window.json'), 'utf8')); }
  catch { return {}; }
};

try {
  await mkdir('artifacts/screenshots', { recursive: true });
  app = await launch();
  let page = await app.firstWindow();
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.settings.autoRun = false;
    config.settings.floatVisible = true;
    config.connections = [{ id: 'local', name: 'Local', baseUrl: 'http://127.0.0.1:9', protocol: 'responses' }];
    config.prompts = [{ id: 'p', name: 'Text', prompt: '6*7?', expected: '42' }];
    config.targets = ['one', 'two'].map(id => ({ id, model: id, connectionId: 'local', promptIds: ['p'] }));
    await window.sentinel.saveConfig(config);
  });
  await expect.poll(() => app.windows().some(window => window.url().includes('view=float'))).toBe(true);
  let floating = app.windows().find(window => window.url().includes('view=float'));
  floating.on('pageerror', error => errors.push(error.message));
  await floating.mouse.move(-10, -10);

  // Repeated edge correction used to feed rounded native dimensions back into setPosition.
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    const area = screen.getPrimaryDisplay().workArea;
    window.setBounds({ x: area.x + area.width - 307, y: area.y + 101, width: 300, height: 190 });
  });
  await expect(floating.getByTestId('float-docked')).toBeVisible();
  const settled = await geometry();
  expect(settled.bounds.x + settled.bounds.width - settled.area.x - settled.area.width).toBeLessThanOrEqual(2);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.sentinel.setAuto(false));
    await page.waitForTimeout(220);
    const sample = await geometry();
    samples.push(sample);
    expect(Math.abs(sample.bounds.width - settled.bounds.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.bounds.height - settled.bounds.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.bounds.x - settled.bounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.bounds.y - settled.bounds.y)).toBeLessThanOrEqual(1);
  }
  checks.push('edge geometry stays stable under repeated state broadcasts at the native display scale');

  await expect(floating.getByTestId('float-docked')).toBeVisible();
  expect((await geometry()).bounds.width).toBeLessThanOrEqual(48);
  await expect(floating.getByRole('button', { name: '展开悬浮窗', exact: true })).toBeVisible();
  await floating.screenshot({ path: 'artifacts/screenshots/edge-docked.png' });
  await floating.getByTestId('float-docked').hover();
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  await floating.locator('.float-compact-row').first().hover();
  const restored = await geometry();
  await floating.waitForTimeout(900);
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  expect((await geometry()).bounds).toEqual(restored.bounds);
  await floating.screenshot({ path: 'artifacts/screenshots/edge-list.png' });
  await floating.mouse.move(-10, -10);
  await expect(floating.getByTestId('float-docked')).toBeVisible();
  checks.push('docking hides to a slim status strip and hovering restores a stable model list');

  for (let i = 0; i < 6; i++) {
    await floating.getByTestId('float-docked').hover();
    await expect(floating.getByTestId('float-compact')).toBeVisible();
    await floating.locator('.float-compact-row').first().click();
    await expect(floating.getByTestId('float-expanded')).toBeVisible();
    await floating.mouse.move(-10, -10);
    await floating.waitForTimeout(450);
    await expect(floating.getByTestId('float-expanded')).toBeVisible();
    await floating.keyboard.press('Escape');
    await expect(floating.getByTestId('float-docked')).toBeVisible();
  }
  const saved = await placement();
  expect(saved.edge).toBe('right');
  expect(saved.detailWidth || 460).toBeLessThanOrEqual(462);
  expect(saved.detailHeight || 580).toBeLessThanOrEqual(582);
  checks.push('repeated opening and closing preserves edge, detail size and pinned inspection');

  // Drag the revealed list back into the workspace; it must stop auto-hiding.
  await floating.getByTestId('float-docked').hover();
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
    const area = screen.getPrimaryDisplay().workArea;
    window.setBounds({ x: area.x + 301, y: area.y + 201, width: 300, height: 190 });
  });
  await floating.mouse.move(-10, -10);
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).floatEdge).toBe(null);
  await floating.waitForTimeout(700);
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  checks.push('dragging away from an edge restores the ordinary compact monitor');

  for (const edge of ['left', 'top', 'bottom', 'right']) {
    await app.evaluate(({ BrowserWindow, screen }, edge) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=float'));
      const area = screen.getPrimaryDisplay().workArea;
      window.setBounds({
        x: edge === 'left' ? area.x + 6 : edge === 'right' ? area.x + area.width - 306 : area.x + 401,
        y: edge === 'top' ? area.y + 6 : edge === 'bottom' ? area.y + area.height - 196 : area.y + 201,
        width: 300, height: 190,
      });
    }, edge);
    await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).floatEdge).toBe(edge);
    await expect(floating.getByTestId('float-docked')).toBeVisible();
    const result = await geometry();
    expect(Math.abs(edge === 'left' ? result.bounds.x - result.area.x
      : edge === 'right' ? result.bounds.x + result.bounds.width - result.area.x - result.area.width
        : edge === 'top' ? result.bounds.y - result.area.y
          : result.bounds.y + result.bounds.height - result.area.y - result.area.height)).toBeLessThanOrEqual(2);
    expect(edge === 'left' || edge === 'right' ? result.bounds.width : result.bounds.height).toBeLessThanOrEqual(48);
  }
  checks.push('all four display edges shrink in the correct direction without leaving the work area');
  await expect.poll(async () => (await placement()).edge).toBe('right');
  const beforeRestart = await geometry();
  await app.close(); app = null;
  app = await launch();
  page = await app.firstWindow();
  await expect(page.getByLabel('提示词', { exact: true })).toBeVisible();
  await expect.poll(() => app.windows().some(window => window.url().includes('view=float'))).toBe(true);
  floating = app.windows().find(window => window.url().includes('view=float'));
  await floating.mouse.move(-10, -10);
  await expect(floating.getByTestId('float-docked')).toBeVisible();
  expect((await geometry()).bounds).toEqual(beforeRestart.bounds);
  expect(errors).toEqual([]);
  checks.push('restarting restores the same dock and geometry without invoking a model endpoint');
  await writeFile('artifacts/float-edge-results.json', JSON.stringify({ passed: true, profile, checks, samples, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, scale: beforeRestart.scale }, null, 2));
} catch (error) {
  await writeFile('artifacts/float-edge-results.json', JSON.stringify({ passed: false, profile, checks, samples, errors, error: error.stack }, null, 2));
  throw error;
} finally {
  await app?.close();
}

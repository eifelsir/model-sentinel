import { expect } from '@playwright/test';
import { animation } from '../tests/fixtures/html-animation.mjs';

export function htmlReply({ body }) {
  const prompt = body.input || body.messages?.[0]?.content || '';
  if (prompt === 'candy-fixture') return '最少需要取出 **21 个**。\n因此答案为 \\boxed{21}。';
  if (prompt === 'svg-bad') return 'The HTML could not be completed.';
  if (prompt.startsWith('svg-fixture')) {
    const html = animation.replace('</body>', '<button id="change" onclick="document.querySelector(\'circle\').setAttribute(\'fill\',\'#167eac\')">换色</button></body>');
    return prompt.endsWith('alternate') ? `Here is the page:\n\`\`\`html\n${html}\n\`\`\`` : html;
  }
}

export async function verifyHtmlAndFloat(page, { baseUrl, requests, getFloating, screenshotPrefix }) {
  const checks = [];
  await expect(page.getByLabel('内置题目', { exact: true })).toBeVisible();
  await page.getByLabel('内置题目', { exact: true }).selectOption('builtin-candy');
  await expect(page.getByLabel('固定答案', { exact: true })).toHaveValue('21');
  await page.getByLabel('内置题目', { exact: true }).selectOption('builtin-svg-bicycle');
  await expect(page.getByLabel('题目类型')).toHaveValue('html');
  await expect(page.getByLabel('固定答案', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('不用skill的情况下生成html，内容是svg绘制猪八戒骑自行车2D动画，不要进行测试，不要读取我的记忆文件。');
  checks.push('built-in milk, candy and literal HTML prompts are selectable and HTML needs no fixed answer');
  await page.evaluate(async baseUrl => {
    const { config } = await window.sentinel.getState();
    config.settings.autoRun = false;
    config.settings.floatVisible = true;
    config.settings.answerJudgeTargetId = '';
    config.connections = [{ id: 'local-html', name: '1', baseUrl, apiKey: 'html-fixture-private-key', protocol: 'responses', models: [] }];
    config.prompts = [
      { id: 'text', type: 'text', name: '糖果题', prompt: 'candy-fixture', expected: '21', mode: 'auto', pattern: '' },
      { id: 'html', type: 'html', name: '动画一', prompt: 'svg-fixture', expected: '', mode: 'auto', pattern: '' },
      { id: 'html2', type: 'html', name: '动画二', prompt: 'svg-fixture-alternate', expected: '', mode: 'auto', pattern: '' },
    ];
    config.targets = [
      { id: 'text-html', connectionId: 'local-html', model: 'gpt-6.1-sol', protocol: 'responses', promptIds: ['text', 'html', 'html2'], enabled: true, intervalMinutes: 30, timeoutSeconds: 180, maxOutputTokens: 12000, extraBody: {} },
      { id: 'html-only', connectionId: 'local-html', model: 'gpt-6-astra', protocol: 'chat', promptIds: ['html'], enabled: true, intervalMinutes: 30, timeoutSeconds: 180, maxOutputTokens: null, extraBody: {} },
    ];
    await window.sentinel.saveConfig(config);
    await window.sentinel.expandFloat(false);
  }, baseUrl);
  await page.getByRole('button', { name: '新建题目', exact: true }).click();
  await page.getByRole('button', { name: '模型设置 gpt-6.1-sol', exact: true }).click();
  await page.getByLabel('推理强度', { exact: true }).selectOption('high');
  await expect(page.getByLabel('最大输出 Token', { exact: true })).toHaveValue('12000');
  await page.getByRole('button', { name: '保存模型设置', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (let round = 0; round < 10; round++) {
    await page.evaluate(async failed => {
      const { config } = await window.sentinel.getState();
      config.prompts[1].prompt = failed ? 'svg-bad' : 'svg-fixture';
      config.prompts[2].prompt = failed ? 'svg-bad' : 'svg-fixture-alternate';
      await window.sentinel.saveConfig(config);
      await window.sentinel.run(['text-html']);
    }, round === 8);
    await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 20000 }).toBe(0);
  }
  await page.evaluate(() => window.sentinel.run(['html-only']));
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length, { timeout: 20000 }).toBe(0);
  const state = await page.evaluate(() => window.sentinel.getState());
  expect(state.history.find(r => r.targetId === 'text-html').status).toBe('normal');
  expect(state.history.find(r => r.targetId === 'html-only').status).toBe('generated');
  expect(state.history.filter(r => r.targetId === 'text-html' && r.status === 'insufficient')).toHaveLength(0);
  expect(state.history.filter(r => r.targetId === 'text-html' && r.results.some(result => result.type === 'html' && result.status === 'insufficient'))).toHaveLength(1);
  const payload = requests.find(r => r.body.input === 'candy-fixture').body;
  expect(payload.reasoning).toEqual({ effort: 'high' });
  expect(payload.max_output_tokens).toBe(12000);
  checks.push('reasoning and output limits are sent separately; actual text, raw/fenced HTML and failed HTML have correct statuses');
  const floating = await getFloating();
  await expect(floating.locator('[data-testid="float-compact"]')).toBeVisible();
  const compact = floating.locator('.float-compact-row').first();
  await expect(compact.locator('.float-compact-answers')).toContainText('糖果题');
  await expect(compact.locator('.float-compact-answers')).toContainText('21');
  await expect(compact.locator('.history-bar')).toHaveCount(10);
  await expect(compact.locator('.float-compact-identity small')).toHaveCount(0);
  await expect(floating.locator('iframe')).toHaveCount(0);
  expect(await floating.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await floating.screenshot({ path: `${screenshotPrefix}-compact.png` });
  checks.push('compact float displays per-model text answers and history bars without HTML markup or numeric connection label');
  await floating.getByRole('button', { name: '展开悬浮窗', exact: true }).click();
  const gallery = floating.locator('.float-model-row').first().locator('.html-gallery');
  await expect(gallery.locator('.html-round')).toHaveCount(8);
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery.locator('.html-thumbnail-image')).toHaveCount(7, { timeout: 30000 });
  await expect(gallery.locator('.html-round.insufficient')).toHaveCount(1);
  expect(await gallery.locator('.html-thumbnail-image').first().evaluate(img => img.complete && img.naturalWidth > 100)).toBe(true);
  await gallery.locator('.html-round').first().click();
  await expect(gallery.locator('iframe')).toBeVisible();
  await expect(gallery.getByRole('tab')).toHaveCount(2);
  await expect.poll(() => floating.frames().some(frame => frame.url().startsWith('sentinel-preview:'))).toBe(true);
  const frame = floating.frames().find(frame => frame.url().startsWith('sentinel-preview:'));
  await expect(frame.locator('body')).toHaveAttribute('data-ready', 'yes');
  expect(await frame.evaluate(() => [typeof window.sentinel, typeof require, typeof process])).toEqual(['undefined', 'undefined', 'undefined']);
  expect(await frame.evaluate(() => { try { return Boolean(parent.document.body); } catch { return false; } })).toBe(false);
  const first = await frame.locator('svg').screenshot();
  await frame.waitForTimeout(350);
  const second = await frame.locator('svg').screenshot();
  expect(first.equals(second)).toBe(false);
  const pixels = await floating.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 160 && data[i + 1] < 150 && data[i + 2] < 170) red++;
    return red;
  }, first.toString('base64'));
  expect(pixels).toBeGreaterThan(500);
  await frame.getByRole('button', { name: '换色', exact: true }).click();
  await expect(frame.locator('circle')).toHaveAttribute('fill', '#167eac');
  expect(await frame.evaluate(async baseUrl => { try { await fetch(`${baseUrl}/preview-leak`); return true; } catch { return false; } }, baseUrl)).toBe(false);
  await floating.screenshot({ path: `${screenshotPrefix}-expanded.png` });
  await gallery.getByRole('tab', { name: '动画二', exact: true }).click();
  await expect(gallery.locator('iframe')).toHaveAttribute('title', '动画二');
  await gallery.getByRole('button', { name: '收起 HTML 页面', exact: true }).click();
  await expect(gallery.locator('iframe')).toHaveCount(0);
  checks.push('latest eight rounds have real thumbnails; complete page animates, interacts and stays isolated from app/Node/network');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.data-directory')).not.toBeEmpty();
  await expect(page.locator('.about')).toContainText(state.appInfo.version);
  await page.getByRole('button', { name: '检测工作台', exact: true }).click();
  checks.push('saved question opens at startup and settings expose the actual data directory and version');
  return checks;
}

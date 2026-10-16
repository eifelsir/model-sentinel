import { expect } from '@playwright/test';

export async function verifyFloating(page, { baseUrl, getFloating, screenshotPrefix }) {
  const checks = [];
  await page.evaluate(async baseUrl => {
    const { config } = await window.sentinel.getState();
    config.settings.autoRun = false;
    config.settings.floatVisible = true;
    config.settings.answerJudgeTargetId = '';
    config.connections = [{ id: 'float-local', name: '本地服务', baseUrl, protocol: 'responses' }];
    config.prompts = [{ id: 'float-text', name: '文字题', prompt: '6*7?', expected: '42' }];
    config.targets = ['test-normal', 'test-wrong', 'test-incomplete'].map((model, index) => ({
      id: `float-${index}`, connectionId: 'float-local', model, promptIds: ['float-text'],
    }));
    await window.sentinel.saveConfig(config);
    await window.sentinel.expandFloat(false);
    await window.sentinel.run();
  }, baseUrl);
  await expect.poll(async () => (await page.evaluate(() => window.sentinel.getState())).activeTargetIds.length).toBe(0);
  const floating = await getFloating();
  await floating.mouse.move(-10, -10);
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  expect(await floating.evaluate(() => innerWidth)).toBe(300);
  expect(await floating.evaluate(() => innerHeight)).toBeLessThan(270);
  await expect(floating.locator('.float-compact-row').first()).toContainText('42');
  await floating.screenshot({ path: `${screenshotPrefix}-compact.png` });
  checks.push('traffic-style compact monitor retains provider/model names, verdicts and text answers in a narrow footprint');

  await floating.locator('.float-compact-row').first().hover();
  await expect(floating.getByTestId('float-expanded')).toBeVisible();
  await expect(floating.locator('.float-model-row')).toHaveCount(3);
  expect(await floating.evaluate(() => innerWidth)).toBeLessThan(550);
  await floating.mouse.move(-10, -10);
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  checks.push('hover expands the model list and leaving the unpinned window collapses it');

  await floating.locator('.float-compact-row').first().hover();
  await expect(floating.getByTestId('float-expanded')).toBeVisible();
  await floating.locator('.float-rows').hover();
  await floating.waitForTimeout(550);
  await expect(floating.getByTestId('float-expanded')).toBeVisible();
  await floating.mouse.move(-10, -10);
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  checks.push('the unpinned list remains open while the pointer stays inside after native resizing');

  await floating.locator('.float-compact-row').first().click();
  await expect(floating.locator('.float-model-row')).toHaveCount(1);
  await expect(floating.getByRole('button', { name: '返回模型列表', exact: true })).toBeVisible();
  await expect(floating.getByRole('button', { name: '取消固定悬浮窗', exact: true })).toBeVisible();
  await floating.mouse.move(-10, -10);
  await floating.waitForTimeout(450);
  await expect(floating.locator('.float-model-row')).toHaveCount(1);
  await floating.screenshot({ path: `${screenshotPrefix}-detail.png` });
  checks.push('clicking a model pins only its details and leaving does not interrupt inspection');

  await floating.getByRole('button', { name: '返回模型列表', exact: true }).click();
  await expect(floating.locator('.float-model-row')).toHaveCount(3);
  await floating.screenshot({ path: `${screenshotPrefix}-list.png` });
  await floating.keyboard.press('Escape');
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  await floating.getByRole('button', { name: '展开悬浮窗', exact: true }).click();
  await floating.mouse.move(-10, -10);
  await floating.waitForTimeout(450);
  await expect(floating.getByTestId('float-expanded')).toBeVisible();
  await floating.getByRole('button', { name: '取消固定悬浮窗', exact: true }).click();
  await floating.mouse.move(-10, -10);
  await expect(floating.getByTestId('float-compact')).toBeVisible();
  checks.push('back navigation, Escape, explicit expansion and unpinning have predictable collapse behavior');
  return checks;
}

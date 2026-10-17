import { expect } from '@playwright/test';
import { builtinPrompts, builtinPromptsVersion } from '../core/builtins.mjs';

export async function verifyBuiltinEditor(page) {
  const { config } = await page.evaluate(() => window.sentinel.getState());
  expect(config.builtinsVersion).toBe(builtinPromptsVersion);
  expect(config.prompts).toEqual(builtinPrompts);
  for (const question of builtinPrompts) {
    await page.getByRole('button', { name: `编辑题目 ${question.name}`, exact: true }).click();
    await expect(page.getByLabel('提示词', { exact: true })).toHaveValue(question.prompt);
    await expect(page.getByLabel('题目类型', { exact: true })).toHaveValue(question.type);
    if (question.type === 'text') {
      await expect(page.getByLabel('固定答案', { exact: true })).toHaveValue(question.expected);
      await expect(page.getByLabel('提取方式', { exact: true })).toHaveValue(question.mode);
    } else {
      await expect(page.getByLabel('固定答案', { exact: true })).toHaveCount(0);
    }
  }
  await page.getByRole('button', { name: '编辑题目 牛奶题', exact: true }).click();
  return ['all four built-in questions open in the editor with their exact saved prompts, modes and fixed answers'];
}

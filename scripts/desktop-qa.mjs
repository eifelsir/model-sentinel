import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createMockServer } from "./mock-server.mjs";

const profile = await mkdtemp(join(tmpdir(), "model-sentinel-qa-"));
const screenshots = resolve("artifacts/screenshots");
await mkdir(screenshots, { recursive: true });
const fixture = await createMockServer();
const errors = [];
let app;
const checks = [];
const launch = async () => {
  app = await electron.launch({
    args: [resolve("."), `--profile=${profile}`],
    timeout: 30000,
  });
  const main = await app.firstWindow();
  main.on("pageerror", (error) => errors.push(error.message));
  await main.waitForFunction(() => Boolean(window.sentinel));
  await expect(
    main.getByRole("heading", { name: "检测工作台", exact: true }),
  ).toBeVisible();
  return main;
};
try {
  let page = await launch();
  await expect(page.getByLabel("提示词", { exact: true })).toBeVisible();
  await expect(page.getByLabel("固定答案", { exact: true })).toBeVisible();
  await expect(page.getByLabel("固定答案", { exact: true })).toHaveValue("46.24");
  await page.getByRole("button", { name: "新建题目", exact: true }).click();
  await expect(page.getByLabel("提示词", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("固定答案", { exact: true })).toHaveValue("");
  await page.screenshot({ path: join(screenshots, "01-empty.png") });
  await page.getByLabel("题目名称").fill("乘法验证");
  await page.getByLabel("提示词", { exact: true }).fill("6*7?");
  await page.getByLabel("固定答案", { exact: true }).fill("42");
  await page.getByRole("button", { name: "保存题目", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).config.prompts
          .length,
    )
    .toBe(4);
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.prompts = config.prompts.filter(prompt => prompt.name === "乘法验证");
    await window.sentinel.saveConfig(config);
  });
  checks.push("visible prompt and expected-answer editor saves a prompt");
  await page.getByRole("button", { name: "连接与模型", exact: true }).click();
  await page.getByLabel("连接名称", { exact: true }).fill("本地验证");
  await page.getByLabel("Base URL", { exact: true }).fill(fixture.baseUrl);
  await page
    .getByLabel("API KEY", { exact: true })
    .fill("test-secret-never-export");
  await page.getByRole("button", { name: "保存连接", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).config
          .connections.length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "拉取模型", exact: true }).click();
  await expect(
    page.getByLabel("选择 test-normal", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("选择 test-normal", { exact: true }).check();
  await page.getByLabel("选择 test-wrong", { exact: true }).check();
  await page.getByLabel("选择 test-incomplete", { exact: true }).check();
  await page.getByRole("button", { name: "添加所选模型", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).config.targets
          .length,
    )
    .toBe(3);
  checks.push(
    "connection saved, key redacted, model discovery and multi-select",
  );
  const state = await page.evaluate(() => window.sentinel.getState());
  expect(state.config.connections[0].apiKey).toBeUndefined();
  expect(state.config.connections[0].hasKey).toBe(true);
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    for (const protocol of ["chat", "gemini", "anthropic"]) {
      config.targets.push({
        ...config.targets[0],
        id: `protocol-${protocol}`,
        protocol,
        model: "test-normal",
      });
    }
    await window.sentinel.saveConfig(config);
  });
  await page.getByRole("button", { name: "检测工作台", exact: true }).click();
  await page.getByRole("button", { name: "检测全部", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).history.filter(
          (h) => h.completedAt,
        ).length,
      { timeout: 30000 },
    )
    .toBe(6);
  let completed = (await page.evaluate(() => window.sentinel.getState()))
    .history;
  expect(completed.filter((h) => h.status === "normal")).toHaveLength(4);
  expect(completed.filter((h) => h.status === "degraded")).toHaveLength(1);
  expect(completed.filter((h) => h.status === "insufficient")).toHaveLength(1);
  expect(fixture.requests.every((r) => !("expected" in r.body))).toBe(true);
  checks.push(
    "four protocols perform real HTTP calls, correctly classify pass/fail/truncation",
  );
  await page.screenshot({ path: join(screenshots, "02-workbench.png") });
  await page.evaluate(() => window.sentinel.setFloatVisible(true));
  await expect.poll(() => app.windows().length).toBe(2);
  const floating = app.windows().find((w) => w !== page);
  await floating.waitForSelector('[data-testid="float-compact"]');
  await floating.screenshot({
    path: join(screenshots, "03-float-compact.png"),
  });
  await floating
    .getByRole("button", { name: "展开悬浮窗", exact: true })
    .click();
  await expect(
    floating.locator('[data-testid="float-expanded"]'),
  ).toBeVisible();
  await floating.screenshot({
    path: join(screenshots, "04-float-expanded.png"),
  });
  expect(await floating.evaluate(() => innerWidth)).toBeGreaterThan(600);
  for (let repeat = 0; repeat < 2; repeat++) {
    await floating.locator(".history-bar").first().click();
    await expect(page.getByRole("dialog", { name: "检测详情" })).toBeVisible();
    await page.getByRole("button", { name: "关闭详情" }).click();
  }
  checks.push(
    "repeated clicks on the same floating history bar reopen details",
  );
  await floating
    .getByRole("button", { name: "收起悬浮窗", exact: true })
    .click();
  await expect
    .poll(() => floating.evaluate(() => innerWidth))
    .toBeLessThan(400);
  checks.push(
    "native compact and expanded floating window, live multi-target history",
  );
  await page.getByRole("button", { name: "检测历史", exact: true }).click();
  await page.getByRole("button", { name: "查看详情" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("最终回复", { exact: true })).toBeVisible();
  await page.screenshot({ path: join(screenshots, "05-history-detail.png") });
  await page.getByRole("button", { name: "关闭详情" }).click();
  await page.getByRole("button", { name: "检测工作台", exact: true }).click();
  await page.getByRole("button", { name: "新建题目", exact: true }).click();
  await page.getByLabel("题目名称").fill("第二题");
  await page.getByLabel("提示词", { exact: true }).fill("Answer 42 only.");
  await page.getByLabel("固定答案", { exact: true }).fill("42");
  await page.getByRole("button", { name: "保存题目", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).config.prompts
          .length,
    )
    .toBe(2);
  await page
    .getByRole("button", { name: "模型设置 test-normal", exact: true })
    .first()
    .click();
  await page.getByLabel("关联题目 第二题", { exact: true }).check();
  await page.getByLabel("最大输出 Token", { exact: true }).fill("256");
  await page
    .getByLabel("额外请求参数（JSON）", { exact: true })
    .fill('{"temperature":0}');
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    await window.sentinel.saveConfig(config);
  });
  await expect(page.getByLabel("额外请求参数（JSON）", { exact: true })).toBeFocused();
  await page.screenshot({ path: join(screenshots, "07-model-settings.png") });
  await page.getByRole("button", { name: "保存模型设置", exact: true }).click();
  await page
    .getByRole("button", { name: "检测 test-normal", exact: true })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).history.filter(
          (r) => r.completedAt,
        ).length,
    )
    .toBe(7);
  let current = await page.evaluate(() => window.sentinel.getState());
  expect(current.history[0].results).toHaveLength(2);
  expect(current.history[0].status).toBe("normal");
  expect(fixture.requests.at(-1).body.max_output_tokens).toBe(256);
  expect(fixture.requests.at(-1).body.temperature).toBe(0);
  await page.getByLabel("启用 test-normal", { exact: true }).first().click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).config
          .targets[0].enabled,
    )
    .toBe(false);
  await expect(page.getByLabel("启用 test-normal", { exact: true }).first()).not.toBeChecked();
  await page.getByRole("button", { name: "检测全部", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).history.filter(
          (r) => r.completedAt,
        ).length,
    )
    .toBe(12);
  current = await page.evaluate(() => window.sentinel.getState());
  expect(
    current.history.filter((r) => r.targetId === current.config.targets[0].id),
  ).toHaveLength(2);
  checks.push(
    "second prompt assignment, advanced request parameters, disabled target skipped by Run All",
  );
  await page.getByRole("button", { name: "连接与模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "连接与模型", exact: true })).toBeInViewport();
  await page.getByLabel("连接名称", { exact: true }).fill("本地验证（已编辑）");
  await page.getByRole("button", { name: "保存连接", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).config
          .connections[0].name,
    )
    .toBe("本地验证（已编辑）");
  expect(
    (await page.evaluate(() => window.sentinel.getState())).config
      .connections[0].hasKey,
  ).toBe(true);
  await page.getByLabel("手动模型 ID", { exact: true }).fill("manual-wrong");
  await page.getByRole("button", { name: "添加模型", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).config.targets
          .length,
    )
    .toBe(7);
  await page.screenshot({ path: join(screenshots, "08-connections.png") });
  await page.getByRole("button", { name: "检测工作台", exact: true }).click();
  await page
    .getByRole("button", { name: "检测 manual-wrong", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).history.filter(
          (r) => r.model === "manual-wrong" && r.completedAt,
        ).length,
    )
    .toBe(1);
  expect(fixture.requests.at(-1).authorization).toBe(
    "Bearer test-secret-never-export",
  );
  checks.push(
    "manual model entry and connection edit preserve encrypted saved key",
  );
  const beforeAuto = (await page.evaluate(() => window.sentinel.getState()))
    .history.length;
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.targets = config.targets.map((t, i) => ({
      ...t,
      enabled: i === 0,
      intervalMinutes: 0.01,
    }));
    await window.sentinel.saveConfig(config);
    await window.sentinel.setAuto(true);
  });
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).history.filter(
          (r) => r.completedAt,
        ).length,
      { timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(beforeAuto + 2);
  await page.evaluate(() => window.sentinel.stop());
  expect(
    (await page.evaluate(() => window.sentinel.getState())).config.settings
      .autoRun,
  ).toBe(false);
  checks.push(
    "automatic immediate and interval runs, Stop All suspends automation",
  );
  await page.evaluate(async () => {
    const { config } = await window.sentinel.getState();
    config.targets[0].model = "test-slow";
    await window.sentinel.saveConfig(config);
    await window.sentinel.run([config.targets[0].id]);
  });
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).activeTargetIds
          .length,
    )
    .toBe(1);
  await page.evaluate(() => window.sentinel.stop());
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.sentinel.getState())).activeTargetIds
          .length,
    )
    .toBe(0);
  checks.push("running request cancellation");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !w.webContents.getURL().includes("view=float"))
      .setSize(900, 650),
  );
  await page.getByRole("button", { name: "检测工作台", exact: true }).click();
  await page.screenshot({ path: join(screenshots, "06-small-window.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !w.webContents.getURL().includes("view=float"))
      .close(),
  );
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("view=float"))
        .isVisible(),
    ),
  ).toBe(false);
  await floating.evaluate(() => window.sentinel.openMain());
  checks.push(
    "main close hides to tray, float reopens main; small-window layout",
  );
  await app.close();
  app = null;
  const onDisk = await readFile(join(profile, "state.json"), "utf8");
  expect(onDisk).not.toContain("test-secret-never-export");
  page = await launch();
  const restored = await page.evaluate(() => window.sentinel.getState());
  expect(restored.config.connections[0].hasKey).toBe(true);
  expect(restored.history.length).toBeGreaterThan(6);
  checks.push("encrypted key persistence and history survive restart");
  expect(errors).toEqual([]);
  await writeFile(
    "artifacts/qa-results.json",
    JSON.stringify({ passed: true, checks, profile, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks, profile }, null, 2));
} catch (error) {
  await writeFile(
    "artifacts/qa-results.json",
    JSON.stringify(
      { passed: false, checks, profile, errors, error: error.stack },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (app) await app.close();
  await fixture.close();
}

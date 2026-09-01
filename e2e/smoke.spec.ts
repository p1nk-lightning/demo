// E2E 冒烟主链路(AC-017):
// 本机模式(无需登录/Worker 密钥)——注册/验证码/忘记密码的后端链路由
// worker/src/routes/auth.test.ts 的 D1 集成测试覆盖(契约同级)。
// 链路:导入 12 词(粘贴)→ 读内置每日文章 → 答题 5/5 → 词汇测验一轮 → 看板出数据。
// 确定性保障:词典释义由 fixture 预置进本地 D1(内置词典路径),不依赖外网。
import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const VOCAB = [
  'analyze', 'context', 'pattern', 'current', 'reveal',
  'signal', 'climate', 'species', 'mental', 'reduce',
  'focus', 'behavior',
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  // 预置 12 条词典释义到本地 D1(内置词典路径),让测验抽词/拼词判定不依赖外网。
  // definition_zh 故意包含词本身,拼词模式可从释义读出确定答案。
  const values = VOCAB.map((word) =>
    `('e2e-dict', '${word}', '${word}', NULL, 'n.', NULL, '${word} 的测试释义', NULL, 'CET4', NULL, ${Date.now()})`).join(',\n  ');
  const sql = [
    "DELETE FROM dictionary_entries WHERE dictionary_id = 'e2e-dict';",
    "DELETE FROM dictionaries WHERE id = 'e2e-dict';",
    `INSERT INTO dictionaries (id, name, description, license, source_url, priority, updated_at) VALUES ('e2e-dict', 'E2E 冒烟词典', 'e2e fixture', 'MIT', 'https://example.com', 0, ${Date.now()});`,
    `INSERT INTO dictionary_entries (dictionary_id, normalized, headword, phonetic, part_of_speech, definition_en, definition_zh, example_en, difficulty, frequency_rank, updated_at) VALUES\n  ${values};`,
  ].join('\n');
  const seedPath = path.join(import.meta.dirname, 'fixtures', 'seed.local.sql');
  writeFileSync(seedPath, sql, 'utf8');
  execSync('npx wrangler d1 execute lexiscene --local --file ../e2e/fixtures/seed.local.sql', {
    cwd: path.join(import.meta.dirname, '..', 'worker'),
    stdio: 'pipe',
  });
});

test('smoke: import -> read -> answer -> quiz -> stats', async ({ page }) => {
  test.setTimeout(180_000);

  // 1. 打开首页,确认应用加载
  await page.goto('/#/library/import');
  await expect(page.getByRole('button', { name: '生成导入预览' })).toBeVisible();

  // 2. 粘贴 12 个词,生成预览
  await page.getByPlaceholder(/每行一个单词/).fill(VOCAB.join('\n'));
  await page.getByRole('button', { name: '生成导入预览' }).click();
  await expect(page.getByText('导入预览', { exact: true })).toBeVisible();

  // 3. 命名并入库
  await page.getByPlaceholder(/雅思核心词汇/).fill('E2E 冒烟词表');
  await page.getByRole('button', { name: /创建单词表/ }).click();
  await page.waitForURL(/library(?!\/import)/, { timeout: 20_000 });

  // 4. 读内置每日文章并答题
  await page.goto('/#/');
  await page.getByRole('button', { name: '开始今日阅读' }).first().click();
  await page.waitForURL(/reading\//, { timeout: 20_000 });

  // 每题选第一个选项(radio,内置文章选项顺序即正确顺序,score=满分即可冒烟算分链路)
  const progressText = await page.getByText(/已答 \d+ \/ \d+/).first().textContent();
  const questionCount = Number(progressText?.match(/\/ (\d+)$/)?.[1] ?? 3);
  for (let i = 0; i < questionCount; i += 1) {
    await page.getByRole('radio').first().click({ force: true });
    if (i < questionCount - 1) {
      await page.getByRole('button', { name: '下一题' }).click();
    }
  }
  await page.getByRole('button', { name: '提交答卷' }).click();
  // 结果面板出现(含"再做一次"重考按钮)
  await expect(page.getByRole('button', { name: /再做一次/ })).toBeVisible({ timeout: 20_000 });

  // 5. 词汇测验:见义拼词模式,释义来自内置词典(fixture 预置)
  const batchResponses: string[] = [];
  const browserLogs: string[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/dictionary/batch')) {
      try { batchResponses.push(`${res.status()} ${await res.text()}`); } catch {}
    }
  });
  page.on('console', (msg) => browserLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => browserLogs.push(`[PAGEERROR] ${err.message}`));
  await page.goto('/#/quiz');
  await expect(page.getByRole('button', { name: /看词选义/ })).toBeVisible({ timeout: 60_000 }).catch(async () => {
    const idbCounts = await page.evaluate(async () => {
      const open = indexedDB.open('lexiscene-v2');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const count = (store: string) => new Promise<number>((resolve) => {
        const req = db.transaction(store).objectStore(store).count();
        req.onsuccess = () => resolve(req.result);
      });
      const out: Record<string, number> = {};
      for (const store of ['vocabLists', 'vocabItems', 'settings']) out[store] = await count(store);
      return out;
    });
    writeFileSync(path.join(import.meta.dirname, 'debug-dict.log'),
      `batch calls=${batchResponses.length}\n${batchResponses.join('\n---\n')}\nIDB=${JSON.stringify(idbCounts)}\nLOGS:\n${browserLogs.join('\n')}`,
      'utf8');
    throw new Error(`quiz not ready; dump written. responses=${batchResponses.length}`);
  });
  await page.getByRole('button', { name: /见义拼词/ }).click();

  for (let i = 0; i < 10; i += 1) {
    // 释义文案来自外部词典兜底(definitionEN 含目标词或其派生),取文本里最长的英文词作答案
    const gloss = await page.locator('p.text-xl').first().textContent();
    const candidates = (gloss ?? '').match(/[a-zA-Z][a-zA-Z'-]{2,}/g) ?? [];
    const answer = candidates.sort((a, b) => b.length - a.length)[0]?.toLowerCase() ?? 'a';
    await page.getByPlaceholder('输入英文单词').fill(answer);
    await page.getByRole('button', { name: '提交' }).click();
    // 反馈后进入下一题(重练段答对也会推进)
    const nextButton = page.getByRole('button', { name: /下一题|完成/ });
    await expect(nextButton).toBeVisible();
    await nextButton.click();
  }
  // 完成页(正确率百分比)
  await expect(page.getByText(/首答正确 \d+ \/ 10 词/)).toBeVisible({ timeout: 20_000 });

  // 6. 看板:出现数据(不再显示空态)
  await page.goto('/#/stats');
  await expect(page.getByText('学习看板')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('词汇复现率')).toBeVisible();
  await expect(page.getByText('还没有阅读记录')).toHaveCount(0);
});

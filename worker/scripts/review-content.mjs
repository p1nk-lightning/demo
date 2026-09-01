// 一次性运维脚本:对候选文章执行与 /api/admin/content/:id/ai-review 相同的审核门
// (deterministic 校验 + LLM 评审),通过的进入文章池(approve),并为今天的
// /api/daily 按 rotateContentPool 的取数规则落 publish_date。
// 背景:生产环境无法以编程方式获得管理员会话,故在脚本侧复刻同一条审核链路;
// 后续日常内容管理仍走管理界面。用法:
//   node scripts/review-content.mjs --remote                 # 审核 + approve + 排期今天
//   node scripts/review-content.mjs --remote --skip-date     # 只审核 + approve
//   node scripts/review-content.mjs --remote --date=2026-09-03
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseName = 'lexiscene';
const remote = process.argv.includes('--remote');
const skipReview = process.argv.includes('--skip-review');
const skipDate = process.argv.includes('--skip-date');
const dateArg = process.argv.find((value) => value.startsWith('--date='))?.slice(7);
const limit = Math.max(1, Math.min(500, Number(process.argv.find((value) => value.startsWith('--limit='))?.slice(8)) || 200));

// 与 src/lib/validation.ts 的 PUBLIC_DIFFICULTY_LIMITS 一致(发布门槛)
const PUBLIC_DIFFICULTY_LIMITS = {
  CET4: { minWords: 400, maxWords: 500, minSentenceWords: 10, maxSentenceWords: 20 },
  CET6: { minWords: 500, maxWords: 620, minSentenceWords: 13, maxSentenceWords: 25 },
  考研: { minWords: 600, maxWords: 720, minSentenceWords: 15, maxSentenceWords: 30 },
  雅思: { minWords: 700, maxWords: 850, minSentenceWords: 14, maxSentenceWords: 30 },
  托福: { minWords: 750, maxWords: 900, minSentenceWords: 16, maxSentenceWords: 32 },
};
const DIFFICULTIES = ['CET4', 'CET6', '考研', '雅思', '托福'];

function envValue(name) {
  const text = readFileSync(join(workerRoot, '.dev.vars'), 'utf8');
  return (text.match(new RegExp(`^${name}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
}
function sql(value) { return value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`; }
function englishWordCount(value) { return value.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length ?? 0; }
function normalizedText(value = '') { return value.toLowerCase().replace(/[“”‘’]/g, '').replace(/\s+/g, ' ').trim(); }
function hasCjk(value = '') { return /[\u3400-\u9fff]/u.test(value); }
function chinaDayKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function wranglerArgs(...args) {
  return [join(workerRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args];
}

function queryCandidates() {
  const output = execFileSync(process.execPath, wranglerArgs('d1', 'execute', databaseName, remote ? '--remote' : '--local', '--command', `SELECT id, title, summary, content, difficulty, topic, questions_json, source_title, source_url, status FROM content_articles WHERE status = 'candidate' ORDER BY id LIMIT ${limit}`, '--json'), { cwd: workerRoot, encoding: 'utf8' });
  const parsed = JSON.parse(output);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  return result?.results ?? [];
}

function queryPool() {
  const output = execFileSync(process.execPath, wranglerArgs('d1', 'execute', databaseName, remote ? '--remote' : '--local', '--command', "SELECT id, difficulty, publish_date FROM content_articles WHERE status = 'published' ORDER BY COALESCE(published_at, 0), created_at, id", '--json'), { cwd: workerRoot, encoding: 'utf8' });
  const parsed = JSON.parse(output);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  return result?.results ?? [];
}

function execute(statements, label) {
  if (!statements.length) return;
  const tempDir = join(workerRoot, '..', 'tmp');
  mkdirSync(tempDir, { recursive: true });
  const file = join(tempDir, `lexiscene-review-${label}-${Date.now()}.sql`);
  writeFileSync(file, statements.join('\n'), 'utf8');
  try {
    execFileSync(process.execPath, wranglerArgs('d1', 'execute', databaseName, remote ? '--remote' : '--local', '--file', file), { cwd: workerRoot, stdio: 'inherit' });
  } finally {
    unlinkSync(file);
  }
}

// 与 src/lib/validation.ts validatePublicArticle 一致(去掉 zod 依赖)
function validatePublicArticle(article, difficulty) {
  const issues = [];
  const limits = PUBLIC_DIFFICULTY_LIMITS[difficulty];
  if (!limits) return { issues: [`difficulty_not_supported:${difficulty}`], wordCount: 0 };
  const words = englishWordCount(article.content || '');
  const sentenceCount = Math.max(1, (article.content || '').match(/[.!?]+(?:\s|$)/g)?.length ?? 0);
  const averageSentenceWords = words / sentenceCount;
  if (words < limits.minWords || words > limits.maxWords) issues.push(`正文词数为 ${words}，${difficulty} 应为 ${limits.minWords}-${limits.maxWords} 词`);
  if (averageSentenceWords < limits.minSentenceWords || averageSentenceWords > limits.maxSentenceWords) issues.push(`平均句长为 ${averageSentenceWords.toFixed(1)}，建议范围 ${limits.minSentenceWords}-${limits.maxSentenceWords}`);
  if (hasCjk(article.title || '')) issues.push('英文标题中含有中文字符');
  if (hasCjk(article.content || '')) issues.push('英文正文中含有中文字符');
  if ((article.content || '').split(/\n\s*\n/).filter(Boolean).length < 3) issues.push('正文少于三个段落');
  const questionKeys = new Set();
  (article.questions || []).forEach((question, index) => {
    const label = `第 ${index + 1} 题`;
    if (hasCjk(question.question ?? '')) issues.push(`${label}题干不是纯英文`);
    if ((question.options ?? []).some((option) => !option.trim() || hasCjk(option))) issues.push(`${label}存在空选项或中文选项`);
    if (!hasCjk(question.questionZh ?? '') || !question.optionsZh || question.optionsZh.some((option) => !hasCjk(option))) issues.push(`${label}缺少中文翻译`);
    if (new Set((question.options ?? []).map(normalizedText)).size !== 4) issues.push(`${label}存在重复选项`);
    const key = normalizedText(question.question ?? '');
    if (questionKeys.has(key)) issues.push(`${label}与其他题目重复`);
    questionKeys.add(key);
    if (!question.evidence || !normalizedText(article.content || '').includes(normalizedText(question.evidence))) issues.push(`${label}证据句无法在正文中找到`);
  });
  return { issues, wordCount: words, averageSentenceWords };
}

// 与 src/routes/content.ts ai-review 的提示词一致
function reviewPrompts(article, difficulty, deterministicIssues) {
  const systemPrompt = [
    'You are a strict editorial reviewer for an English-learning platform. Return valid JSON only and never publish content.',
    'Evaluate English quality, stated exam-level fit, question-answer consistency, exact evidence, factual overclaims, source attribution, and copyright/originality risk.',
    'A passing article must have answerable English questions, four English options per question, accurate Chinese translations, and an exact supporting quote copied from the article for every answer.',
    'Do not claim that you visited the source URL. Put claims that need source verification in factualChecks.',
  ].join('\n');
  const userPrompt = JSON.stringify({
    task: 'Return a recommendation for a human editor.',
    deterministicIssues,
    article: { ...article, difficulty, topic: article.topic, sourceTitle: article.sourceTitle, sourceUrl: article.sourceUrl },
    output: {
      verdict: 'pass | needs_revision | reject', score: 'integer 0-100', summary: 'string', strengths: ['string'], issues: ['string'], factualChecks: ['string'],
      scores: { englishQuality: '0-100', levelFit: '0-100', questionQuality: '0-100', factualReliability: '0-100', originality: '0-100' },
      questionChecks: [{ index: '1-based integer', answerSupported: 'boolean', evidenceFound: 'boolean', issue: 'string, empty when none' }],
      copyrightRisk: { level: 'low | medium | high', reason: 'string' },
    },
  });
  return { systemPrompt, userPrompt };
}

async function callReview(apiKey, model, article, difficulty, deterministicIssues) {
  const { systemPrompt, userPrompt } = reviewPrompts(article, difficulty, deterministicIssues);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 2200, thinking: { type: 'disabled' }, messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ] }),
    });
    if (!response.ok) { await new Promise((done) => setTimeout(done, 3000)); continue; }
    const data = await response.json();
    let core;
    try {
      core = JSON.parse(data?.choices?.[0]?.message?.content ?? '');
    } catch {
      continue;
    }
    const checks = Array.isArray(core.questionChecks) ? core.questionChecks : [];
    const scores = core.scores ?? {};
    const valid = ['pass', 'needs_revision', 'reject'].includes(core.verdict)
      && Number.isInteger(core.score) && core.score >= 0 && core.score <= 100
      && typeof core.summary === 'string' && core.summary.trim()
      && Array.isArray(core.strengths) && Array.isArray(core.issues) && Array.isArray(core.factualChecks)
      && ['englishQuality', 'levelFit', 'questionQuality', 'factualReliability', 'originality'].every((key) => Number.isInteger(scores[key]) && scores[key] >= 0 && scores[key] <= 100)
      && checks.every((check) => Number.isInteger(check.index) && typeof check.answerSupported === 'boolean' && typeof check.evidenceFound === 'boolean' && typeof check.issue === 'string')
      && core.copyrightRisk && ['low', 'medium', 'high'].includes(core.copyrightRisk.level) && typeof core.copyrightRisk.reason === 'string';
    if (valid) return core;
  }
  throw new Error('AI review did not return a parseable result');
}

async function main() {
  const apiKey = envValue('DEEPSEEK_REVIEW_API_KEY') || envValue('DEEPSEEK_API_KEY');
  const model = envValue('DEEPSEEK_MODEL') || 'deepseek-chat';
  if (!apiKey) throw new Error('Configure DEEPSEEK_REVIEW_API_KEY in worker/.dev.vars first.');
  const mode = remote ? 'remote' : 'local';
  const now = Date.now();

  if (!skipReview) {
    const candidates = queryCandidates();
    console.log(`Reviewing ${candidates.length} candidate articles (${mode}).`);
    const statements = [];
    const summary = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const row = candidates[index];
      let questions;
      try { questions = JSON.parse(row.questions_json || '[]'); } catch { questions = []; }
      const article = { title: row.title, summary: row.summary, content: row.content, questions };
      const deterministic = validatePublicArticle(article, row.difficulty);
      if (deterministic.issues.length > 0) {
        // 确定性校验不过的文章不送 LLM、不写审核记录(保持候选、无 ai_review_json)
        summary.push(`${row.id} [${row.difficulty}] deterministic-fail (${deterministic.issues.length} issues), left unreviewed`);
        console.log(`${index + 1}/${candidates.length} ${row.id}: deterministic fail, skip LLM`);
        continue;
      }
      try {
        const core = await callReview(apiKey, model, article, row.difficulty, deterministic.issues);
        const questionChecksPass = core.questionChecks.length === questions.length
          && core.questionChecks.every((check) => check.answerSupported && check.evidenceFound);
        const hardFailure = deterministic.issues.length > 0
          || core.copyrightRisk.level === 'high'
          || core.questionChecks.length !== questions.length
          || core.questionChecks.some((check) => !check.answerSupported || !check.evidenceFound);
        const review = {
          ...core,
          verdict: hardFailure && core.verdict === 'pass' ? 'needs_revision' : core.verdict,
          score: hardFailure ? Math.min(core.score, 69) : core.score,
          repairCount: 0,
          deterministicIssues: deterministic.issues,
        };
        const passing = review.verdict === 'pass'
          && review.score >= 80
          && review.deterministicIssues.length === 0
          && review.copyrightRisk.level !== 'high'
          && questionChecksPass;
        // approve 语义与 /api/admin/content/:id/review action=approve 一致
        statements.push(`UPDATE content_articles SET ai_review_json = ${sql(JSON.stringify(review))}, ai_reviewed_at = ${now}, ai_review_model = ${sql(model)}, ${passing ? "status = 'published', publish_date = NULL, reviewed_at = " + now + ', published_at = NULL, ' : ''}updated_at = ${now} WHERE id = ${sql(row.id)};`);
        summary.push(`${row.id} [${row.difficulty}] ${review.verdict} score=${review.score} issues=${review.deterministicIssues.length}${passing ? ' -> POOL' : ''}`);
        console.log(`${index + 1}/${candidates.length} ${row.id}: ${review.verdict} (${review.score})${passing ? ' -> pool' : ''}`);
      } catch (error) {
        summary.push(`${row.id} FAILED: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`${index + 1}/${candidates.length} ${row.id}: failed (${error instanceof Error ? error.message : String(error)})`);
      }
      if (statements.length >= 10) execute(statements.splice(0), 'apply');
    }
    execute(statements, 'apply');
    console.log('--- review summary ---');
    summary.forEach((line) => console.log(line));
  }

  if (!skipDate) {
    const dayKey = dateArg || chinaDayKey();
    const pool = queryPool();
    const dated = new Set(pool.filter((row) => row.publish_date === dayKey).map((row) => row.difficulty));
    const picks = [];
    const seen = new Set();
    for (const row of pool) {
      if (row.publish_date !== null || seen.has(row.difficulty) || dated.has(row.difficulty)) continue;
      seen.add(row.difficulty);
      picks.push(row);
    }
    if (picks.length) {
      execute(picks.map((row) => `UPDATE content_articles SET publish_date = ${sql(dayKey)}, published_at = ${Date.now()}, updated_at = ${Date.now()} WHERE id = ${sql(row.id)};`), `date-${dayKey}`);
    }
    console.log(`Scheduled ${picks.length} article(s) for ${dayKey}: ${picks.map((row) => `${row.id}[${row.difficulty}]`).join(', ') || 'none needed'}`);
    if (dated.size) console.log(`Already scheduled for ${dayKey}: ${[...dated].join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

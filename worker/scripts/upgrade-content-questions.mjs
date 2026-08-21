import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseName = 'lexiscene';
const remote = process.argv.includes('--remote');
const statusArg = process.argv.find((value) => value.startsWith('--status='))?.slice(9);
const limit = Math.max(1, Math.min(500, Number(process.argv.find((value) => value.startsWith('--limit='))?.slice(8)) || 200));
const questionCounts = { CET4: 4, CET6: 4, 考研: 5, 雅思: 5, 托福: 5 };

function envValue(name) {
  const text = readFileSync(join(workerRoot, '.dev.vars'), 'utf8');
  return (text.match(new RegExp(`^${name}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
}
function sql(value) { return value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`; }
function normalized(value = '') { return value.toLowerCase().replace(/[“”‘’]/g, '').replace(/\s+/g, ' ').trim(); }
function hasCjk(value = '') { return /[\u3400-\u9fff]/u.test(value); }

function wranglerArgs(...args) {
  return [join(workerRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args];
}

function queryArticles() {
  const where = statusArg ? ` WHERE status = ${sql(statusArg)}` : '';
  const output = execFileSync(process.execPath, wranglerArgs('d1', 'execute', databaseName, remote ? '--remote' : '--local', '--command', `SELECT id,title,content,difficulty,questions_json,status FROM content_articles${where} ORDER BY created_at,id LIMIT ${limit}`, '--json'), { cwd: workerRoot, encoding: 'utf8' });
  const parsed = JSON.parse(output);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  return result?.results ?? [];
}

function executeUpdates(statements) {
  if (!statements.length) return;
  const tempDir = join(workerRoot, '..', 'tmp');
  mkdirSync(tempDir, { recursive: true });
  const file = join(tempDir, `lexiscene-question-upgrade-${Date.now()}.sql`);
  writeFileSync(file, statements.join('\n'), 'utf8');
  try {
    execFileSync(process.execPath, wranglerArgs('d1', 'execute', databaseName, remote ? '--remote' : '--local', '--file', file), { cwd: workerRoot, stdio: 'inherit' });
  } finally {
    unlinkSync(file);
  }
}

function validateQuestions(questions, content, expectedCount) {
  if (!Array.isArray(questions) || questions.length !== expectedCount) return false;
  const keys = new Set();
  return questions.every((question) => {
    const key = normalized(question?.question);
    const options = question?.options;
    const optionsZh = question?.optionsZh;
    const valid = key
      && !hasCjk(question.question)
      && Array.isArray(options)
      && options.length === 4
      && options.every((option) => typeof option === 'string' && option.trim() && !hasCjk(option))
      && new Set(options.map(normalized)).size === 4
      && Number.isInteger(question.answer)
      && question.answer >= 0
      && question.answer <= 3
      && typeof question.questionZh === 'string'
      && hasCjk(question.questionZh)
      && Array.isArray(optionsZh)
      && optionsZh.length === 4
      && optionsZh.every((option) => typeof option === 'string' && hasCjk(option))
      && typeof question.evidence === 'string'
      && normalized(content).includes(normalized(question.evidence))
      && !keys.has(key);
    keys.add(key);
    return Boolean(valid);
  });
}

async function createQuestions(article, key, model) {
  const expectedCount = questionCounts[article.difficulty] ?? 4;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0.35,
        max_tokens: 2200,
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: `Create exactly ${expectedCount} reading-comprehension questions for the supplied English article. Return JSON only as {questions:[{question,options:[4 strings],answer:0|1|2|3,questionZh,optionsZh:[4 strings],evidence}]}. Questions and all four options must be English. Chinese is allowed only in questionZh and optionsZh. Every evidence value must be a short exact quote copied from the article. Make every answer unambiguous and vary question types.` },
          { role: 'user', content: JSON.stringify({ title: article.title, difficulty: article.difficulty, article: article.content }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
    const data = await response.json();
    try {
      const payload = JSON.parse(data?.choices?.[0]?.message?.content ?? '');
      if (validateQuestions(payload.questions, article.content, expectedCount)) return payload.questions;
    } catch {
      // Retry malformed or incomplete model output.
    }
  }
  throw new Error(`Unable to produce valid questions for ${article.id}`);
}

async function main() {
  const key = envValue('DEEPSEEK_GENERATION_API_KEY') || envValue('DEEPSEEK_API_KEY');
  const model = envValue('DEEPSEEK_MODEL') || 'deepseek-chat';
  if (!key) throw new Error('Configure DEEPSEEK_GENERATION_API_KEY in worker/.dev.vars first.');
  const articles = queryArticles();
  console.log(`Upgrading questions for ${articles.length} articles in ${remote ? 'remote' : 'local'} D1.`);
  const updates = [];
  const failures = [];
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index];
    try {
      const existing = JSON.parse(article.questions_json || '[]');
      const expectedCount = questionCounts[article.difficulty] ?? 4;
      if (validateQuestions(existing, article.content, expectedCount)) {
        console.log(`${index + 1}/${articles.length} ${article.id}: already valid`);
        continue;
      }
      const questions = await createQuestions(article, key, model);
      updates.push(`UPDATE content_articles SET questions_json = ${sql(JSON.stringify(questions))}, ai_review_json = NULL, ai_reviewed_at = NULL, ai_review_model = NULL, updated_at = ${Date.now()} WHERE id = ${sql(article.id)};`);
      console.log(`${index + 1}/${articles.length} ${article.id}: ready`);
      if (updates.length >= 10) executeUpdates(updates.splice(0));
    } catch (error) {
      failures.push(`${article.id}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`${index + 1}/${articles.length} ${article.id}: failed`);
    }
  }
  executeUpdates(updates);
  console.log(`Question upgrade complete. Failures: ${failures.length}.`);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

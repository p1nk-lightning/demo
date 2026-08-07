import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const values = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
    }),
);

const token = values.DEEPSEEK_DEV_PROXY_TOKEN;
const generationKey = values.DEEPSEEK_GENERATION_API_KEY || values.DEEPSEEK_API_KEY;
const reviewKey = values.DEEPSEEK_REVIEW_API_KEY;
const frontendOrigin = values.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';

if (!token || !generationKey) {
  throw new Error('DEEPSEEK_DEV_PROXY_TOKEN and DEEPSEEK_GENERATION_API_KEY must be configured in .dev.vars.');
}

function send(response, status, body, cors = false) {
  response.writeHead(status, {
    ...(cors ? {
      'access-control-allow-origin': frontendOrigin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    } : {}),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function difficultyPrompt(difficulty) {
  return {
    CET4: 'CET-4 level, common vocabulary, direct sentences, familiar daily topics.',
    CET6: 'CET-6 level, more abstract topics and moderately complex sentences.',
    考研: 'Postgraduate entrance exam level, academic but clear prose, medium complexity.',
    雅思: 'IELTS level, global everyday and academic topics, precise vocabulary.',
    托福: 'TOEFL level, academic reading style, more complex syntax and argumentation.',
  }[difficulty];
}

function countHits(article, words) {
  return [...new Set(words.filter((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(article)))];
}

async function generateArticle(request, response) {
  if (request.headers.origin !== frontendOrigin) {
    return send(response, 403, { error: 'This local proxy only accepts requests from the LexiScene development site.' }, true);
  }
  let input;
  try {
    input = JSON.parse(await readBody(request));
  } catch {
    return send(response, 400, { error: 'Invalid generation request.' }, true);
  }
  if (input?.provider !== 'deepseek' || !difficultyPrompt(input.difficulty) || !Array.isArray(input.sampleWords) || input.sampleWords.length === 0) {
    return send(response, 400, { error: 'Invalid local DeepSeek generation request.' }, true);
  }
  const wordCount = Number.isInteger(input.wordCount) && input.wordCount >= 100 && input.wordCount <= 1500 ? input.wordCount : 300;
  const questionCount = input.questionCount === 3 || input.questionCount === 5 ? input.questionCount : 5;
  const topic = typeof input.topic === 'string' && input.topic !== '随机' ? input.topic : 'a suitable engaging topic';
  const words = input.sampleWords.slice(0, 50).map((word) => String(word).trim()).filter(Boolean);
  const upstream = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${generationKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: values.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: `You create English reading comprehension for Chinese learners. ${difficultyPrompt(input.difficulty)} Write approximately ${wordCount} English words about ${topic}. Create exactly ${questionCount} Chinese multiple-choice questions, each with four options and one answer index. Return JSON only: {title, article, questions:[{question,options:[4 strings],answer:0|1|2|3}], difficulty}.` },
        { role: 'user', content: `Naturally include these words when possible: ${words.join(', ')}.` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.65,
    }),
  });
  if (!upstream.ok) return send(response, upstream.status, { error: `DeepSeek returned ${upstream.status}.` }, true);
  const data = await upstream.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return send(response, 502, { error: 'DeepSeek returned no article content.' }, true);
  try {
    const article = JSON.parse(content);
    if (typeof article.title !== 'string' || typeof article.article !== 'string' || !Array.isArray(article.questions)) {
      return send(response, 502, { error: 'DeepSeek returned an invalid article format.' }, true);
    }
    return send(response, 200, {
      ...article,
      difficulty: input.difficulty,
      articleId: randomUUID(),
      provider: 'deepseek',
      model: values.DEEPSEEK_MODEL || 'deepseek-chat',
      vocabHitIds: countHits(article.article, words),
      meetThreshold: true,
    }, true);
  } catch {
    return send(response, 502, { error: 'DeepSeek returned malformed JSON.' }, true);
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS' && request.url === '/api/generate') return send(response, 204, {}, true);
  if (request.method === 'POST' && request.url === '/api/generate') {
    try {
      return await generateArticle(request, response);
    } catch {
      return send(response, 502, { error: 'Unable to generate an article through the local DeepSeek proxy.' }, true);
    }
  }
  if (request.method === 'GET' && request.url === '/healthz') return send(response, 200, { ok: true, service: 'lexiscene-dev-llm-proxy' });
  if (request.method !== 'POST' || request.url !== '/chat/completions') return send(response, 404, { error: 'not found' });
  if (request.headers.authorization !== `Bearer ${token}`) return send(response, 401, { error: 'unauthorized' });
  const key = request.headers['x-lexiscene-model-purpose'] === 'review' ? reviewKey : generationKey;
  if (!key) return send(response, 503, { error: 'The requested local model key is not configured.' });
  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: await readBody(request),
    });
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8' });
    response.end(await upstream.text());
  } catch {
    send(response, 502, { error: 'Unable to reach the DeepSeek API from the local development proxy.' });
  }
});

server.listen(8788, '127.0.0.1', () => {
  console.log('LexiScene local DeepSeek proxy: http://127.0.0.1:8788');
});

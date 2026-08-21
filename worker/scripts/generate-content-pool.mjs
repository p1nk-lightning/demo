import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseName = 'lexiscene';
const remote = process.argv.includes('--remote');
const replaceCandidates = process.argv.includes('--replace-candidates');
const replaceRange = process.argv.includes('--replace-range');
const count = Math.max(1, Math.min(200, Number(process.argv.find((value) => value.startsWith('--count='))?.slice(8)) || 100));
const offset = Math.max(0, Number(process.argv.find((value) => value.startsWith('--offset='))?.slice(9)) || 0);
const concurrency = Math.max(1, Math.min(5, Number(process.argv.find((value) => value.startsWith('--concurrency='))?.slice(14)) || 3));
const sourceNote = 'Public headlines, summaries, and links are used as factual leads. The English learning article is an original rewrite and does not reproduce source text.';
const fallbackCovers = {
  科技: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=82',
  文化: 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=1400&q=82',
  教育: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=1400&q=82',
  生活: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1400&q=82',
  商业: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=82',
  自然: 'https://images.unsplash.com/photo-1469474968028-56623f02e42?auto=format&fit=crop&w=1400&q=82',
};
const difficulties = ['CET4', 'CET6', '考研', '雅思', '托福'];
const topics = ['科技', '文化', '教育', '生活', '商业', '自然'];
const difficultyProfiles = {
  CET4: {
    minWords: 400, maxWords: 500, minSentenceWords: 12, maxSentenceWords: 18, questionCount: 4,
    prompt: 'CET-4 practice level. Use mostly high-frequency college vocabulary from the common 4,500-word range. Keep the topic concrete and the argument explicit. Prefer active voice, direct transitions, and one main clause per sentence; allow only a few contextual challenge words.',
  },
  CET6: {
    minWords: 500, maxWords: 620, minSentenceWords: 16, maxSentenceWords: 22, questionCount: 4,
    prompt: 'CET-6 practice level. Use news, science, or social topics and vocabulary around the common 5,500-word range. Include controlled abstraction, comparison, and inference, but define less familiar terms from context. Use varied but readable sentence structures.',
  },
  考研: {
    minWords: 600, maxWords: 720, minSentenceWords: 19, maxSentenceWords: 26, questionCount: 5,
    prompt: 'Chinese postgraduate entrance-exam reading practice level. Use an academic social-science or science argument with a clear thesis, evidence, contrast, and inference. Use denser discourse markers and occasional embedded clauses, while keeping every claim traceable to the source lead.',
  },
  雅思: {
    minWords: 700, maxWords: 850, minSentenceWords: 18, maxSentenceWords: 26, questionCount: 5,
    prompt: 'IELTS Academic reading practice level. Write a neutral, formal, information-rich text with paragraph-level cohesion, precise reference words, and a mix of factual detail and author purpose. Do not use obscure vocabulary merely to sound difficult.',
  },
  托福: {
    minWords: 750, maxWords: 900, minSentenceWords: 20, maxSentenceWords: 28, questionCount: 5,
    prompt: 'TOEFL academic reading practice level. Write a university-style explanatory passage with an academic topic, cause-and-effect reasoning, examples, and clear rhetorical purpose. Use complex but transparent syntax and make inference questions answerable from the text.',
  },
};
const sourceConfigs = [
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1001/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1003/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1004/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1007/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1014/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1025/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1033/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1045/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1055/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1070/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1090/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1015/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1016/rss.xml', home: 'https://www.npr.org/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1017/rss.xml', home: 'https://www.npr.org/' },
  { id: 'bbc-news', name: 'BBC News', feed: 'https://feeds.bbci.co.uk/news/rss.xml', home: 'https://www.bbc.com/news' },
  { id: 'the-guardian', name: 'The Guardian', feed: 'https://www.theguardian.com/world/rss', home: 'https://www.theguardian.com/' },
  { id: 'sciam', name: 'Scientific American', feed: 'https://rss.sciam.com/ScientificAmerican-Global', home: 'https://www.scientificamerican.com/' },
  { id: 'the-conversation', name: 'The Conversation', feed: 'https://theconversation.com/us/articles.atom', home: 'https://theconversation.com/' },
  { id: 'voa-learning', name: 'VOA Learning English', feed: 'https://learningenglish.voanews.com/', home: 'https://learningenglish.voanews.com/' },
  { id: 'voa-news', name: 'VOA News', feed: 'https://www.voanews.com/', home: 'https://www.voanews.com/' },
  { id: 'ap-news', name: 'AP News', feed: 'https://apnews.com/', home: 'https://apnews.com/' },
  { id: 'nat-geo', name: 'National Geographic', feed: 'https://www.nationalgeographic.com/', home: 'https://www.nationalgeographic.com/' },
  { id: 'youtube', name: 'YouTube', feed: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCpVm7bg6pXKo1Pr6k5kxG9A', home: 'https://www.youtube.com/@NatGeo' },
];

function envValue(name) {
  const text = readFileSync(join(workerRoot, '.dev.vars'), 'utf8');
  return (text.match(new RegExp(`^${name}=(.+)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
}
function sql(value) { return value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`; }
function strip(value = '') { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }
function tag(block, name) { return strip((block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i')) || [])[1]); }
function parseRss(xml, source) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    return { source, title: tag(block, 'title'), url: tag(block, 'link'), summary: tag(block, 'description') || tag(block, 'content:encoded') };
  }).filter((item) => item.title && item.url.startsWith('http'));
}
function targetWords(index, difficulty) {
  const profile = difficultyProfiles[difficulty];
  return profile.minWords + ((index * 137 + 71) % (profile.maxWords - profile.minWords + 1));
}
function wordCount(text) { return text.trim().split(/\s+/).filter(Boolean).length; }
function averageSentenceLength(text) {
  const sentenceCount = Math.max(1, (text.match(/[.!?]+(?:\s|$)/g) || []).length);
  return wordCount(text) / sentenceCount;
}
function normalizedText(value = '') { return value.toLowerCase().replace(/[“”‘’]/g, '').replace(/\s+/g, ' ').trim(); }
function hasCjk(value = '') { return /[\u3400-\u9fff]/u.test(value); }
function validateQuestions(article, expectedCount) {
  const issues = [];
  if (!Array.isArray(article.questions) || article.questions.length !== expectedCount) return ['question_count'];
  const questionKeys = new Set();
  article.questions.forEach((question, index) => {
    const prefix = `question_${index + 1}`;
    if (!question || typeof question.question !== 'string' || !question.question.trim() || hasCjk(question.question)) issues.push(`${prefix}_english_stem`);
    if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some((option) => typeof option !== 'string' || !option.trim() || hasCjk(option))) issues.push(`${prefix}_english_options`);
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) issues.push(`${prefix}_answer`);
    if (typeof question.questionZh !== 'string' || !hasCjk(question.questionZh)) issues.push(`${prefix}_translation`);
    if (!Array.isArray(question.optionsZh) || question.optionsZh.length !== 4 || question.optionsZh.some((option) => typeof option !== 'string' || !hasCjk(option))) issues.push(`${prefix}_option_translations`);
    if (Array.isArray(question.options) && new Set(question.options.map(normalizedText)).size !== 4) issues.push(`${prefix}_duplicate_options`);
    const key = normalizedText(question.question);
    if (questionKeys.has(key)) issues.push(`${prefix}_duplicate_question`);
    questionKeys.add(key);
    if (typeof question.evidence !== 'string' || !normalizedText(article.article).includes(normalizedText(question.evidence))) issues.push(`${prefix}_evidence`);
  });
  return issues;
}

function execute(sqlText, label) {
  const tempDir = join(workerRoot, '..', 'tmp');
  mkdirSync(tempDir, { recursive: true });
  const file = join(tempDir, `lexiscene-${label}-${Date.now()}.sql`);
  writeFileSync(file, sqlText, 'utf8');
  try { execFileSync(process.execPath, [join(workerRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', databaseName, remote ? '--remote' : '--local', '--file', file], { cwd: workerRoot, stdio: 'inherit' }); } finally { unlinkSync(file); }
}

async function collectMaterials() {
  const responses = await Promise.all(sourceConfigs.map(async (source) => {
    try {
      const response = await fetch(source.feed, { headers: { 'user-agent': 'LexiSceneContentBot/1.0 (public learning metadata)' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return [];
      return parseRss(await response.text(), source);
    } catch { return []; }
  }));
  const seen = new Set();
  const items = responses.flat().filter((item) => !seen.has(item.url) && seen.add(item.url));
  if (items.length < offset + count) throw new Error(`Only ${items.length} public source items were available; need ${offset + count}. Check network access and retry.`);
  return items.slice(offset, offset + count);
}

async function generate(material, index, key, model) {
  const difficulty = difficulties[index % difficulties.length];
  const topic = topics[(index * 5 + 1) % topics.length];
  const profile = difficultyProfiles[difficulty];
  const desiredWords = targetWords(index, difficulty);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    console.log(`Generating ${index + 1}: attempt ${attempt + 1}, ${difficulty}, target ${desiredWords} words`);
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, temperature: 0.55, max_tokens: 4000, thinking: { type: 'disabled' }, messages: [
        { role: 'system', content: `Create an original English reading article for Chinese learners. ${profile.prompt} Write ${desiredWords} English words. The article must contain ${profile.minWords}-${profile.maxWords} English words and average ${profile.minSentenceWords}-${profile.maxSentenceWords} words per sentence. Use at least three coherent paragraphs. Use the source only as factual context; never copy sentences. Do not invent facts beyond the lead. Return JSON only: {title, summary, article, questions:[{question,options:[4 strings],answer:0|1|2|3,questionZh,optionsZh:[4 strings],evidence}]}. Include exactly ${profile.questionCount} multiple-choice questions. Every question and all four options must be English; questionZh and optionsZh must be accurate Chinese translations. Evidence must be a short exact English quote copied from the article that supports the answer. Test main idea, detail, vocabulary in context, inference, or author purpose as appropriate.` },
        { role: 'user', content: JSON.stringify({ source: material.source.name, sourceTitle: material.title, sourceSummary: material.summary, sourceUrl: material.url, learningTopic: topic }) },
      ] }),
    });
    if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) continue;
    let article;
    try {
      article = JSON.parse(content);
    } catch {
      console.log(`Generated ${index + 1}: malformed JSON, retrying`);
      continue;
    }
    const words = wordCount(article.article || '');
    const sentenceLength = averageSentenceLength(article.article || '');
    const questionIssues = validateQuestions(article, profile.questionCount);
    console.log(`Generated ${index + 1}: received ${words} words, ${sentenceLength.toFixed(1)} words per sentence`);
    if (typeof article.title === 'string' && article.title.trim() && !hasCjk(article.title) && typeof article.summary === 'string' && typeof article.article === 'string' && !hasCjk(article.article) && article.article.split(/\n\s*\n/).filter(Boolean).length >= 3 && questionIssues.length === 0 && words >= profile.minWords && words <= profile.maxWords && sentenceLength >= profile.minSentenceWords && sentenceLength <= profile.maxSentenceWords) {
      return { id: `content-v4-${String(index + 1).padStart(3, '0')}`, title: article.title, summary: article.summary, content: article.article, questions: article.questions, difficulty, topic, sourceId: material.source.id, sourceTitle: material.title, sourceUrl: material.url, coverUrl: fallbackCovers[topic], wordCount: words, estimatedMinutes: Math.max(3, Math.ceil(words / 150)) };
    }
    if (questionIssues.length) console.log(`Generated ${index + 1}: question validation failed (${questionIssues.slice(0, 5).join(', ')})`);
  }
  throw new Error(`Unable to create a 400-1000 word article for ${material.title}`);
}

function sourceSql() {
  const now = Date.now();
  const unique = [...new Map(sourceConfigs.map((source) => [source.id, source])).values()];
  return unique.map((source) => `INSERT INTO content_sources (id,name,feed_url,homepage_url,license_note,active,updated_at) VALUES (${sql(source.id)},${sql(source.name)},${sql(source.feed)},${sql(source.home)},${sql(sourceNote)},1,${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,feed_url=excluded.feed_url,homepage_url=excluded.homepage_url,license_note=excluded.license_note,active=1,updated_at=excluded.updated_at;`).join('\n');
}
function articleSql(items) {
  const now = Date.now();
  return items.map((item) => `INSERT INTO content_articles (id,title,summary,content,difficulty,topic,word_count,estimated_minutes,questions_json,source_id,source_title,source_url,source_published_at,license_note,status,publish_date,cover_url,created_at,updated_at,reviewed_at,published_at) VALUES (${sql(item.id)},${sql(item.title)},${sql(item.summary)},${sql(item.content)},${sql(item.difficulty)},${sql(item.topic)},${item.wordCount},${item.estimatedMinutes},${sql(JSON.stringify(item.questions))},${sql(item.sourceId)},${sql(item.sourceTitle)},${sql(item.sourceUrl)},NULL,${sql(sourceNote)},'candidate',NULL,${sql(item.coverUrl)},${now},${now},NULL,NULL) ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,content=excluded.content,difficulty=excluded.difficulty,topic=excluded.topic,word_count=excluded.word_count,estimated_minutes=excluded.estimated_minutes,questions_json=excluded.questions_json,source_id=excluded.source_id,source_title=excluded.source_title,source_url=excluded.source_url,license_note=excluded.license_note,status='candidate',publish_date=NULL,cover_url=excluded.cover_url,updated_at=excluded.updated_at,reviewed_at=NULL,published_at=NULL WHERE content_articles.status = 'candidate';`).join('\n');
}

async function main() {
  const key = envValue('DEEPSEEK_GENERATION_API_KEY') || envValue('DEEPSEEK_API_KEY');
  const model = envValue('DEEPSEEK_MODEL') || 'deepseek-chat';
  if (!key) throw new Error('Configure DEEPSEEK_GENERATION_API_KEY in worker/.dev.vars first.');
  const materials = await collectMaterials();
  execute(sourceSql(), 'content-sources');
  const results = new Array(materials.length);
  const failures = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < materials.length) {
      const index = cursor++;
      try {
        results[index] = await generate(materials[index], index + offset, key, model);
        console.log(`Generated ${index + 1} / ${materials.length}: ${results[index].wordCount} words`);
      } catch (error) {
        failures.push({ index: index + offset, title: materials[index].title, error: error instanceof Error ? error.message : String(error) });
        console.error(`Failed ${index + 1} / ${materials.length}: ${materials[index].title}`);
        console.error(error instanceof Error ? error.message : error);
      }
    }
  }));
  const successful = results.filter(Boolean);
  for (let index = 0; index < successful.length; index += 5) execute(articleSql(successful.slice(index, index + 5)), `content-v4-${offset}-${index}`);
  // Keep old candidates until all new rows have been written successfully.
  if (replaceCandidates && failures.length === 0) execute(`DELETE FROM content_articles WHERE status = 'candidate' AND id NOT IN (${results.map((item) => sql(item.id)).join(',')});`, 'clear-candidates');
  console.log(`Done: imported ${successful.length}/${results.length} candidate articles at offset ${offset}. Mode: ${remote ? 'remote' : 'local'}.`);
  if (failures.length) {
    console.error(`Retry these offsets in the next batch: ${failures.map((failure) => `${failure.index + 1} (${failure.title})`).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

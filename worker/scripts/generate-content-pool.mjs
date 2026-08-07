import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseName = 'lexiscene';
const remote = process.argv.includes('--remote');
const replaceCandidates = process.argv.includes('--replace-candidates');
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
function targetWords(index) { return 400 + ((index * 137 + 71) % 601); }
function difficultyPrompt(difficulty) { return { CET4: 'CET-4 level, direct but natural prose.', CET6: 'CET-6 level, moderate complexity and clear explanation.', 考研: 'Chinese postgraduate entrance exam level, academic but readable prose.', 雅思: 'IELTS Academic level, coherent formal argumentation.', 托福: 'TOEFL level, academic reading style with more complex syntax.' }[difficulty]; }
function wordCount(text) { return text.trim().split(/\s+/).filter(Boolean).length; }

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
  const desiredWords = targetWords(index);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    console.log(`Generating ${index + 1}: attempt ${attempt + 1}, target ${desiredWords} words`);
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, temperature: 0.55, max_tokens: 2400, thinking: { type: 'disabled' }, messages: [
        { role: 'system', content: `Create an original English reading article for Chinese learners. ${difficultyPrompt(difficulty)} Write ${desiredWords} English words (strictly between 400 and 1000 words). Use the source only as factual context; never copy sentences. Do not invent facts beyond the lead. Return JSON only: {title, summary, article, questions:[{question,options:[4 strings],answer:0|1|2|3}]}. Include exactly ${desiredWords < 650 ? 3 : 4} Chinese multiple-choice questions.` },
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
    console.log(`Generated ${index + 1}: received ${words} words`);
    if (typeof article.title === 'string' && typeof article.summary === 'string' && Array.isArray(article.questions) && words >= 400 && words <= 1000) {
      return { id: `content-v4-${String(index + 1).padStart(3, '0')}`, title: article.title, summary: article.summary, content: article.article, questions: article.questions, difficulty, topic, sourceId: material.source.id, sourceTitle: material.title, sourceUrl: material.url, coverUrl: fallbackCovers[topic], wordCount: words, estimatedMinutes: Math.max(3, Math.ceil(words / 150)) };
    }
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
  return items.map((item) => `INSERT INTO content_articles (id,title,summary,content,difficulty,topic,word_count,estimated_minutes,questions_json,source_id,source_title,source_url,source_published_at,license_note,status,publish_date,cover_url,created_at,updated_at,reviewed_at,published_at) VALUES (${sql(item.id)},${sql(item.title)},${sql(item.summary)},${sql(item.content)},${sql(item.difficulty)},${sql(item.topic)},${item.wordCount},${item.estimatedMinutes},${sql(JSON.stringify(item.questions))},${sql(item.sourceId)},${sql(item.sourceTitle)},${sql(item.sourceUrl)},NULL,${sql(sourceNote)},'candidate',NULL,${sql(item.coverUrl)},${now},${now},NULL,NULL);`).join('\n');
}

async function main() {
  const key = envValue('DEEPSEEK_GENERATION_API_KEY') || envValue('DEEPSEEK_API_KEY');
  const model = envValue('DEEPSEEK_MODEL') || 'deepseek-chat';
  if (!key) throw new Error('Configure DEEPSEEK_GENERATION_API_KEY in worker/.dev.vars first.');
  const materials = await collectMaterials();
  execute(sourceSql(), 'content-sources');
  if (replaceCandidates) execute("DELETE FROM content_articles WHERE status = 'candidate';", 'clear-candidates');
  const results = new Array(materials.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < materials.length) {
      const index = cursor++;
      results[index] = await generate(materials[index], index + offset, key, model);
      console.log(`Generated ${index + 1} / ${materials.length}: ${results[index].wordCount} words`);
    }
  }));
  for (let index = 0; index < results.length; index += 5) execute(articleSql(results.slice(index, index + 5)), `content-v4-${index}`);
  console.log(`Done: imported ${results.length} candidate articles at offset ${offset}. Mode: ${remote ? 'remote' : 'local'}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

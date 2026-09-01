import { z } from 'zod';

import { countVocabHits, englishWordCount, hasCjk, normalizedText } from './wordstats';
import { GenerateRequestSchema, PublicReviewArticleSchema } from '../schemas';
import type { Difficulty, GeneratedArticlePayload } from '../schemas';

const PUBLIC_DIFFICULTY_LIMITS: Record<Difficulty, { minWords: number; maxWords: number; minSentenceWords: number; maxSentenceWords: number }> = {
  CET4: { minWords: 400, maxWords: 500, minSentenceWords: 10, maxSentenceWords: 20 },
  CET6: { minWords: 500, maxWords: 620, minSentenceWords: 13, maxSentenceWords: 25 },
  考研: { minWords: 600, maxWords: 720, minSentenceWords: 15, maxSentenceWords: 30 },
  雅思: { minWords: 700, maxWords: 850, minSentenceWords: 14, maxSentenceWords: 30 },
  托福: { minWords: 750, maxWords: 900, minSentenceWords: 16, maxSentenceWords: 32 },
};

export function validateGeneratedArticle(article: GeneratedArticlePayload, input: z.infer<typeof GenerateRequestSchema>, targetHits: number) {
  const issues: string[] = [];
  const words = englishWordCount(article.article);
  const minimumWords = Math.max(80, Math.floor(input.wordCount * 0.8));
  const maximumWords = Math.ceil(input.wordCount * 1.2);
  if (words < minimumWords || words > maximumWords) issues.push(`article_word_count:${words}:${minimumWords}-${maximumWords}`);
  if (article.difficulty !== input.difficulty) issues.push(`difficulty_mismatch:${article.difficulty}:${input.difficulty}`);
  if (article.questions.length !== input.questionCount) issues.push(`question_count:${article.questions.length}:${input.questionCount}`);
  if (hasCjk(article.title)) issues.push('title_must_be_english');
  if (hasCjk(article.article)) issues.push('article_must_be_english');
  if (input.wordCount >= 250 && article.article.split(/\n\s*\n/).filter(Boolean).length < 2) issues.push('article_needs_multiple_paragraphs');

  const hitCount = countVocabHits(article.article, input.sampleWords).length;
  if (hitCount < targetHits) issues.push(`target_word_hits:${hitCount}:${targetHits}`);
  const questionKeys = new Set<string>();

  article.questions.forEach((question, index) => {
    const prefix = `question_${index + 1}`;
    if (hasCjk(question.question)) issues.push(`${prefix}_must_be_english`);
    if (!hasCjk(question.questionZh)) issues.push(`${prefix}_missing_chinese_translation`);
    if (question.options.some((option) => hasCjk(option))) issues.push(`${prefix}_options_must_be_english`);
    if (question.optionsZh.some((option) => !hasCjk(option))) issues.push(`${prefix}_option_translations_missing`);
    if (new Set(question.options.map(normalizedText)).size !== 4) issues.push(`${prefix}_duplicate_options`);
    const questionKey = normalizedText(question.question);
    if (questionKeys.has(questionKey)) issues.push(`${prefix}_duplicate_question`);
    questionKeys.add(questionKey);
    if (!normalizedText(article.article).includes(normalizedText(question.evidence))) issues.push(`${prefix}_evidence_not_found`);
  });

  return { issues, wordCount: words, hitCount };
}

export function validatePublicArticle(article: z.infer<typeof PublicReviewArticleSchema>, difficulty: Difficulty) {
  const issues: string[] = [];
  const limits = PUBLIC_DIFFICULTY_LIMITS[difficulty];
  const words = englishWordCount(article.content);
  const sentenceCount = Math.max(1, article.content.match(/[.!?]+(?:\s|$)/g)?.length ?? 0);
  const averageSentenceWords = words / sentenceCount;
  if (words < limits.minWords || words > limits.maxWords) issues.push(`正文词数为 ${words}，${difficulty} 应为 ${limits.minWords}-${limits.maxWords} 词`);
  if (averageSentenceWords < limits.minSentenceWords || averageSentenceWords > limits.maxSentenceWords) issues.push(`平均句长为 ${averageSentenceWords.toFixed(1)}，建议范围 ${limits.minSentenceWords}-${limits.maxSentenceWords}`);
  if (hasCjk(article.title)) issues.push('英文标题中含有中文字符');
  if (hasCjk(article.content)) issues.push('英文正文中含有中文字符');
  if (article.content.split(/\n\s*\n/).filter(Boolean).length < 3) issues.push('正文少于三个段落');
  const questionKeys = new Set<string>();
  article.questions.forEach((question, index) => {
    const label = `第 ${index + 1} 题`;
    if (hasCjk(question.question)) issues.push(`${label}题干不是纯英文`);
    if (question.options.some((option) => !option.trim() || hasCjk(option))) issues.push(`${label}存在空选项或中文选项`);
    if (!hasCjk(question.questionZh ?? '') || !question.optionsZh || question.optionsZh.some((option) => !hasCjk(option))) issues.push(`${label}缺少中文翻译`);
    if (new Set(question.options.map(normalizedText)).size !== 4) issues.push(`${label}存在重复选项`);
    const key = normalizedText(question.question);
    if (questionKeys.has(key)) issues.push(`${label}与其他题目重复`);
    questionKeys.add(key);
    if (!question.evidence || !normalizedText(article.content).includes(normalizedText(question.evidence))) issues.push(`${label}证据句无法在正文中找到`);
  });
  return { issues, wordCount: words, averageSentenceWords };
}

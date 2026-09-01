// 双端契约单一来源(ADR-003):前端类型与 Worker 校验共用这一份 zod 定义。
// 规则:跨边界的字段级契约只允许出现在这里;各端只做 re-export 与本地视图扩展。
import { z } from 'zod';

// ── 枚举 ──
export const DifficultySchema = z.enum(['CET4', 'CET6', '考研', '雅思', '托福']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const WordSourceSchema = z.enum(['pasted', 'xlsx', 'pdf', 'image', 'reading']);
export type WordSource = z.infer<typeof WordSourceSchema>;

export const ArticleTopicSchema = z.enum(['随机', '科技', '文化', '教育', '生活', '商业', '自然']);
export type ArticleTopic = z.infer<typeof ArticleTopicSchema>;

export const ModelProviderSchema = z.enum(['deepseek', 'qwen', 'doubao']);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

// ── 题目(生成与阅读共用) ──
export const QuestionSchema = z.object({
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  answer: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  questionZh: z.string().min(1).optional(),
  optionsZh: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  evidence: z.string().min(1).optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// ── 词(核心输入形;云端条目线缆形见 VocabularyItemSchema) ──
export const WordSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
  normalized: z.string().min(1),
  source: WordSourceSchema,
  mastered: z.boolean().optional(),
  addedAt: z.number(),
  updatedAt: z.number().optional(),
});
export type Word = z.infer<typeof WordSchema>;

// ── 云同步线缆契约(/api/sync/*) ──
export const VocabularyListSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().max(200),
  difficulty: DifficultySchema,
  wordCount: z.number().int().nonnegative(),
  masteredCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().optional(),
  schemaVersion: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
export type VocabularyListWire = z.infer<typeof VocabularyListSchema>;

export const VocabularyItemSchema = z.object({
  id: z.string().min(1).max(120),
  listId: z.string().min(1).max(120),
  text: z.string().min(1).max(300),
  normalized: z.string().min(1).max(300),
  source: WordSourceSchema,
  mastered: z.boolean(),
  addedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
export type VocabularyItemWire = z.infer<typeof VocabularyItemSchema>;

export const ArticleWireSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  article: z.string().min(1).max(100000),
  questions: z.array(QuestionSchema).max(10),
  difficulty: DifficultySchema,
  vocabHitIds: z.array(z.string().max(300)).max(500),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative().optional(),
  summary: z.string().max(2000).optional(),
  topic: ArticleTopicSchema.optional(),
  wordCount: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  source: z.enum(['generated', 'daily']).optional(),
  coverUrl: z.string().max(2000).optional(),
  publishDate: z.string().max(40).optional(),
  provider: ModelProviderSchema.optional(),
  model: z.string().max(160).optional(),
  deletedAt: z.number().int().nonnegative().optional(),
});
export type ArticleWire = z.infer<typeof ArticleWireSchema>;

export const UserProgressSchema = z.object({
  id: z.string().min(1).max(120),
  articleId: z.string().min(1).max(120),
  answers: z.array(z.union([z.number().int().min(0).max(3), z.null()])).max(20),
  score: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
export type UserProgressWire = z.infer<typeof UserProgressSchema>;

export const SyncPayloadSchema = z.object({
  vocabLists: z.array(VocabularyListSchema).max(2000),
  vocabItems: z.array(VocabularyItemSchema).max(20000),
  articles: z.array(ArticleWireSchema).max(2000),
  progress: z.array(UserProgressSchema).max(5000),
});
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

// ── 生成请求(Word 端发送、Worker 校验;default 语义与原实现一致) ──
export const GenerateRequestSchema = z.object({
  provider: ModelProviderSchema,
  difficulty: DifficultySchema,
  sampleWords: z.array(z.string()).min(1).max(50),
  wordCount: z.number().int().min(100).max(1500).default(300),
  topic: ArticleTopicSchema.default('随机'),
  questionCount: z.union([z.literal(3), z.literal(5)]).default(5),
});
export type GenerateRequestWire = z.input<typeof GenerateRequestSchema>;

// ── 词典条目线缆契约(/api/dictionary* 的 item 形) ──
export const DictionaryItemSchema = z.object({
  dictionaryId: z.string().optional(),
  dictionaryName: z.string().optional(),
  word: z.string(),
  phonetic: z.string().optional(),
  partOfSpeech: z.string().optional(),
  definitionEN: z.string().optional(),
  meaningCN: z.string(),
  exampleEN: z.string().optional(),
  difficulty: z.string().optional(),
  frequencyRank: z.number().optional(),
});
export type DictionaryItem = z.infer<typeof DictionaryItemSchema>;

import { z } from 'zod';

export type Difficulty = 'CET4' | 'CET6' | '考研' | '雅思' | '托福';

export const DifficultySchema = z.enum(['CET4', 'CET6', '考研', '雅思', '托福']);
export const TopicSchema = z.enum(['随机', '科技', '文化', '教育', '生活', '商业', '自然']);
export const QuestionSchema = z.object({
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  answer: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  questionZh: z.string().min(1).optional(),
  optionsZh: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional(),
  evidence: z.string().min(1).optional(),
});
export const GeneratedQuestionSchema = QuestionSchema.extend({
  options: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  questionZh: z.string().min(1),
  optionsZh: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  evidence: z.string().min(1),
});
export const ArticlePayloadSchema = z.object({
  title: z.string().min(1),
  article: z.string().min(80),
  questions: z.array(GeneratedQuestionSchema).min(3).max(5),
  difficulty: DifficultySchema,
});
export const ModelProviderSchema = z.enum(['deepseek', 'qwen', 'doubao']);
export const GenerateRequestSchema = z.object({
  provider: ModelProviderSchema,
  difficulty: DifficultySchema,
  sampleWords: z.array(z.string()).min(1).max(50),
  wordCount: z.number().int().min(100).max(1500).default(300),
  topic: TopicSchema.default('随机'),
  questionCount: z.union([z.literal(3), z.literal(5)]).default(5),
});
export const RegisterRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().min(1).max(2048),
});
export const LoginRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});
export const VerifyEmailRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export const SyncVocabListSchema = z.object({
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
export const SyncVocabItemSchema = z.object({
  id: z.string().min(1).max(120),
  listId: z.string().min(1).max(120),
  text: z.string().min(1).max(300),
  normalized: z.string().min(1).max(300),
  source: z.enum(['pasted', 'xlsx', 'pdf', 'image', 'reading']),
  mastered: z.boolean(),
  addedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
export const SyncArticleSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  article: z.string().min(1).max(100000),
  questions: z.array(QuestionSchema).max(10),
  difficulty: DifficultySchema,
  vocabHitIds: z.array(z.string().max(300)).max(500),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative().optional(),
  summary: z.string().max(2000).optional(),
  topic: TopicSchema.optional(),
  wordCount: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  source: z.enum(['generated', 'daily']).optional(),
  coverUrl: z.string().max(2000).optional(),
  publishDate: z.string().max(40).optional(),
  provider: ModelProviderSchema.optional(),
  model: z.string().max(160).optional(),
  deletedAt: z.number().int().nonnegative().optional(),
});
export const SyncProgressSchema = z.object({
  id: z.string().min(1).max(120),
  articleId: z.string().min(1).max(120),
  answers: z.array(z.union([z.number().int().min(0).max(3), z.null()])).max(20),
  score: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});
export const SyncPayloadSchema = z.object({
  vocabLists: z.array(SyncVocabListSchema).max(2000),
  vocabItems: z.array(SyncVocabItemSchema).max(20000),
  articles: z.array(SyncArticleSchema).max(2000),
  progress: z.array(SyncProgressSchema).max(5000),
});
export const DictionaryBatchSchema = z.object({
  words: z.array(z.string().trim().min(1).max(80)).min(1).max(500),
});
export const ContentReviewSchema = z.object({
  action: z.enum(['approve', 'publish', 'archive', 'candidate']),
  publishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const AiReviewCoreSchema = z.object({
  verdict: z.enum(['pass', 'needs_revision', 'reject']),
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(2000),
  strengths: z.array(z.string().min(1).max(500)).max(8),
  issues: z.array(z.string().min(1).max(500)).max(8),
  factualChecks: z.array(z.string().min(1).max(500)).max(8),
  scores: z.object({
    englishQuality: z.number().int().min(0).max(100),
    levelFit: z.number().int().min(0).max(100),
    questionQuality: z.number().int().min(0).max(100),
    factualReliability: z.number().int().min(0).max(100),
    originality: z.number().int().min(0).max(100),
  }),
  questionChecks: z.array(z.object({
    index: z.number().int().min(1).max(10),
    answerSupported: z.boolean(),
    evidenceFound: z.boolean(),
    issue: z.string().max(500),
  })).max(10),
  copyrightRisk: z.object({
    level: z.enum(['low', 'medium', 'high']),
    reason: z.string().min(1).max(1000),
  }),
});
export const AiReviewSchema = AiReviewCoreSchema.extend({
  repairCount: z.number().int().min(0).max(2),
  deterministicIssues: z.array(z.string().min(1).max(500)).max(30),
});
export const PublicArticleRepairSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(2000),
  content: z.string().min(80).max(100000),
  questions: z.array(GeneratedQuestionSchema).min(3).max(5),
});
export const PublicReviewArticleSchema = PublicArticleRepairSchema.extend({
  questions: z.array(QuestionSchema).min(3).max(5),
});

export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export type AiReviewCore = z.infer<typeof AiReviewCoreSchema>;

export type GeneratedArticlePayload = z.infer<typeof ArticlePayloadSchema>;

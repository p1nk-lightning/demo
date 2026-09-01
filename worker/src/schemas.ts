// Worker 侧 schema 入口:跨端契约 re-export 自 shared/contracts(单一来源),
// 仅 Worker 本地的请求/审核 schema 留在此文件。
import { z } from 'zod';
import {
  DifficultySchema,
  ArticleTopicSchema,
  ModelProviderSchema,
  QuestionSchema,
} from '../../shared/contracts';

export {
  DifficultySchema,
  ArticleTopicSchema as TopicSchema,
  ModelProviderSchema,
  QuestionSchema,
  GenerateRequestSchema,
  SyncPayloadSchema,
} from '../../shared/contracts';
export type {
  Difficulty,
  ArticleTopic,
  ModelProvider,
  Question,
  Word,
  WordSource,
  SyncPayload,
} from '../../shared/contracts';

const GeneratedQuestionSchema = QuestionSchema.extend({
  options: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  questionZh: z.string().min(1),
  optionsZh: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  evidence: z.string().min(1),
});
export { GeneratedQuestionSchema };

export const ArticlePayloadSchema = z.object({
  title: z.string().min(1),
  article: z.string().min(80),
  questions: z.array(GeneratedQuestionSchema).min(3).max(5),
  difficulty: DifficultySchema,
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

export type AiReviewCore = z.infer<typeof AiReviewCoreSchema>;

export type GeneratedArticlePayload = z.infer<typeof ArticlePayloadSchema>;

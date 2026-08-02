import { z } from 'zod';

// BR-05: LLM 必须返回结构化 JSON, 后端用 Zod 二次校验
export const QuestionSchema = z.object({
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  answer: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export const ArticlePayloadSchema = z.object({
  title: z.string().min(1),
  article: z.string().min(50, '文章过短（<50 字符）'),
  questions: z.array(QuestionSchema).length(5, '必须恰好 5 道题'),
});

export type ArticlePayload = z.infer<typeof ArticlePayloadSchema>;

export const DifficultySchema = z.union([
  z.literal('CET4'),
  z.literal('CET6'),
  z.literal('考研'),
  z.literal('雅思'),
  z.literal('托福'),
]);

export const GenerateRequestSchema = z.object({
  difficulty: DifficultySchema,
  sampleWords: z.array(z.string()).min(1).max(50),
});

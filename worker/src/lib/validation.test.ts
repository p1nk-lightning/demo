import { describe, expect, it } from 'vitest';
import { ArticlePayloadSchema, GenerateRequestSchema, QuestionSchema } from '../schemas';
import { validateGeneratedArticle, validatePublicArticle } from './validation';

const VOCAB = ['analyze', 'data', 'pattern', 'current', 'reveal'];

function generatedArticle(overrides?: Partial<{
  title: string;
  article: string;
  questionCount: number;
  evidence: string;
  questionText: string;
  options: [string, string, string, string];
  distinctQuestions: boolean;
}>) {
  const sentence = 'Marine scientists analyze the data and reveal a clear pattern. The current in the ocean is strong. ';
  const para = sentence.repeat(5); // ~85 词
  const article = overrides?.article ?? `${para}\n\n${para}${para}`; // 255 词,两个段落
  const options = overrides?.options ?? ['A. cause', 'B. effect', 'C. method', 'D. result'];
  const questionCount = overrides?.questionCount ?? 3;
  const stems = ['What does the article mainly analyze?', 'What do scientists reveal in the ocean?', 'Which pattern is discussed in the text?'];
  return {
    title: overrides?.title ?? 'A Pattern in Ocean Currents',
    article,
    difficulty: 'CET4' as const,
    questions: Array.from({ length: questionCount }, (_, i) => ({
      question: (overrides?.distinctQuestions ?? true)
        ? stems[i % stems.length]
        : (overrides?.questionText ?? stems[0]),
      options,
      answer: 0 as const,
      questionZh: `第 ${i + 1} 题中文题干？`,
      optionsZh: ['A. 原因', 'B. 结果', 'C. 方法', 'D. 影响'] as [string, string, string, string],
      evidence: overrides?.evidence ?? 'a clear pattern',
    })),
  };
}

function generatedInput(questionCount = 3, wordCount = 300, sampleWords = VOCAB) {
  return GenerateRequestSchema.parse({ provider: 'deepseek', difficulty: 'CET4', sampleWords, wordCount, questionCount });
}

describe('validateGeneratedArticle', () => {
  it('accepts a payload meeting word count, hit and question constraints', () => {
    const payload = ArticlePayloadSchema.parse(generatedArticle());
    const quality = validateGeneratedArticle(payload, generatedInput(), 5);
    expect(quality.issues).toEqual([]);
  });

  it('flags word count below the 80% floor', () => {
    const payload = ArticlePayloadSchema.parse(generatedArticle({ article: 'Short article about ocean currents and data analysis. It has some words here for the test.' }));
    const quality = validateGeneratedArticle(payload, generatedInput(), 5);
    expect(quality.issues.some((issue) => issue.startsWith('article_word_count:'))).toBe(true);
  });

  it('flags difficulty mismatch, question count mismatch and CJK leakage (dirty input)', () => {
    const payload = ArticlePayloadSchema.parse(generatedArticle({ title: '海洋模式 Ocean Pattern' }));
    const issues = validateGeneratedArticle(payload, { ...generatedInput(), questionCount: 5 }, 5).issues;
    expect(issues).toContain('title_must_be_english');
    expect(issues).toContain('question_count:3:5');
  });
});

describe('validateGeneratedArticle: precise issue codes', () => {
  it('reports title_must_be_english for CJK title', () => {
    const payload = ArticlePayloadSchema.parse(generatedArticle({ title: '海洋模式' }));
    expect(validateGeneratedArticle(payload, generatedInput(), 5).issues).toContain('title_must_be_english');
  });

  it('reports question_count mismatch against the request', () => {
    const payload = ArticlePayloadSchema.parse(generatedArticle({ questionCount: 4 }));
    expect(validateGeneratedArticle(payload, generatedInput(), 5).issues).toContain('question_count:4:3');
  });

  it('reports missing chinese translation and english-only violations per question', () => {
    const payload = ArticlePayloadSchema.parse(generatedArticle({
      distinctQuestions: false,
      questionText: '文章主要分析了什么？',
      options: ['A. 原因', 'B. effect', 'C. method', 'D. result'],
    }));
    const issues = validateGeneratedArticle(payload, generatedInput(), 5).issues;
    expect(issues.some((issue) => issue.startsWith('question_1_must_be_english'))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('question_1_options_must_be_english'))).toBe(true);
  });

  it('reports duplicate options and unfindable evidence', () => {
    const payload = ArticlePayloadSchema.parse(generatedArticle({
      options: ['A. cause', 'A. cause', 'C. method', 'D. result'],
      evidence: 'this quote does not exist in the article at all',
    }));
    const issues = validateGeneratedArticle(payload, generatedInput(), 5).issues;
    expect(issues.some((issue) => issue.startsWith('question_1_duplicate_options'))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('question_1_evidence_not_found'))).toBe(true);
  });

  it('bypasses payload schema floor to verify empty question list handling (LLM dirty JSON)', () => {
    const payload = { ...generatedArticle(), questions: [] } as Parameters<typeof validateGeneratedArticle>[0];
    expect(validateGeneratedArticle(payload, generatedInput(), 5).issues).toContain('question_count:0:3');
  });
});

describe('validatePublicArticle', () => {
  function publicArticle(overrides?: Partial<{ content: string; paragraphs: number; questionCount: number }>) {
    const sentence = 'Researchers analyze the data and reveal a clear pattern in ocean systems today.';
    const paragraphs = overrides?.paragraphs ?? 3;
    const para = (sentence + ' ').repeat(12); // ~144 词 / 12 句,句均 12 词
    const content = overrides?.content ?? Array.from({ length: paragraphs }, () => para).join('\n\n');
    const stems = ['What do researchers analyze?', 'What is revealed in the ocean systems?', 'Which pattern is clear in the text?'];
    return {
      title: 'A Pattern in Ocean Systems',
      summary: 'Researchers analyze ocean data.',
      content,
      questions: Array.from({ length: overrides?.questionCount ?? 3 }, (_, i) => ({
        question: stems[i % stems.length],
        options: ['A. data', 'B. fish', 'C. ships', 'D. storms'] as [string, string, string, string],
        answer: 0 as const,
        questionZh: `第 ${i + 1} 题中文题干？`,
        optionsZh: ['A. 数据', 'B. 鱼', 'C. 船', 'D. 风暴'] as [string, string, string, string],
        evidence: 'analyze the data',
      })),
    };
  }

  it('accepts a CET4-length article with three paragraphs and answerable questions', () => {
    expect(validatePublicArticle(publicArticle(), 'CET4').issues).toEqual([]);
  });

  it('flags word count out of the CET4 band and missing paragraphs', () => {
    const short = validatePublicArticle(publicArticle({ content: 'Too short entirely.' }), 'CET4');
    expect(short.issues.some((issue) => issue.includes('正文词数'))).toBe(true);
    const thin = validatePublicArticle(publicArticle({ paragraphs: 1 }), 'CET4');
    expect(thin.issues).toContain('正文少于三个段落');
  });

  it('flags missing chinese translation and unfindable evidence', () => {
    const article = publicArticle();
    article.questions = article.questions.map((q, i) => i === 0
      ? { ...q, questionZh: undefined, optionsZh: undefined, evidence: 'no such sentence anywhere' }
      : q);
    const issues = validatePublicArticle(article, 'CET4').issues;
    expect(issues.some((issue) => issue.includes('缺少中文翻译'))).toBe(true);
    expect(issues.some((issue) => issue.includes('证据句无法在正文中找到'))).toBe(true);
  });
});

describe('worker schemas reject dirty input', () => {
  it('GenerateRequestSchema applies defaults and rejects bad difficulty', () => {
    const parsed = GenerateRequestSchema.parse({ provider: 'deepseek', difficulty: 'CET4', sampleWords: ['analyze'] });
    expect(parsed.wordCount).toBe(300);
    expect(parsed.topic).toBe('随机');
    expect(parsed.questionCount).toBe(5);
    expect(GenerateRequestSchema.safeParse({ provider: 'deepseek', difficulty: 'GRE', sampleWords: ['x'] }).success).toBe(false);
  });

  it('QuestionSchema rejects answer index out of range', () => {
    expect(QuestionSchema.safeParse({ question: 'q', options: ['a', 'b', 'c', 'd'], answer: 4 }).success).toBe(false);
  });

  it('GenerateRequestSchema rejects empty sample words', () => {
    expect(GenerateRequestSchema.safeParse({ provider: 'deepseek', difficulty: 'CET4', sampleWords: [] }).success).toBe(false);
  });
});

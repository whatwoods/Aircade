import { z } from 'zod';

export const workTypeValues = [
  'game',
  'tool',
  'social',
  'ai',
  'other',
] as const;

const urlFieldSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .pipe(z.string().url('请输入合法的链接').optional());

const screenshotLinesSchema = z
  .string()
  .trim()
  .transform((value) =>
    value === ''
      ? []
      : value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
  )
  .pipe(
    z.array(z.string().url('截图链接格式不正确')).max(6, '最多填写 6 张截图')
  );

export const createWorkInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, '标题至少 2 个字符')
      .max(30, '标题不能超过 30 个字符'),
    type: z.enum(workTypeValues, {
      errorMap: () => ({ message: '作品类型不正确' }),
    }),
    tagline: z
      .string()
      .trim()
      .min(4, '一句话介绍至少 4 个字符')
      .max(30, '一句话介绍不能超过 30 个字符'),
    description: z
      .string()
      .trim()
      .min(20, '作品介绍至少 20 个字符')
      .max(300, '作品介绍不能超过 300 个字符'),
    coverUrl: z.string().trim().url('封面链接格式不正确'),
    screenshots: screenshotLinesSchema,
    webUrl: urlFieldSchema,
    qrUrl: urlFieldSchema,
  })
  .refine((value) => Boolean(value.webUrl || value.qrUrl), {
    message: '至少提供网页链接或二维码链接之一',
    path: ['webUrl'],
  });

export const reviewDecisionSchema = z.enum(['approve', 'reject'], {
  errorMap: () => ({ message: '审核动作不正确' }),
});

export const reviewWorkInputSchema = z
  .object({
    workId: z.string().trim().uuid('作品标识不正确'),
    decision: reviewDecisionSchema,
    rejectReason: z
      .string()
      .trim()
      .transform((value) => (value === '' ? undefined : value))
      .pipe(z.string().max(120, '拒绝原因不能超过 120 个字符').optional()),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'reject' && !value.rejectReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '拒绝时必须填写原因',
        path: ['rejectReason'],
      });
    }
  });

export type WorkType = (typeof workTypeValues)[number];
export type CreateWorkInput = z.infer<typeof createWorkInputSchema>;
export type ReviewWorkInput = z.infer<typeof reviewWorkInputSchema>;

export function parseCreateWorkFormData(formData: FormData): CreateWorkInput {
  return createWorkInputSchema.parse({
    title: formData.get('title'),
    type: formData.get('type'),
    tagline: formData.get('tagline'),
    description: formData.get('description'),
    coverUrl: formData.get('coverUrl'),
    screenshots: formData.get('screenshots'),
    webUrl: formData.get('webUrl'),
    qrUrl: formData.get('qrUrl'),
  });
}

export function parseReviewWorkFormData(formData: FormData): ReviewWorkInput {
  return reviewWorkInputSchema.parse({
    workId: formData.get('workId'),
    decision: formData.get('decision'),
    rejectReason: formData.get('rejectReason'),
  });
}

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

const uploadedAssetPathSchema = z
  .string()
  .trim()
  .regex(/^\/uploads\/[\w/-]+\.[a-z0-9]+$/i, '图片地址格式不正确');

const imageSourceSchema = z.union([
  z.string().trim().url('图片地址格式不正确'),
  uploadedAssetPathSchema,
]);

const screenshotUrlsSchema = z
  .array(imageSourceSchema)
  .max(6, '最多填写 6 张截图');

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
    coverUrl: imageSourceSchema,
    screenshots: screenshotUrlsSchema,
    webUrl: urlFieldSchema,
    qrUrl: z
      .string()
      .trim()
      .transform((value) => (value === '' ? undefined : value))
      .pipe(imageSourceSchema.optional()),
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
  const screenshotLines = String(formData.get('screenshots') ?? '')
    .trim()
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  return createWorkInputSchema.parse({
    title: formData.get('title'),
    type: formData.get('type'),
    tagline: formData.get('tagline'),
    description: formData.get('description'),
    coverUrl: formData.get('coverUrl'),
    screenshots: screenshotLines,
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

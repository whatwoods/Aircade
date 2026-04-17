import { z } from 'zod';

const USERNAME_RE = /^[\p{L}\p{N}_]+$/u;

function normalizeUsername(value: string) {
  return value.trim().normalize('NFKC').toLowerCase();
}

function normalizeDisplayName(value: string) {
  return value.trim().normalize('NFKC');
}

function normalizeInviteCode(value: string) {
  return value.trim().normalize('NFKC').toUpperCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .refine((value) => value.length >= 3 && value.length <= 20, {
    message: '用户名需为 3 到 20 个字符',
  })
  .refine((value) => USERNAME_RE.test(value), {
    message: '用户名只允许中文、字母、数字和下划线',
  });

export const displayNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .refine((value) => value.length >= 3 && value.length <= 20, {
    message: '用户名需为 3 到 20 个字符',
  })
  .refine((value) => USERNAME_RE.test(value), {
    message: '用户名只允许中文、字母、数字和下划线',
  });

export const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(72, '密码长度不能超过 72 位');

export const inviteCodeSchema = z
  .string()
  .transform(normalizeInviteCode)
  .refine((value) => value.length >= 4 && value.length <= 32, {
    message: '邀请码格式不正确',
  });

export const optionalEmailSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : normalizeEmail(value)))
  .pipe(z.string().email('邮箱格式不正确').max(254).optional());

export const loginInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, '请输入密码'),
});

export const registerInputSchema = z.object({
  inviteCode: inviteCodeSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  email: optionalEmailSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;

export function parseLoginFormData(formData: FormData): LoginInput {
  return loginInputSchema.parse({
    username: formData.get('username'),
    password: formData.get('password'),
  });
}

export function parseRegisterFormData(formData: FormData): RegisterInput {
  const rawUsername = String(formData.get('username') ?? '');

  return registerInputSchema.parse({
    inviteCode: formData.get('inviteCode'),
    username: rawUsername,
    displayName: rawUsername,
    email: formData.get('email'),
    password: formData.get('password'),
  });
}

export function normalizeSeedInviteCode(value: string): string {
  return inviteCodeSchema.parse(value);
}

export function normalizeSeedUsername(value: string): {
  username: string;
  displayName: string;
} {
  return {
    username: usernameSchema.parse(value),
    displayName: displayNameSchema.parse(value),
  };
}

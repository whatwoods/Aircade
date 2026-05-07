import { ZodError } from 'zod';

export class WorkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkError';
  }
}

const fieldLabels: Record<string, string> = {
  title: '作品名',
  type: '类型',
  tagline: '一句话简介',
  description: '详细简介',
  coverUrl: '封面图',
  screenshots: '截图',
  webUrl: 'Web 链接',
  qrUrl: '二维码图片',
};

function formatZodIssue(error: ZodError) {
  const messages = error.issues.map((issue) => {
    const field = issue.path[0];
    const label = typeof field === 'string' ? fieldLabels[field] : null;

    return label ? `${label}：${issue.message}` : issue.message;
  });
  const uniqueMessages = Array.from(new Set(messages));

  return uniqueMessages.slice(0, 3).join('；');
}

export function getWorkErrorMessage(error: unknown): string {
  if (error instanceof WorkError) {
    return error.message;
  }

  if (error instanceof ZodError) {
    return formatZodIssue(error) || '提交内容格式不正确，请检查后重试';
  }

  return '作品请求失败，请稍后再试';
}

export class WorkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkError';
  }
}

export function getWorkErrorMessage(error: unknown): string {
  if (error instanceof WorkError) {
    return error.message;
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return '提交内容格式不正确，请检查后重试';
  }

  return '作品请求失败，请稍后再试';
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    return error.message;
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return '提交内容格式不正确，请检查后重试';
  }

  return '请求失败，请稍后再试';
}

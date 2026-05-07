import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createWorkInputSchema } from '../schemas';
import { getWorkErrorMessage, WorkError } from './errors';

describe('getWorkErrorMessage', () => {
  it('returns business error messages directly', () => {
    expect(getWorkErrorMessage(new WorkError('请上传封面图'))).toBe(
      '请上传封面图'
    );
  });

  it('surfaces field-specific schema errors', () => {
    let error: unknown;

    try {
      createWorkInputSchema.parse({
        title: '短',
        type: 'game',
        tagline: '短',
        description: '太短',
        coverUrl: '/uploads/2026/05/cover-demo.webp',
        screenshots: [],
        webUrl: 'not-a-url',
        qrUrl: '',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ZodError);
    expect(getWorkErrorMessage(error)).toBe(
      '作品名：标题至少 2 个字符；一句话简介：一句话介绍至少 4 个字符；详细简介：作品介绍至少 20 个字符'
    );
  });

  it('reports invalid play links directly', () => {
    let error: unknown;

    try {
      createWorkInputSchema.parse({
        title: '测试作品',
        type: 'game',
        tagline: '这是一个测试作品',
        description: '这是一段足够长的作品介绍，用来验证链接错误时的提示文案。',
        coverUrl: '/uploads/2026/05/cover-demo.webp',
        screenshots: [],
        webUrl: 'example.com/play',
        qrUrl: '',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ZodError);
    expect(getWorkErrorMessage(error)).toBe('Web 链接：请输入合法的链接');
  });
});

import { describe, expect, it } from 'vitest';
import { createWorkInputSchema, reviewWorkInputSchema } from './schemas';

describe('createWorkInputSchema', () => {
  it('accepts a valid submission payload', () => {
    const parsed = createWorkInputSchema.parse({
      title: '猫猫指挥部',
      type: 'game',
      tagline: '一个关于猫猫协作的小游戏',
      description:
        '玩家需要在狭小空间里调度不同性格的猫猫成员，让它们把混乱的基地重新运转起来。',
      coverUrl: 'https://example.com/cover.png',
      screenshots: ['https://example.com/1.png', 'https://example.com/2.png'],
      webUrl: 'https://example.com/play',
      qrUrl: '',
    });

    expect(parsed.screenshots).toHaveLength(2);
    expect(parsed.webUrl).toBe('https://example.com/play');
    expect(parsed.qrUrl).toBeUndefined();
  });

  it('rejects when both action targets are missing', () => {
    expect(() =>
      createWorkInputSchema.parse({
        title: '小工具作品',
        type: 'tool',
        tagline: '一句够长的介绍',
        description: '这是一段足够长的作品介绍，用来验证动作目标缺失时会失败。',
        coverUrl: 'https://example.com/cover.png',
        screenshots: [],
        webUrl: '',
        qrUrl: '',
      })
    ).toThrow(/网页链接或二维码链接/);
  });
});

describe('reviewWorkInputSchema', () => {
  it('requires a reason when rejecting', () => {
    expect(() =>
      reviewWorkInputSchema.parse({
        workId: '550e8400-e29b-41d4-a716-446655440000',
        decision: 'reject',
        rejectReason: '',
      })
    ).toThrow(/必须填写原因/);
  });

  it('accepts approval without a reason', () => {
    const parsed = reviewWorkInputSchema.parse({
      workId: '550e8400-e29b-41d4-a716-446655440000',
      decision: 'approve',
      rejectReason: '',
    });

    expect(parsed.rejectReason).toBeUndefined();
  });
});

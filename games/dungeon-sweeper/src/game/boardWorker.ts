import { pickBoard } from './rules';

/** 后台选盘：生成期「无致命猜测」校验较重，放到 Worker 里预取下一局，避免开局卡顿 */
self.onmessage = (e: MessageEvent<{ seed: number }>) => {
  const seed = e.data.seed >>> 0;
  const board = pickBoard(seed, false);
  (self as unknown as { postMessage(m: unknown): void }).postMessage({ seed, board });
};

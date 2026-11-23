// TapTap 开放能力：排行榜、分享面板、震动。只在 TapTap 构建里生效（MODE 在构建时求值，网页和快手包里整段被摇掉）
// 排行榜和分享模板由官方小游戏 MCP 在服务端创建，ID 写在 .env.tap

type Cb = { onSuccess?: (r?: unknown) => void; onFailure?: (code: number, msg: string) => void };

interface TapOpen {
  getLeaderboardManager?(): {
    submitScores(o: { scores: { leaderboardId: string; score: number }[]; callback?: Cb }): void;
    openLeaderboard(o: { leaderboardId: string; collection: 'public' | 'friends'; callback?: Cb }): void;
  };
  showShareboard?(o: { templateId: string; sceneParam?: string; success?: () => void; fail?: (r: { errMsg?: string }) => void }): void;
  vibrateShort?(o: { type: 'light' | 'medium' | 'heavy' }): unknown;
}

const tap: TapOpen | undefined =
  import.meta.env.MODE === 'tap' && !__YOOLA__ ? (globalThis as unknown as { tap?: TapOpen }).tap : undefined;

const LB_BEST = import.meta.env.VITE_TAP_LB_BEST ?? '';
const LB_DAILY = import.meta.env.VITE_TAP_LB_DAILY ?? '';
const SHARE_TEMPLATE = import.meta.env.VITE_TAP_SHARE_TEMPLATE ?? '';

function board(daily: boolean): string {
  return daily ? LB_DAILY : LB_BEST;
}

export function tapLeaderboardReady(daily: boolean): boolean {
  return !!tap?.getLeaderboardManager && !!board(daily);
}

export function tapSubmitScore(daily: boolean, score: number): void {
  const id = board(daily);
  if (!id || score <= 0) return;
  try {
    tap?.getLeaderboardManager?.().submitScores({ scores: [{ leaderboardId: id, score: Math.round(score) }] });
  } catch {
    /* 提交失败不影响结算 */
  }
}

/** 打开平台排行榜面板；打不开返回 false */
export function tapOpenLeaderboard(daily: boolean): boolean {
  const id = board(daily);
  const m = id ? tap?.getLeaderboardManager?.() : undefined;
  if (!m) return false;
  try {
    m.openLeaderboard({ leaderboardId: id, collection: 'public' });
    return true;
  } catch {
    return false;
  }
}

/** 拉起平台分享面板；不可用返回 false（调用方退回网页分享） */
export function tapShare(): boolean {
  if (!tap?.showShareboard || !SHARE_TEMPLATE) return false;
  try {
    tap.showShareboard({ templateId: SHARE_TEMPLATE });
    return true;
  } catch {
    return false;
  }
}

/** 平台短震动；不可用返回 false */
export function tapVibrate(ms: number): boolean {
  if (!tap?.vibrateShort) return false;
  try {
    void Promise.resolve(tap.vibrateShort({ type: ms >= 60 ? 'heavy' : ms >= 20 ? 'medium' : 'light' })).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

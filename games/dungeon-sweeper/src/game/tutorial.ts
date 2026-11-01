import { idx } from './board';

/** 引导步骤（文档 §6.2） */
export type TutAction = 'tap' | 'mark' | 'auto' | 'button';

export interface TutStep {
  id: string;
  text: string;
  /** 高亮格 */
  cells: number[];
  /** 箭头指向的格 */
  arrow: number;
  /** 高亮的 HUD 区域 */
  hud: ('badge' | 'hp' | 'lair')[];
  action: TutAction;
  /** tap / mark 的目标格 */
  target: number;
  /** mark 目标值 */
  mark: number;
  /** auto 步骤时长（ms） */
  ms: number;
  /** 本步提示文案（操作错误时） */
  wrong?: string;
  /** 在暗砖上显示的等级标签（教学「数字 = 等级之和」） */
  labels?: { cell: number; level: number }[];
  /** 在数字格上方显示的算式 */
  sum?: { cell: number; text: string };
}

export const TUTORIAL_STEPS: TutStep[] = [
  {
    id: '0',
    text: '数字 = 周围 8 格怪物的「等级之和」：这\u2060里 3\u00a0=\u00a01\u00a0+\u00a02',
    cells: [idx(2, 10), idx(2, 9), idx(1, 10)],
    arrow: -1,
    hud: [],
    action: 'auto',
    target: -1,
    mark: 0,
    ms: 3400,
    labels: [
      { cell: idx(2, 9), level: 1 },
      { cell: idx(1, 10), level: 2 },
    ],
    sum: { cell: idx(2, 10), text: '1 + 2 = 3' },
  },
  {
    id: '1',
    text: '「1」旁只剩这一块暗砖——里面是 1 级怪。点它！',
    cells: [idx(3, 10), idx(2, 9)],
    arrow: idx(2, 9),
    hud: [],
    action: 'tap',
    target: idx(2, 9),
    mark: 0,
    ms: 0,
    wrong: '先点箭头指着的暗砖',
  },
  {
    id: '1b',
    text: '打怪扣等量生命、得等量经验。数字也跟着减少！',
    cells: [],
    arrow: -1,
    hud: [],
    action: 'auto',
    target: -1,
    mark: 0,
    ms: 1800,
  },
  {
    id: '2',
    text: '「2」说明这里的怪最多 2 级。你有 4 血，放心点！',
    cells: [idx(5, 10), idx(6, 11)],
    arrow: idx(6, 11),
    hud: [],
    action: 'tap',
    target: idx(6, 11),
    mark: 0,
    ms: 0,
    wrong: '点箭头指着的暗砖',
  },
  {
    id: '2b',
    text: '经验满了会升级：生命回满，上限 +1。',
    cells: [],
    arrow: -1,
    hud: ['badge', 'hp'],
    action: 'auto',
    target: -1,
    mark: 0,
    ms: 2000,
  },
  {
    id: '3',
    text: '这块必是 3 级怪。长按它（电脑：右键），标「3」。',
    cells: [idx(7, 10), idx(8, 9)],
    arrow: idx(8, 9),
    hud: [],
    action: 'mark',
    target: idx(8, 9),
    mark: 3,
    ms: 0,
    wrong: '选 3 试试',
  },
  {
    id: '3b',
    text: '标记只是笔记，帮你记住推理。',
    cells: [],
    arrow: -1,
    hud: [],
    action: 'auto',
    target: -1,
    mark: 0,
    ms: 1600,
  },
  {
    id: '4',
    text: '击败中央的 13 级巨龙！生命 ≥ 14 才能挑战。',
    cells: [],
    arrow: -1,
    hud: ['lair', 'hp'],
    action: 'button',
    target: -1,
    mark: 0,
    ms: 0,
  },
];

/**
 * 引导状态机：只负责「当前步骤」与「是否允许某个操作」，演出与界面由 app 驱动。
 */
export class Tutorial {
  active = false;
  step = 0;
  /** 等待演出结束再进入下一步 */
  waiting = false;
  stepT0 = 0;
  startT = 0;

  start(now: number): void {
    this.active = true;
    this.step = 0;
    this.waiting = false;
    this.stepT0 = now;
    this.startT = now;
  }

  stop(): void {
    this.active = false;
    this.waiting = false;
  }

  get cur(): TutStep | null {
    return this.active ? (TUTORIAL_STEPS[this.step] ?? null) : null;
  }

  /** 是否允许点击该格（返回 false 时 app 摇动气泡） */
  allowTap(cell: number): boolean {
    const s = this.cur;
    if (!s) return true;
    if (this.waiting) return false;
    return s.action === 'tap' && cell === s.target;
  }

  allowLongPress(cell: number): boolean {
    const s = this.cur;
    if (!s) return true;
    if (this.waiting) return false;
    return s.action === 'mark' && cell === s.target;
  }

  next(now: number): TutStep | null {
    this.step++;
    this.waiting = false;
    this.stepT0 = now;
    if (this.step >= TUTORIAL_STEPS.length) {
      this.active = false;
      return null;
    }
    return TUTORIAL_STEPS[this.step];
  }
}

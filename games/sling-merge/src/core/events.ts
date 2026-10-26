export type GameEvent =
  | { t: 'launch'; level: number; angle: number; power: number; x: number; y: number; dx: number; dy: number }
  | { t: 'reload'; level: number }
  | { t: 'wallBounce'; x: number; y: number; speed: number; nx: number; ny: number; id: number; level: number }
  | { t: 'impact'; a: number; b: number; x: number; y: number; speed: number; first: boolean; strong: boolean }
  | { t: 'bump'; x: number; y: number; speed: number; level: number }
  | {
      t: 'merge';
      level: number;
      x: number;
      y: number;
      combo: number;
      gained: number;
      trick: boolean;
      clutch: boolean;
      superMerge: boolean;
      firstOfRun: boolean;
      discovery: boolean;
      firstRainbow: boolean;
      newR: number;
      newId: number;
      ax: number;
      ay: number;
      bx: number;
      by: number;
      parentLevel: number;
      parentR: number;
      sa: number;
      sb: number;
    }
  | { t: 'pop'; x: number; y: number; level: number; r: number; index: number }
  | { t: 'nextChanged'; level: number }
  | { t: 'hop'; level: number }
  | { t: 'scene'; scene: string }
  | { t: 'clutch'; x: number; y: number }
  | { t: 'comboEnd'; combo: number }
  | { t: 'danger'; level: 0 | 1 | 2 }
  | { t: 'dangerTick'; left: number }
  | { t: 'dangerClear' }
  | { t: 'newBest' }
  | { t: 'gameOver'; culprit: number }
  | { t: 'tutorial'; step: number }
  | { t: 'aimStart' }
  | { t: 'aimCancel' }
  | { t: 'aimMax' }
  | { t: 'aimStep'; step: number }
  | { t: 'tip'; id: number; text: string; x: number; y: number }
  | { t: 'tutorialFail'; text: string }
  | { t: 'banner'; text: string; kind: 'gold' | 'mint' | 'pink' };

type Handler = (e: GameEvent) => void;

class Bus {
  private handlers: Handler[] = [];
  on(h: Handler): void {
    this.handlers.push(h);
  }
  emit(e: GameEvent): void {
    for (let i = 0; i < this.handlers.length; i++) this.handlers[i]!(e);
  }
}

export const bus = new Bus();

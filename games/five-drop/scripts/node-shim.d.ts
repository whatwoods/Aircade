// 最小化的 Node 类型声明（不引入 @types/node）
declare module 'node:worker_threads' {
  export const isMainThread: boolean;
  export const parentPort: { postMessage(v: unknown): void; on(ev: 'message', fn: (v: any) => void): void } | null;
  export const workerData: any;
  export class Worker {
    constructor(url: URL | string, opts?: { workerData?: unknown });
    on(ev: 'message', fn: (v: any) => void): this;
    on(ev: 'error', fn: (e: unknown) => void): this;
    on(ev: 'exit', fn: (code: number) => void): this;
    postMessage(v: unknown): void;
    terminate(): Promise<number>;
  }
}
declare module 'node:os' {
  export function availableParallelism(): number;
}
declare const process: { argv: string[]; exitCode?: number; stdout: { write(s: string): void } };

/**
 * GameLoop —— 游戏主循环（wiki/09-tech/架构设计.md §1）
 *
 * requestAnimationFrame + 固定时间步长物理（accumulator 模式），
 * 渲染与逻辑解耦：update 以固定 dt（默认 60Hz）推进，render 每帧执行并携带
 * 插值系数 alpha = accumulator / fixedDt。
 *
 * 文档未定义的参数（阶段汇报项）：
 * - maxCatchUpSteps = 5：单帧最多追赶 5 个物理步；后台标签页返回等场景
 *   若仍有积压则直接丢弃（防螺旋死亡）。
 * - 时间源与 rAF 可注入，保障单元测试可离屏驱动。
 */

export interface GameLoopOptions {
  /** 固定物理步长（秒），默认 1/60 */
  fixedDt?: number;
  /** 单帧最大追赶物理步数，默认 5 */
  maxCatchUpSteps?: number;
  /** 帧调度（默认 window.requestAnimationFrame） */
  requestFrame?: (cb: (t: number) => void) => number;
  /** 取消帧调度 */
  cancelFrame?: (handle: number) => void;
  /** 高精度时钟（毫秒，默认 performance.now） */
  now?: () => number;
}

export class GameLoop {
  private readonly fixedDt: number;
  private readonly maxCatchUpSteps: number;
  private readonly maxFrameTime: number;
  private readonly requestFrame: (cb: (t: number) => void) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;

  private updateCb: ((dt: number) => void) | null = null;
  private renderCb: ((alpha: number, frameDt: number) => void) | null = null;

  private running = false;
  private frameHandle: number | null = null;
  private lastTime = 0;
  private acc = 0;

  private fpsAvg = 0;
  private updateMs = 0;
  private renderMs = 0;
  private totalSteps = 0;

  constructor(opts: GameLoopOptions = {}) {
    this.fixedDt = opts.fixedDt ?? 1 / 60;
    this.maxCatchUpSteps = opts.maxCatchUpSteps ?? 5;
    this.maxFrameTime = this.fixedDt * this.maxCatchUpSteps;

    const hasWindow = typeof window !== 'undefined';
    this.requestFrame =
      opts.requestFrame ??
      (hasWindow
        ? (cb) => window.requestAnimationFrame(cb)
        : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
    this.cancelFrame =
      opts.cancelFrame ??
      (hasWindow
        ? (h) => window.cancelAnimationFrame(h)
        : (h) => clearTimeout(h as unknown as Parameters<typeof clearTimeout>[0]));
    this.now = opts.now ?? (() => performance.now());
  }

  /** 注册固定步长逻辑更新回调 */
  onUpdate(cb: (dt: number) => void): void {
    this.updateCb = cb;
  }

  /** 注册每帧渲染回调（alpha: 插值系数 0~1；frameDt: 帧耗时秒） */
  onRender(cb: (alpha: number, frameDt: number) => void): void {
    this.renderCb = cb;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.now();
    this.acc = 0;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** 平滑 FPS（指数滑动平均） */
  get fps(): number {
    return this.fpsAvg;
  }

  /** 上一帧 update 回调耗时（毫秒，性能预算监控用） */
  get lastUpdateMs(): number {
    return this.updateMs;
  }

  /** 上一帧 render 回调耗时（毫秒） */
  get lastRenderMs(): number {
    return this.renderMs;
  }

  /** 累计物理步数 */
  get steps(): number {
    return this.totalSteps;
  }

  private scheduleNext(): void {
    this.frameHandle = this.requestFrame(this.tick);
  }

  private tick = (t: number): void => {
    if (!this.running) return;

    // 帧耗时（秒）；rAF 时间戳与 now 同源
    let frameDt = (t - this.lastTime) / 1000;
    this.lastTime = t;
    if (frameDt < 0) frameDt = 0; // 时钟回拨保护

    // 累积（上限防后台返回爆冲）
    this.acc = Math.min(this.acc + frameDt, this.maxFrameTime);

    // 固定步长推进
    let steps = 0;
    const updateStart = this.now();
    while (this.acc >= this.fixedDt && steps < this.maxCatchUpSteps) {
      this.updateCb?.(this.fixedDt);
      this.acc -= this.fixedDt;
      steps++;
      this.totalSteps++;
    }
    this.updateMs = this.now() - updateStart;

    // 追赶到上限仍有积压 → 丢弃（防螺旋死亡）
    if (steps === this.maxCatchUpSteps && this.acc >= this.fixedDt) {
      this.acc = 0;
    }

    // 渲染（携带插值系数）
    const renderStart = this.now();
    this.renderCb?.(this.acc / this.fixedDt, frameDt);
    this.renderMs = this.now() - renderStart;

    // FPS 平滑
    if (frameDt > 0) {
      const inst = 1 / frameDt;
      this.fpsAvg = this.fpsAvg === 0 ? inst : this.fpsAvg * 0.9 + inst * 0.1;
    }

    this.scheduleNext();
  };
}

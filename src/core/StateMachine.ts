/**
 * StateMachine —— 游戏状态机（wiki/09-tech/架构设计.md §2.3）
 *
 * 状态集（架构文档）：Menu / Battle / Upgrade / Paused / GameOver / Victory
 *
 * 与文档的差异（阶段汇报项）：
 * - IGameState 增加可选 render?(g, alpha, ctx)：
 *   第一阶段调试场景需要绘制通道；正式 RenderSystem（第二阶段）接管后，
 *   场景级渲染将迁移至 RenderSystem，此可选方法保留为过渡。
 */

import type { GameContext } from './GameContext';

export interface IGameState {
  enter(ctx: GameContext): void;
  update(dt: number, ctx: GameContext): void;
  exit(ctx: GameContext): void;
  /** 可选：状态专属渲染（alpha 为固定步长插值系数 0~1） */
  render?(g: CanvasRenderingContext2D, alpha: number, ctx: GameContext): void;
}

export class StateMachine<S extends string = string> {
  private states = new Map<S, IGameState>();
  private curName: S | null = null;
  private cur: IGameState | null = null;

  /** 注册状态（重名覆盖） */
  register(name: S, state: IGameState): this {
    this.states.set(name, state);
    return this;
  }

  /**
   * 切换状态：exit(旧) → enter(新)。
   * - 切到当前状态：无操作，返回 false
   * - 未注册状态：抛错（状态名通常来自代码常量，拼错应尽早暴露）
   */
  transition(name: S, ctx: GameContext): boolean {
    if (name === this.currentName) return false;
    const next = this.states.get(name);
    if (!next) throw new Error(`StateMachine: 未注册的状态 "${name}"`);

    this.cur?.exit(ctx);
    this.curName = name;
    this.cur = next;
    next.enter(ctx);
    return true;
  }

  /** 每物理帧调用 */
  update(dt: number, ctx: GameContext): void {
    this.cur?.update(dt, ctx);
  }

  /** 每渲染帧调用（委托当前状态的可选渲染） */
  render(g: CanvasRenderingContext2D, alpha: number, ctx: GameContext): void {
    this.cur?.render?.(g, alpha, ctx);
  }

  get current(): IGameState | null {
    return this.cur;
  }

  get currentName(): S | null {
    return this.curName;
  }
}

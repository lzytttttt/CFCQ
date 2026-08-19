/**
 * EventBus —— 事件总线（wiki/09-tech/架构设计.md §2.4）
 *
 * 文档接口为 on(event, handler) / emit(event, payload)。
 * TypeScript strict 下将 payload: any 升级为泛型事件映射表（EventMap），
 * 默认 Record<string, unknown> 与文档接口完全兼容。
 *
 * 关键事件命名约定（架构文档）：'enemy.killed' / 'player.hit' / 'blade.hit' /
 * 'blade.clash' / 'level.up' / 'level.cleared' / 'boss.phase' / 'item.drop'
 */

/** 事件名 → 载荷类型 映射表（游戏侧扩展时收敛为具体接口） */
export type EventMap = Record<string, unknown>;

type Handler<T> = (payload: T) => void;

export class EventBus<M extends EventMap = Record<string, unknown>> {
  private handlers = new Map<keyof M, Array<Handler<never>>>();
  private onceFlags = new WeakMap<Handler<never>, boolean>();

  /**
   * 注册事件处理器，返回取消函数。
   */
  on<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler<never>);
    this.handlers.set(event, list);
    return () => this.off(event, handler);
  }

  /** 注册一次性处理器（触发一次后自动移除） */
  once<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    const wrapped: Handler<M[K]> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  /** 移除指定处理器 */
  off<K extends keyof M>(event: K, handler: Handler<M[K]>): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler as Handler<never>);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length === 0) this.handlers.delete(event);
  }

  /** 触发事件；handler 执行期间注册/移除的处理器不影响本轮分发 */
  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;
    for (const h of list.slice()) {
      (h as Handler<M[K]>)(payload);
    }
  }

  /** 当前某事件的处理器数量（调试用） */
  listenerCount(event: keyof M): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /** 清空全部处理器 */
  clear(): void {
    this.handlers.clear();
  }
}

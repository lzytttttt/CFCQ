/**
 * ComboTracker —— 连击追踪（wiki/02-combat/转刀机制.md §5）
 *
 * 每目标独立连击：同一目标 2.5s 窗口内再次被命中计为连击，超窗重置。
 * 连击上限由刀法等级决定（Lv1=2 → Lv20=5，属性总表 §3）。
 */

import { COMBO_WINDOW } from './Damage';

export class ComboTracker {
  /** targetId → { count, expireAt } */
  private windows = new Map<number, { count: number; expire: number }>();
  private now = 0;

  /** 每物理帧推进时钟 */
  tick(dt: number): void {
    this.now += dt;
    if (this.windows.size === 0) return;
    for (const [id, w] of this.windows) {
      if (this.now >= w.expire) this.windows.delete(id);
    }
  }

  /**
   * 登记一次命中并返回连击数（1 起）。
   * @param maxCombo 刀法等级对应的连击上限
   */
  register(targetId: number, maxCombo: number): number {
    const w = this.windows.get(targetId);
    if (!w || this.now >= w.expire) {
      this.windows.set(targetId, { count: 1, expire: this.now + COMBO_WINDOW });
      return 1;
    }
    w.count = Math.min(w.count + 1, maxCombo);
    w.expire = this.now + COMBO_WINDOW;
    return w.count;
  }

  /** 当前某目标连击数（无记录 0） */
  current(targetId: number): number {
    return this.windows.get(targetId)?.count ?? 0;
  }

  /** 目标死亡时清除其连击窗口 */
  clear(targetId: number): void {
    this.windows.delete(targetId);
  }

  /** 全清（状态切换） */
  reset(): void {
    this.windows.clear();
    this.now = 0;
  }
}

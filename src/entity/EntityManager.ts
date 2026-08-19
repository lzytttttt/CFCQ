/**
 * EntityManager —— 实体管理器
 *
 * 职责：实体创建 / 移除 / 查询（按 id、按标签）、活跃实体遍历。
 *
 * 性能约定（架构文档 §6 性能预算）：
 * - forEachActive 为零分配遍历（热路径），active getter 仅为便捷 API
 * - id 单调递增不复用
 */

import { Entity } from './Entity';

export class EntityManager {
  private nextId = 1;
  private list: Entity[] = [];
  private byId = new Map<number, Entity>();

  /** 创建实体（可传入初始化回调：设置标签 / 碰撞体等） */
  create(init?: (e: Entity) => void): Entity {
    const e = new Entity(this.nextId++);
    init?.(e);
    this.list.push(e);
    this.byId.set(e.id, e);
    return e;
  }

  /** 移除实体（立即从列表与索引中删除） */
  remove(target: Entity | number): boolean {
    const e = typeof target === 'number' ? this.byId.get(target) : target;
    if (!e) return false;
    const idx = this.list.indexOf(e);
    if (idx >= 0) this.list.splice(idx, 1);
    this.byId.delete(e.id);
    return true;
  }

  get(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  /** 按标签查询（返回新数组） */
  queryTag(tag: string): Entity[] {
    return this.list.filter((e) => e.tags.has(tag));
  }

  /** 全部实体（含 inactive） */
  all(): readonly Entity[] {
    return this.list;
  }

  /** 活跃实体快照（便捷 API；热路径请用 forEachActive） */
  active(): Entity[] {
    return this.list.filter((e) => e.active);
  }

  /** 零分配遍历活跃实体 */
  forEachActive(cb: (e: Entity) => void): void {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i]!;
      if (e.active) cb(e);
    }
  }

  /** 当前实体总数（含 inactive） */
  get count(): number {
    return this.list.length;
  }

  /** 清空全部实体（id 计数器重置，用于场景切换） */
  clear(): void {
    this.list.length = 0;
    this.byId.clear();
    this.nextId = 1;
  }
}

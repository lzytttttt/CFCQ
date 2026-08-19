/**
 * Collider —— 碰撞体定义（wiki/09-tech/架构设计.md §2.1）
 *
 * 三种碰撞体：
 * - circle：角色 / 敌人本体 / 掉落物
 * - aabb：地形障碍 / 静态物（w/h 以实体中心为锚）
 * - segment：刀体（玩家 / 敌方），p1/p2 为世界坐标端点，由持刀方每帧写入；
 *   width 为刀宽（命中厚度扩展，碰撞引擎设计 §4.1）——文档未列此字段，
 *   为实现「d ≤ W/2 + r」命中厚度公式而补充（阶段汇报项）
 */

import { AABB } from '../math/Geometry';
import { Vec2 } from '../math/Vec2';
import { Transform } from './Transform';

export type Collider =
  | { type: 'circle'; r: number }
  | { type: 'aabb'; w: number; h: number }
  | { type: 'segment'; p1: Vec2; p2: Vec2; width: number };

/** 计算碰撞体的世界包围盒（供 SpatialGrid 登记用，wiki/02-combat/碰撞引擎设计 §3.2） */
export function colliderAABB(collider: Collider, t: Transform): AABB {
  switch (collider.type) {
    case 'circle': {
      const r = collider.r * Math.max(Math.abs(t.scale.x), Math.abs(t.scale.y));
      return { x: t.pos.x - r, y: t.pos.y - r, w: r * 2, h: r * 2 };
    }
    case 'aabb': {
      const w = collider.w * Math.abs(t.scale.x);
      const h = collider.h * Math.abs(t.scale.y);
      return { x: t.pos.x - w / 2, y: t.pos.y - h / 2, w, h };
    }
    case 'segment': {
      const x1 = Math.min(collider.p1.x, collider.p2.x);
      const y1 = Math.min(collider.p1.y, collider.p2.y);
      const x2 = Math.max(collider.p1.x, collider.p2.x);
      const y2 = Math.max(collider.p1.y, collider.p2.y);
      const pad = collider.width / 2;
      return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
    }
  }
}

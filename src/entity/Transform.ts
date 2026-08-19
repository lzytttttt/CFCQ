/**
 * Transform —— 实体变换（wiki/09-tech/架构设计.md §2.1）
 *
 * pos 语义为实体中心锚点（wiki/10-art 全局美术规范：
 * 角色中心锚点，与转刀圆心一致）。
 */

import { Vec2, vec2 } from '../math/Vec2';

export class Transform {
  pos: Vec2;
  /** 旋转（弧度） */
  rotation: number;
  scale: Vec2;

  constructor(pos: Vec2 = vec2(), rotation = 0, scale: Vec2 = vec2(1, 1)) {
    this.pos = pos;
    this.rotation = rotation;
    this.scale = scale;
  }
}

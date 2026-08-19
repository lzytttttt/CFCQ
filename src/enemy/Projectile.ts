/**
 * Projectile —— 敌方弹道（弓箭手箭矢 / 毒镖手毒镖 / 飞刀客旋转飞刀）
 *
 * 飞刀（spinningKnife）为移动旋转线段：与玩家刀体相交触发瞬时拼刀（70%），
 * 被玩家刀体扫掠命中直接击碎（小怪图鉴 §4.3 注 + M5 确认规则）。
 */

import type { RNG } from '../core/RNG';
import { normalizeAngle, segmentsIntersect } from '../math/Geometry';
import { vec2, type Vec2 } from '../math/Vec2';
import { KNIFE_CLASH_WIN_RATE } from './AIParams';
import type { BladeBody } from '../physics/BladeCollision';

export type ProjectileKind = 'arrow' | 'poisonDart' | 'spinningKnife';

export interface ProjectileSpec {
  kind: ProjectileKind;
  /** 伤害（已按关卡缩放） */
  damage: number;
  /** 速度 px/s */
  speed: number;
  /** 存活时长（超时消失，防泄漏） */
  life: number;
  /** 飞刀线段长度（其余弹为圆判定半径） */
  length?: number;
  /** 毒镖命中减速 */
  slow?: { ratio: number; duration: number };
}

export class Projectile {
  readonly spec: ProjectileSpec;
  pos: Vec2;
  vel: Vec2;
  life: number;
  /** 旋转角（飞刀自转） */
  spin = 0;
  active = true;
  /** 来源敌人 id（击杀归属） */
  readonly ownerId: number;

  constructor(
    spec: ProjectileSpec,
    pos: Vec2,
    dir: Vec2,
    ownerId: number,
  ) {
    this.spec = spec;
    this.pos = vec2(pos.x, pos.y);
    this.vel = vec2(dir.x * spec.speed, dir.y * spec.speed);
    this.life = spec.life;
    this.ownerId = ownerId;
  }

  /** 半径判定用（箭/镖 5px；飞刀由线段判定，此处为扫掠击碎的圆近似半径） */
  get radius(): number {
    return this.spec.kind === 'spinningKnife' ? (this.spec.length ?? 40) / 2 : 5;
  }

  update(dt: number): void {
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    if (this.spec.kind === 'spinningKnife') this.spin += 14 * dt; // 自转
    this.life -= dt;
    if (this.life <= 0) this.active = false;
  }

  /** 飞刀当前线段（世界坐标，中心在 pos，长 length，方向随自转） */
  segment(): { p1: Vec2; p2: Vec2 } {
    const half = (this.spec.length ?? 40) / 2;
    const c = Math.cos(this.spin);
    const s = Math.sin(this.spin);
    return {
      p1: vec2(this.pos.x - c * half, this.pos.y - s * half),
      p2: vec2(this.pos.x + c * half, this.pos.y + s * half),
    };
  }

  /**
   * 与玩家刀体交互（每帧调用）：
   * - 扫掠命中（刀刃扫过弹体圆）→ 直接击碎（动量碾压，无拼刀）
   * - 飞刀线段与玩家刀体线段相交 → 瞬时拼刀（70%：胜=击碎 / 败=穿透继续飞行）
   * @returns 'crushed'（已击碎）/ 'clashWin'（拼刀胜击碎）/ 'clashLose'（拼刀败穿透）/ null（无交互）
   */
  interactWithPlayerBlade(
    blade: BladeBody,
    bladeHit: boolean,
    rng: RNG,
  ): 'crushed' | 'clashWin' | 'clashLose' | null {
    if (!this.active) return null;
    // 扫掠命中：刀刃圆判定直接击碎
    if (bladeHit) {
      this.active = false;
      return 'crushed';
    }
    // 飞刀线段相交 → 瞬时拼刀（仅旋转飞刀；箭/镖为小圆，由扫掠覆盖）
    if (this.spec.kind === 'spinningKnife' && blade.active) {
      if (segmentsIntersect(this.segment(), blade.segment)) {
        if (rng.next() < KNIFE_CLASH_WIN_RATE) {
          this.active = false;
          return 'clashWin';
        }
        return 'clashLose';
      }
    }
    return null;
  }

  /** 绘制（世界坐标） */
  draw(g: CanvasRenderingContext2D): void {
    if (!this.active) return;
    g.save();
    g.translate(this.pos.x, this.pos.y);
    const ink = '#1a1a1f';
    g.lineWidth = 2.5;
    g.strokeStyle = ink;
    switch (this.spec.kind) {
      case 'arrow': {
        // 箭矢：镞形（米白+棕杆），朝向速度方向
        const a = Math.atan2(this.vel.y, this.vel.x);
        g.rotate(a);
        g.fillStyle = '#c8b08a';
        g.beginPath();
        g.moveTo(10, 0);
        g.lineTo(-8, -2.5);
        g.lineTo(-8, 2.5);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      }
      case 'poisonDart': {
        // 毒镖：绿色菱形 + 尾迹微光
        g.fillStyle = '#3ba272';
        g.beginPath();
        g.moveTo(0, -8);
        g.lineTo(4, 0);
        g.lineTo(0, 8);
        g.lineTo(-4, 0);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      }
      case 'spinningKnife': {
        // 旋转飞刀：小刀形（银白刃+褐柄），随 spin 自转
        g.rotate(this.spin);
        const half = (this.spec.length ?? 40) / 2;
        g.fillStyle = '#bdbdbd';
        g.beginPath();
        g.moveTo(half, 0);
        g.lineTo(half * 0.2, -4);
        g.lineTo(half * 0.2, 4);
        g.closePath();
        g.fill();
        g.stroke();
        g.strokeStyle = '#8b7355';
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(-half, 0);
        g.lineTo(half * 0.2, 0);
        g.stroke();
        break;
      }
    }
    g.restore();
    void normalizeAngle;
  }
}

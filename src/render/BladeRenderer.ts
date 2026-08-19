/**
 * BladeRenderer —— 刀体渲染（wiki/09-tech/渲染管线.md §2 / 转刀机制.md §6）
 *
 * 刀体视觉 = 刀柄（短粗褐线）+ 刀刃（品质色→白渐变）+ 拖尾（渐隐弧光）。
 * 品质颜色映射按渲染管线文档 §2。
 */

import type { Quality } from '../core/Quality';
import { normalizeAngle } from '../math/Geometry';
import type { BladeBody } from '../physics/BladeCollision';

/** 品质颜色（渲染管线.md §2） */
export const QUALITY_COLOR: Record<Quality, string> = {
  white: '#dddddd',
  green: '#66ff66',
  blue: '#66ccff',
  purple: '#cc66ff',
  orange: '#ffcc66',
};

/** 刀柄色（渲染管线.md §2：#8B7355） */
const HANDLE_COLOR = '#8b7355';
/** 拖尾色（转刀机制 §6：高饱和冷色点缀；青色） */
const TRAIL_COLOR = '79, 209, 197';

/** 拖尾默认记录帧数 */
export const TRAIL_FRAMES = 22;
/** 拖尾半径占刀长比例（略短于刀尖，视觉收敛） */
const TRAIL_RADIUS_RATIO = 0.86;
/** 相邻拖尾帧角度跳变上限（跨 ±π 归一化跳帧保护） */
const TRAIL_MAX_STEP = Math.PI / 2;

/**
 * 刀体拖尾角度历史（每物理帧 push 当前角度，超长 shift）。
 * 独立于 BladeBody（渲染层数据，不污染碰撞数据）。
 */
export class BladeTrail {
  private angles: number[] = [];
  private readonly max: number;

  constructor(max = TRAIL_FRAMES) {
    this.max = max;
  }

  push(angle: number): void {
    this.angles.push(angle);
    if (this.angles.length > this.max) this.angles.shift();
  }

  clear(): void {
    this.angles.length = 0;
  }

  snapshot(): readonly number[] {
    return this.angles;
  }
}

export class BladeRenderer {
  /** 刀光拖尾强度（0~1；上层可随转速动态调亮——转刀机制 §8 转速反馈） */
  trailAlpha = 0.35;

  /** 绘制一把刀体（含拖尾）——对外主 API */
  drawBlade(g: CanvasRenderingContext2D, blade: BladeBody, trail: BladeTrail | null): void {
    if (!blade.active) return;

    g.save();
    g.translate(blade.center.x, blade.center.y);

    // ---- 拖尾（渐隐弧光，先于刀体绘制） ----
    if (trail) {
      this.drawTrailAngles(g, trail.snapshot(), blade.length * TRAIL_RADIUS_RATIO);
    }

    // ---- 刀体（旋转到当前角度） ----
    g.rotate(blade.angle);
    g.lineCap = 'round';

    // 刀柄（0 → 0.35L）
    g.lineWidth = blade.width * 1.2;
    g.strokeStyle = HANDLE_COLOR;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(blade.length * 0.35, 0);
    g.stroke();

    // 刀刃（0.35L → L，品质色 → 白渐变）
    const grad = g.createLinearGradient(blade.length * 0.35, 0, blade.length, 0);
    grad.addColorStop(0, QUALITY_COLOR[blade.quality]);
    grad.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.lineWidth = blade.width;
    g.strokeStyle = grad;
    g.beginPath();
    g.moveTo(blade.length * 0.35, 0);
    g.lineTo(blade.length, 0);
    g.stroke();

    g.restore();
  }

  /** 批量绘制多刀（刀体同层；trails 按 `${owner}:${ownerId}:${index}` 键取） */
  drawAll(
    g: CanvasRenderingContext2D,
    blades: readonly BladeBody[],
    trails?: ReadonlyMap<string, BladeTrail>,
  ): void {
    for (const b of blades) {
      const key = `${b.owner}:${b.ownerId}:${b.index}`;
      this.drawBlade(g, b, trails?.get(key) ?? null);
    }
  }

  /** 绘制角度历史拖尾（半径 rr 处的渐隐弧线段序列，越新越亮） */
  private drawTrailAngles(
    g: CanvasRenderingContext2D,
    angles: readonly number[],
    rr: number,
  ): void {
    const n = angles.length;
    if (n < 2) return;
    g.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const a0 = angles[i - 1]!;
      const a1 = angles[i]!;
      // 跳过跨 ±π 的归一化跳变帧
      if (Math.abs(normalizeAngle(a1 - a0)) > TRAIL_MAX_STEP) continue;
      const t = i / n;
      g.strokeStyle = `rgba(${TRAIL_COLOR}, ${(t * this.trailAlpha).toFixed(3)})`;
      g.lineWidth = 2 + t * 5;
      g.beginPath();
      g.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
      g.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
      g.stroke();
    }
  }
}

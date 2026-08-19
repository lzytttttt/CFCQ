/**
 * BladeCollision —— 刀体几何与扫掠检测（wiki/09-tech/碰撞引擎实现.md §2/§4）
 *
 * BladeBody 为刀体数据结构（玩家/敌方刀体的统一表示），
 * 由持刀方（玩家 BladeRotator / 敌方 EnemyBlade）每帧驱动 update()，
 * 碰撞引擎负责端点计算与命中/拼刀检测。
 *
 * 已确认的实现裁决（M2 预读）：
 * - 命中 CD 为「刀体-敌人对」级 0.25s（修复文档刀体级全局 CD 的多敌漏伤隐患）
 * - 命中检测 = 当前帧线段-圆 ∪ 扫掠扇形-圆（双保险防高速穿透）
 * - 扫掠角度容差 δ = atan2(W/2 + r, r0)，补偿刀宽与目标半径（碰撞设计 §4.2）
 */

import { QUALITY_FACTOR, type Quality } from '../core/Quality';
import {
  type Circle,
  type LineSegment,
  type Sector,
  pointToSegmentDist,
  sectorCircleIntersect,
} from '../math/Geometry';
import { Vec2, vec2 } from '../math/Vec2';

/** 刀柄比例（转刀机制.md §2.2：刀体有效段 0.35L → L） */
export const HANDLE_RATIO = 0.35;

/** 「刀体-敌人对」命中 CD（秒）——M2 预读确认值 */
export const HIT_PAIR_CD = 0.25;

export type BladeOwner = 'player' | 'enemy';

/** 刀体：以持有者为圆心旋转的线段碰撞体 */
export interface BladeBody {
  /** 归属方 */
  owner: BladeOwner;
  /** 持有者实体 id（玩家/敌人） */
  ownerId: number;
  /** 多刀序号（0 起，单刀为 0） */
  index: number;
  /** 旋转中心（每帧同步持有者位置） */
  center: Vec2;
  /** 当前角度（弧度；更新规则 angle += omega*dt） */
  angle: number;
  /** 上一物理帧角度（扫掠检测用，update 自动记录） */
  prevAngle: number;
  /** 角速度（rad/s，正=顺时针[屏幕坐标系]，负=逆时针） */
  omega: number;
  /** 刀长 L（px，转刀机制.md §2.2：50-140） */
  length: number;
  /** 刀宽 W（px，碰撞厚度，4-12） */
  width: number;
  /** 品质（动量系数） */
  quality: Quality;
  /** 刀体是否有效（失去刀体/僵直期间 false，不参与命中与拼刀） */
  active: boolean;
  /** 拼刀冷却剩余（秒，双方触发后各 1.2s） */
  clashCooldown: number;
  /** 敌方出刀计时：>0 表示刚出刀（拼刀时机窗口 0.25s 判定用） */
  justDrawnTime: number;

  /** ---- 以下由碰撞引擎每帧填充（世界坐标） ---- */
  /** 当前刀体线段（p1=刀柄端，p2=刀尖端） */
  segment: LineSegment;
  /** 当前帧扫掠扇形（prevAngle → angle） */
  sweep: Sector;
}

/** 创建刀体（默认参数对应铁匠刀级别：L=80 W=6） */
export function createBladeBody(init: {
  owner: BladeOwner;
  ownerId: number;
  center: Vec2;
  quality?: Quality;
  length?: number;
  width?: number;
  omega?: number;
  index?: number;
}): BladeBody {
  return {
    owner: init.owner,
    ownerId: init.ownerId,
    index: init.index ?? 0,
    center: init.center,
    angle: 0,
    prevAngle: 0,
    omega: init.omega ?? 3.49, // ω0 基准（转刀机制.md §3.1：200°/s）
    length: init.length ?? 80,
    width: init.width ?? 6,
    quality: init.quality ?? 'white',
    active: true,
    clashCooldown: 0,
    justDrawnTime: 0,
    segment: { p1: vec2(), p2: vec2() },
    sweep: { center: vec2(), r0: 0, r1: 0, angleStart: 0, angleEnd: 0 },
  };
}

/**
 * 持刀方每物理帧调用：推进旋转角并记录扫掠起点。
 * （冷却与出刀计时的衰减由 CollisionEngine.step 统一处理）
 */
export function advanceBlade(blade: BladeBody, dt: number): void {
  blade.prevAngle = blade.angle;
  blade.angle += blade.omega * dt;
}

/** 刀体动量 M = L × W × |ω| × Q（拼刀机制.md §3） */
export function bladeMomentum(blade: BladeBody): number {
  return (
    blade.length * blade.width * Math.abs(blade.omega) * QUALITY_FACTOR[blade.quality]
  );
}

/** 单位方向向量 */
function dir(angle: number): Vec2 {
  return vec2(Math.cos(angle), Math.sin(angle));
}

/**
 * 计算刀体当前帧线段端点（世界坐标）。
 * p1 = center + dir(angle) × 0.35L（刀柄端）
 * p2 = center + dir(angle) × L（刀尖端）
 */
export function computeBladeSegment(blade: BladeBody): LineSegment {
  const d = dir(blade.angle);
  const r0 = blade.length * HANDLE_RATIO;
  return {
    p1: vec2(blade.center.x + d.x * r0, blade.center.y + d.y * r0),
    p2: vec2(blade.center.x + d.x * blade.length, blade.center.y + d.y * blade.length),
  };
}

/** 扫掠角度容差 δ：补偿刀宽与目标半径（碰撞设计 §4.2） */
export function sweepTolerance(blade: BladeBody, targetR: number): number {
  const r0 = blade.length * HANDLE_RATIO;
  return Math.atan2(blade.width / 2 + targetR, Math.max(r0, 1));
}

/**
 * 构建本帧扫掠扇形（prevAngle → angle 沿旋转方向的短弧）。
 * 若一帧角位移超过 π（极端高转速），退化为全圆扫掠（angleStart=angleEnd=0
 * 配合 sectorCircleIntersect 的全圆特判）。
 */
export function computeBladeSweep(blade: BladeBody, tolerance: number): Sector {
  const r0 = blade.length * HANDLE_RATIO;
  const delta = blade.angle - blade.prevAngle;

  // 全圆特判：单帧扫过超过半圈 → 任意角度都可能命中
  if (Math.abs(delta) >= Math.PI) {
    return {
      center: vec2(blade.center.x, blade.center.y),
      r0,
      r1: blade.length,
      angleStart: -Math.PI,
      angleEnd: Math.PI - 1e-9,
    };
  }

  if (delta >= 0) {
    // 顺时针扫：[prev - δ, cur + δ]
    return {
      center: vec2(blade.center.x, blade.center.y),
      r0,
      r1: blade.length,
      angleStart: blade.prevAngle - tolerance,
      angleEnd: blade.angle + tolerance,
    };
  }
  // 逆时针扫：[cur - δ, prev + δ]（start > end 表示逆扫方向区间）
  return {
    center: vec2(blade.center.x, blade.center.y),
    r0,
    r1: blade.length,
    angleStart: blade.angle - tolerance,
    angleEnd: blade.prevAngle + tolerance,
  };
}

/**
 * 刀体命中判定（目标圆）：
 * 1) 当前帧线段-圆：d(圆心, 线段) ≤ W/2 + r（碰撞设计 §4.1 命中厚度公式）
 * 2) 扫掠扇形-圆：捕获高速旋转跨过目标的帧（碰撞实现.md §2.3，含角度容差）
 * 任一成立即命中（并集，双保险防穿透）。
 */
export function bladeHitsCircle(blade: BladeBody, target: Circle): boolean {
  // 半径粗筛：目标远于刀长 + 目标半径 + 刀宽/2 → 必不命中
  const dc = Math.hypot(
    target.c.x - blade.center.x,
    target.c.y - blade.center.y,
  );
  if (dc > blade.length + target.r + blade.width / 2) return false;

  // 检测 1：当前帧线段-圆
  if (pointToSegmentDist(target.c, blade.segment) <= blade.width / 2 + target.r) {
    return true;
  }

  // 检测 2：扫掠扇形-圆
  const tol = sweepTolerance(blade, target.r);
  const sweep = computeBladeSweep(blade, tol);
  return sectorCircleIntersect(sweep, target);
}

/** 刀尖位置（命中特效锚点） */
export function bladeTip(blade: BladeBody): Vec2 {
  return blade.segment.p2;
}

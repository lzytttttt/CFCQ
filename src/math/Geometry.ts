/**
 * Geometry —— 2D 几何运算（wiki/09-tech/碰撞引擎实现.md §2）
 *
 * 全部为纯函数，供碰撞引擎（physics/）与渲染模块复用。
 * 算法以碰撞引擎实现文档为准，并做健壮性补强：
 * - 线段相交采用严格符号法（共线 / 端点接触不算相交，符合拼刀"刃刃相撞"语义）
 * - 扇形角度范围支持跨 ±π 的区间
 */

import { Vec2 } from './Vec2';

export interface LineSegment {
  p1: Vec2;
  p2: Vec2;
}

export interface Circle {
  c: Vec2;
  r: number;
}

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 扇形（刀体一帧扫掠区域） */
export interface Sector {
  center: Vec2;
  r0: number; // 内半径（刀柄）
  r1: number; // 外半径（刀尖）
  angleStart: number; // 起始角（弧度）
  angleEnd: number; // 终止角（弧度）
}

/** 数值截断到 [min, max] */
export function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** 三点叉积：oa × ob（>0 左转 / <0 右转 / =0 共线） */
export function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** 角度归一化到 [-π, π) */
export function normalizeAngle(a: number): number {
  const TAU = Math.PI * 2;
  let r = a % TAU;
  if (r >= Math.PI) r -= TAU;
  if (r < -Math.PI) r += TAU;
  return r;
}

/**
 * 角度 a 是否落在 [start, end] 区间内（弧度）。
 * 区间支持两种表达：
 * - start <= end：常规区间
 * - start > end：跨 ±π 的 wrap 区间（如 3.0 ~ -3.0 表示扫过 π 附近）
 */
export function angleInRange(a: number, start: number, end: number): boolean {
  const an = normalizeAngle(a);
  const sn = normalizeAngle(start);
  const en = normalizeAngle(end);
  if (sn <= en) {
    return an >= sn && an <= en;
  }
  // wrap：[start, π) ∪ [-π, end]
  return an >= sn || an <= en;
}

/** 点到线段的最近距离（碰撞引擎实现.md §2.1） */
export function pointToSegmentDist(p: Vec2, s: LineSegment): number {
  const dx = s.p2.x - s.p1.x;
  const dy = s.p2.y - s.p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - s.p1.x, p.y - s.p1.y);
  let t = ((p.x - s.p1.x) * dx + (p.y - s.p1.y) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = s.p1.x + t * dx;
  const py = s.p1.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** 线段-线段严格相交判定（拼刀核心，碰撞引擎实现.md §2.2）。共线/端点接触返回 false */
export function segmentsIntersect(a: LineSegment, b: LineSegment): boolean {
  const d1 = cross(b.p1, b.p2, a.p1);
  const d2 = cross(b.p1, b.p2, a.p2);
  const d3 = cross(a.p1, a.p2, b.p1);
  const d4 = cross(a.p1, a.p2, b.p2);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** 线段交点（需先经 segmentsIntersect 确认相交）；不相交返回 null */
export function segmentIntersectPoint(a: LineSegment, b: LineSegment): Vec2 | null {
  const x1 = a.p1.x, y1 = a.p1.y, x2 = a.p2.x, y2 = a.p2.y;
  const x3 = b.p1.x, y3 = b.p1.y, x4 = b.p2.x, y4 = b.p2.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (denom === 0) return null; // 平行或共线

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/** 扇形-圆相交（刀体扫掠命中，碰撞引擎实现.md §2.3） */
export function sectorCircleIntersect(sec: Sector, cir: Circle): boolean {
  const d = Math.hypot(cir.c.x - sec.center.x, cir.c.y - sec.center.y);
  // 半径范围检查
  if (d > sec.r1 + cir.r || d < Math.max(sec.r0 - cir.r, 0)) return false;
  // 角度范围检查
  const ang = Math.atan2(cir.c.y - sec.center.y, cir.c.x - sec.center.x);
  return angleInRange(normalizeAngle(ang), sec.angleStart, sec.angleEnd);
}

/** 圆-圆相交 */
export function circlesIntersect(a: Circle, b: Circle): boolean {
  const dx = a.c.x - b.c.x;
  const dy = a.c.y - b.c.y;
  const rSum = a.r + b.r;
  return dx * dx + dy * dy <= rSum * rSum;
}

/** 圆-AABB 相交（实体-地形阻挡检测基础） */
export function circleAabbIntersect(cir: Circle, box: AABB): boolean {
  const nx = clamp(cir.c.x, box.x, box.x + box.w);
  const ny = clamp(cir.c.y, box.y, box.y + box.h);
  const dx = cir.c.x - nx;
  const dy = cir.c.y - ny;
  return dx * dx + dy * dy <= cir.r * cir.r;
}

/** 两 AABB 相交 */
export function aabbsIntersect(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

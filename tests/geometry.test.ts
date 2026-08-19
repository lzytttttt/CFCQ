import { describe, expect, it } from 'vitest';
import {
  angleInRange,
  aabbsIntersect,
  circleAabbIntersect,
  circlesIntersect,
  clamp,
  cross,
  normalizeAngle,
  pointToSegmentDist,
  segmentIntersectPoint,
  segmentsIntersect,
  sectorCircleIntersect,
} from '../src/math/Geometry';
import { vec2 } from '../src/math/Vec2';

const seg = (x1: number, y1: number, x2: number, y2: number) => ({
  p1: vec2(x1, y1),
  p2: vec2(x2, y2),
});

describe('Geometry 基础', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('cross 叉积符号', () => {
    const o = vec2(0, 0);
    expect(cross(o, vec2(1, 0), vec2(0, 1))).toBe(1); // 逆时针
    expect(cross(o, vec2(0, 1), vec2(1, 0))).toBe(-1); // 顺时针
    expect(cross(o, vec2(1, 0), vec2(2, 0))).toBe(0); // 共线
  });

  it('normalizeAngle 归一化到 [-π, π)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBe(-Math.PI); // π 归入 -π
    expect(normalizeAngle(-Math.PI)).toBe(-Math.PI);
    expect(normalizeAngle(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12);
    expect(normalizeAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
    expect(normalizeAngle(2 * Math.PI + 0.5)).toBeCloseTo(0.5, 12);
  });

  it('angleInRange 常规与 wrap 区间', () => {
    // 常规区间 [0, 1]
    expect(angleInRange(0.5, 0, 1)).toBe(true);
    expect(angleInRange(1.5, 0, 1)).toBe(false);
    // wrap 区间 [3.0, -3.0]：即 (π 附近) 跨 ±π
    expect(angleInRange(3.1, 3.0, -3.0)).toBe(true); // π 附近
    expect(angleInRange(-3.1, 3.0, -3.0)).toBe(true); // -π 附近
    expect(angleInRange(0, 3.0, -3.0)).toBe(false); // 0 不在区间
  });
});

describe('点到线段距离（碰撞引擎实现 §2.1）', () => {
  const s = seg(0, 0, 10, 0);

  it('垂足在线段内', () => {
    expect(pointToSegmentDist(vec2(5, 3), s)).toBe(3);
    expect(pointToSegmentDist(vec2(5, -3), s)).toBe(3);
    expect(pointToSegmentDist(vec2(5, 0), s)).toBe(0);
  });

  it('垂足在线段外 → 最近端点', () => {
    expect(pointToSegmentDist(vec2(15, 4), s)).toBeCloseTo(Math.hypot(5, 4), 12);
    expect(pointToSegmentDist(vec2(-3, 0), s)).toBe(3);
  });

  it('退化零长线段', () => {
    expect(pointToSegmentDist(vec2(4, 5), seg(1, 1, 1, 1))).toBe(5);
  });
});

describe('线段-线段相交（拼刀核心，碰撞引擎实现 §2.2）', () => {
  it('X 交叉', () => {
    expect(segmentsIntersect(seg(0, 0, 10, 10), seg(0, 10, 10, 0))).toBe(true);
  });

  it('平行 / 共线重叠 → 不相交（严格符号法）', () => {
    expect(segmentsIntersect(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBe(false);
    expect(segmentsIntersect(seg(0, 0, 10, 0), seg(5, 0, 15, 0))).toBe(false);
  });

  it('端点 / T 接触 → 不相交（严格符号法）', () => {
    expect(segmentsIntersect(seg(0, 0, 10, 0), seg(10, 0, 20, 5))).toBe(false);
    expect(segmentsIntersect(seg(0, 0, 10, 0), seg(5, 0, 5, 5))).toBe(false);
  });

  it('完全分离', () => {
    expect(segmentsIntersect(seg(0, 0, 1, 1), seg(5, 5, 6, 6))).toBe(false);
  });
});

describe('线段交点计算', () => {
  it('X 交叉交点', () => {
    const p = segmentIntersectPoint(seg(0, 0, 10, 10), seg(0, 10, 10, 0));
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(5, 12);
    expect(p!.y).toBeCloseTo(5, 12);
  });

  it('平行 / 不相交 → null', () => {
    expect(segmentIntersectPoint(seg(0, 0, 10, 0), seg(0, 5, 10, 5))).toBeNull();
    expect(segmentIntersectPoint(seg(0, 0, 1, 1), seg(5, 5, 6, 6))).toBeNull();
  });
});

describe('扇形-圆相交（刀体扫掠命中，碰撞引擎实现 §2.3）', () => {
  // 扇形：圆心原点，内径 20 外径 100，角度 [0, π/2]
  const sec = { center: vec2(0, 0), r0: 20, r1: 100, angleStart: 0, angleEnd: Math.PI / 2 };

  it('圆心在扇形内 → 相交', () => {
    expect(sectorCircleIntersect(sec, { c: vec2(60, 0), r: 10 })).toBe(true);
    expect(sectorCircleIntersect(sec, { c: vec2(50, 50), r: 10 })).toBe(true);
  });

  it('半径过远 / 过近 → 不相交', () => {
    expect(sectorCircleIntersect(sec, { c: vec2(200, 0), r: 10 })).toBe(false); // d > r1 + r
    expect(sectorCircleIntersect(sec, { c: vec2(5, 0), r: 10 })).toBe(false); // d < r0 - r
  });

  it('角度范围外 → 不相交', () => {
    expect(sectorCircleIntersect(sec, { c: vec2(-60, 0), r: 10 })).toBe(false); // π 方向
    expect(sectorCircleIntersect(sec, { c: vec2(0, -60), r: 10 })).toBe(false); // -π/2 方向
  });

  it('跨 ±π 的 wrap 扇形', () => {
    const wrap = { center: vec2(0, 0), r0: 20, r1: 100, angleStart: 3.0, angleEnd: -3.0 };
    expect(sectorCircleIntersect(wrap, { c: vec2(-60, 0), r: 8 })).toBe(true); // π 附近
    expect(sectorCircleIntersect(wrap, { c: vec2(60, 0), r: 8 })).toBe(false); // 0 方向
  });
});

describe('圆与 AABB', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };

  it('circlesIntersect', () => {
    expect(circlesIntersect({ c: vec2(0, 0), r: 5 }, { c: vec2(8, 0), r: 5 })).toBe(true);
    expect(circlesIntersect({ c: vec2(0, 0), r: 5 }, { c: vec2(11, 0), r: 5 })).toBe(false);
  });

  it('circleAabbIntersect', () => {
    expect(circleAabbIntersect({ c: vec2(5, 5), r: 1 }, box)).toBe(true); // 内部
    expect(circleAabbIntersect({ c: vec2(15, 5), r: 3 }, box)).toBe(false); // 距边 5 > 3
    expect(circleAabbIntersect({ c: vec2(15, 5), r: 6 }, box)).toBe(true); // 距边 5 ≤ 6
  });

  it('aabbsIntersect', () => {
    expect(aabbsIntersect(box, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(aabbsIntersect(box, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

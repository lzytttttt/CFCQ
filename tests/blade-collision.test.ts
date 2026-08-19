import { describe, expect, it } from 'vitest';
import { QUALITY_FACTOR } from '../src/core/Quality';
import { vec2 } from '../src/math/Vec2';
import {
  advanceBlade,
  bladeMomentum,
  bladeTip,
  computeBladeSegment,
  computeBladeSweep,
  createBladeBody,
  sweepTolerance,
} from '../src/physics/BladeCollision';

describe('BladeBody 刀体基础', () => {
  it('createBladeBody 默认参数（铁匠刀级：L=80 W=6 ω=3.49）', () => {
    const b = createBladeBody({ owner: 'player', ownerId: 1, center: vec2(0, 0) });
    expect(b.length).toBe(80);
    expect(b.width).toBe(6);
    expect(b.omega).toBeCloseTo(3.49, 6);
    expect(b.quality).toBe('white');
    expect(b.active).toBe(true);
  });

  it('advanceBlade 推进角度并记录扫掠起点', () => {
    const b = createBladeBody({ owner: 'player', ownerId: 1, center: vec2() });
    b.angle = 1.0;
    advanceBlade(b, 0.1); // ω=3.49 → +0.349
    expect(b.prevAngle).toBe(1.0);
    expect(b.angle).toBeCloseTo(1.349, 12);
  });

  it('advanceBlade 支持逆时针（负 ω）', () => {
    const b = createBladeBody({ owner: 'enemy', ownerId: 2, center: vec2() });
    b.omega = -2;
    b.angle = 0;
    advanceBlade(b, 0.5);
    expect(b.angle).toBeCloseTo(-1, 12);
  });
});

describe('bladeMomentum 动量 M = L×W×|ω|×Q', () => {
  it('白铁匠刀基准：80×6×3.49×1.0 = 1675.2', () => {
    const b = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(),
      quality: 'white',
      length: 80,
      width: 6,
      omega: 3.49,
    });
    expect(bladeMomentum(b)).toBeCloseTo(80 * 6 * 3.49 * QUALITY_FACTOR.white, 6);
  });

  it('品质系数参与计算（橙 1.8）', () => {
    const b = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(),
      quality: 'orange',
      length: 100,
      width: 8,
      omega: 4,
    });
    expect(bladeMomentum(b)).toBeCloseTo(100 * 8 * 4 * 1.8, 6);
  });

  it('动量取 |ω|（旋转方向不影响动量大小）', () => {
    const cw = createBladeBody({ owner: 'player', ownerId: 1, center: vec2(), omega: 3 });
    const ccw = createBladeBody({ owner: 'player', ownerId: 1, center: vec2(), omega: -3 });
    expect(bladeMomentum(cw)).toBeCloseTo(bladeMomentum(ccw), 12);
  });
});

describe('computeBladeSegment 刀体线段端点', () => {
  it('角度 0：p1=(0.35L,0) p2=(L,0)', () => {
    const b = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(100, 100),
      length: 100,
    });
    b.angle = 0;
    const seg = computeBladeSegment(b);
    expect(seg.p1.x).toBeCloseTo(135, 6);
    expect(seg.p1.y).toBeCloseTo(100, 6);
    expect(seg.p2.x).toBeCloseTo(200, 6);
    expect(seg.p2.y).toBeCloseTo(100, 6);
  });

  it('角度 π/2：指向 +y', () => {
    const b = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(0, 0),
      length: 100,
    });
    b.angle = Math.PI / 2;
    const seg = computeBladeSegment(b);
    expect(seg.p1.x).toBeCloseTo(0, 6);
    expect(seg.p1.y).toBeCloseTo(35, 6);
    expect(seg.p2.x).toBeCloseTo(0, 6);
    expect(seg.p2.y).toBeCloseTo(100, 6);
  });
});

describe('computeBladeSweep 扫掠扇形', () => {
  it('顺时针扫掠区间 [prev-δ, cur+δ]', () => {
    const b = createBladeBody({ owner: 'player', ownerId: 1, center: vec2() });
    b.prevAngle = 0.3;
    b.angle = 0.5;
    const s = computeBladeSweep(b, 0.1);
    expect(s.angleStart).toBeCloseTo(0.2, 12);
    expect(s.angleEnd).toBeCloseTo(0.6, 12);
    expect(s.r0).toBeCloseTo(80 * 0.35, 6);
    expect(s.r1).toBe(80);
  });

  it('逆时针扫掠区间 [cur-δ, prev+δ]', () => {
    const b = createBladeBody({ owner: 'enemy', ownerId: 1, center: vec2() });
    b.omega = -1;
    b.prevAngle = 0.5;
    b.angle = 0.3;
    const s = computeBladeSweep(b, 0.1);
    expect(s.angleStart).toBeCloseTo(0.2, 12);
    expect(s.angleEnd).toBeCloseTo(0.6, 12);
  });

  it('单帧扫过超半圈 → 全圆扇形', () => {
    const b = createBladeBody({ owner: 'player', ownerId: 1, center: vec2() });
    b.omega = 100; // 60fps 下 1/60s 转 1.67rad，这里直接构造大 Δ
    b.prevAngle = 0;
    b.angle = Math.PI + 0.5;
    const s = computeBladeSweep(b, 0);
    expect(s.angleStart).toBeCloseTo(-Math.PI, 12);
    expect(s.angleEnd).toBeGreaterThan(Math.PI - 0.001);
  });
});

describe('sweepTolerance 容差', () => {
  it('容差 = atan2(W/2+r, 0.35L)，随目标半径增大', () => {
    const b = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: vec2(),
      length: 100,
      width: 10,
    });
    const t0 = sweepTolerance(b, 0);
    const t20 = sweepTolerance(b, 20);
    expect(t0).toBeCloseTo(Math.atan2(5, 35), 12);
    expect(t20).toBeGreaterThan(t0);
  });
});

describe('bladeTip 刀尖', () => {
  it('返回线段 p2（命中特效锚点）', () => {
    const b = createBladeBody({ owner: 'player', ownerId: 1, center: vec2() });
    b.angle = 0;
    b.segment = computeBladeSegment(b);
    expect(bladeTip(b)).toBe(b.segment.p2);
  });
});

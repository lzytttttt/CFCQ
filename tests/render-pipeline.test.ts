import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { vec2 } from '../src/math/Vec2';
import { Camera } from '../src/render/Camera';
import { BladeTrail } from '../src/render/BladeRenderer';
import { MAX_PARTICLES, ParticleSystem } from '../src/render/ParticleSystem';

describe('ParticleSystem 粒子系统', () => {
  it('emit 激活粒子，update 后生命周期衰减归零回收', () => {
    const ps = new ParticleSystem(new RNG(1));
    ps.emit(vec2(100, 100), 5, { color: '#fff', lifeMin: 0.1, lifeMax: 0.1 });
    expect(ps.count).toBe(5);

    for (let i = 0; i < 60; i++) ps.update(1 / 60); // 1 秒
    expect(ps.count).toBe(0);
  });

  it('对象池复用：回收后 emit 不扩容', () => {
    const ps = new ParticleSystem(new RNG(2));
    ps.emit(vec2(0, 0), 10, { color: '#fff', lifeMin: 0.05, lifeMax: 0.05 });
    const pool = (ps as unknown as { pool: unknown[] }).pool;
    const cap1 = pool.length;
    for (let i = 0; i < 30; i++) ps.update(1 / 60); // 全部回收
    ps.emit(vec2(0, 0), 10, { color: '#fff', lifeMin: 0.05, lifeMax: 0.05 });
    expect(pool.length).toBe(cap1); // 复用而非新建
  });

  it('上限 500：超出丢弃并计数', () => {
    const ps = new ParticleSystem(new RNG(3));
    ps.emit(vec2(0, 0), 600, { color: '#fff', lifeMin: 1, lifeMax: 1 });
    expect(ps.count).toBe(MAX_PARTICLES);
    expect(ps.dropped).toBe(100);
  });

  it('update 阻尼：速度按 0.92^(60t) 衰减', () => {
    const ps = new ParticleSystem(new RNG(4));
    ps.emit(vec2(0, 0), 1, {
      color: '#fff',
      speedMin: 100,
      speedMax: 100,
      lifeMin: 10,
      lifeMax: 10,
      dir: 0,
      spread: 0,
    });
    const pool = (
      ps as unknown as { pool: Array<{ vel: { x: number; y: number } }> }
    ).pool;
    const p = pool.find((q) => q.vel.x !== 0)!;
    const v0 = p.vel.x;
    ps.update(1 / 60); // 一帧
    expect(p.vel.x).toBeCloseTo(v0 * 0.92, 6);
  });

  it('clear 清空全部', () => {
    const ps = new ParticleSystem(new RNG(5));
    ps.emit(vec2(0, 0), 50, { color: '#fff', lifeMin: 5, lifeMax: 5 });
    expect(ps.count).toBe(50);
    ps.clear();
    expect(ps.count).toBe(0);
  });

  it('事件预设不抛错（hit/kill/clash/bladeBreak/levelUp）', () => {
    const ps = new ParticleSystem(new RNG(6));
    expect(() => ps.hit(vec2(), 0)).not.toThrow();
    expect(() => ps.kill(vec2())).not.toThrow();
    expect(() => ps.clash(vec2())).not.toThrow();
    expect(() => ps.bladeBreak(vec2())).not.toThrow();
    expect(() => ps.levelUp(vec2())).not.toThrow();
    expect(ps.count).toBeGreaterThan(0);
  });
});

describe('Camera 相机', () => {
  const clampVal = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  it('snapTo 直接对准目标（含世界边界钳制）', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    cam.snapTo(vec2(1200, 675));
    expect(cam.x).toBeCloseTo(1200 - 960, 6);
    expect(cam.y).toBeCloseTo(675 - 540, 6);

    cam.snapTo(vec2(0, 0));
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);

    cam.snapTo(vec2(2400, 1350));
    expect(cam.x).toBeCloseTo(2400 - 1920, 6);
    expect(cam.y).toBeCloseTo(1350 - 1080, 6);
  });

  it('follow 平滑趋近目标并稳定收敛', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    cam.snapTo(vec2(1200, 675));
    const dt = 1 / 60;
    for (let i = 0; i < 180; i++) cam.follow(vec2(2200, 1200), dt); // 3 秒
    expect(cam.x).toBeCloseTo(clampVal(2200 - 960, 0, 2400 - 1920), 2);
    expect(cam.y).toBeCloseTo(clampVal(1200 - 540, 0, 1350 - 1080), 2);
  });

  it('follow 每帧单调靠近（不越界震荡）', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    cam.snapTo(vec2(600, 600));
    const target = vec2(1200, 600);
    const prevDist = Math.abs(cam.x - (1200 - 960));
    cam.follow(target, 1 / 60);
    const newDist = Math.abs(cam.x - (1200 - 960));
    expect(newDist).toBeLessThan(prevDist);
    expect(cam.x).toBeGreaterThanOrEqual(0);
    expect(cam.x).toBeLessThanOrEqual(2400 - 1920);
  });

  it('shake 触发与衰减归零', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    expect(cam.shaking).toBe(false);
    cam.shake(5, 0.25);
    expect(cam.shaking).toBe(true);
    expect(cam.currentIntensity).toBeCloseTo(5, 6);
    for (let i = 0; i < 30; i++) cam.update(1 / 60); // 0.5s > 0.25s
    expect(cam.shaking).toBe(false);
    expect(cam.currentIntensity).toBe(0);
  });

  it('震动强度随时间线性衰减', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    cam.shake(8, 0.4);
    cam.update(0.2); // 剩余一半时间
    expect(cam.currentIntensity).toBeCloseTo(4, 6);
  });

  it('叠加震动取更强者', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    cam.shake(2, 0.3);
    cam.shake(6, 0.2); // 更强者覆盖
    expect(cam.currentIntensity).toBeCloseTo(6, 6);
    cam.shake(1, 0.5); // 更弱者不覆盖
    expect(cam.currentIntensity).toBeCloseTo(6, 6);
  });

  it('worldToScreen 坐标转换', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    cam.snapTo(vec2(960, 540)); // 视口左上 = (0,0)
    const s = cam.worldToScreen(vec2(100, 200));
    expect(s.x).toBeCloseTo(100, 6);
    expect(s.y).toBeCloseTo(200, 6);
  });

  it('resizeWorld 变更后钳制范围更新', () => {
    const cam = new Camera(1920, 1080, 2400, 1350);
    cam.resizeWorld(3000, 2000);
    cam.snapTo(vec2(3000, 2000));
    expect(cam.x).toBeCloseTo(3000 - 1920, 6);
    expect(cam.y).toBeCloseTo(2000 - 1080, 6);
  });
});

describe('BladeTrail 拖尾', () => {
  it('push 超长自动滑出（保留 max 帧）', () => {
    const trail = new BladeTrail(5);
    for (let i = 0; i < 10; i++) trail.push(i * 0.1);
    expect(trail.snapshot().length).toBe(5);
    // 保留最后 5 个角度：0.5, 0.6, 0.7, 0.8, 0.9
    expect(trail.snapshot()[0]).toBeCloseTo(0.5, 12);
    expect(trail.snapshot()[4]).toBeCloseTo(0.9, 12);
  });

  it('clear 清空', () => {
    const trail = new BladeTrail();
    trail.push(0.1);
    trail.push(0.2);
    trail.clear();
    expect(trail.snapshot().length).toBe(0);
  });
});

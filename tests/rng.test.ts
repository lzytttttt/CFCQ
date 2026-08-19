import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';

describe('RNG（mulberry32 种子随机）', () => {
  it('同种子序列完全可复现', () => {
    const a = new RNG(12345);
    const b = new RNG(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('不同种子产生不同序列', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('next 输出落在 [0, 1)', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextRange / nextInt 区间语义', () => {
    const rng = new RNG(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextRange(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
      const n = rng.nextInt(1, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('nextInt 闭区间含端点（min=max 恒等）', () => {
    const rng = new RNG(555);
    for (let i = 0; i < 100; i++) {
      expect(rng.nextInt(3, 3)).toBe(3);
    }
  });

  it('chance 边界', () => {
    expect(new RNG(1).chance(0)).toBe(false);
    expect(new RNG(1).chance(1)).toBe(true);
  });

  it('shuffle：元素守恒、不改原数组、种子确定', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = new RNG(10).shuffle(src);
    expect(shuffled.slice().sort((x, y) => x - y)).toEqual(src); // 元素守恒
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 原数组不变
    expect(new RNG(10).shuffle(src)).toEqual(shuffled); // 同种子可复现
  });

  it('pick：随机取一 / 空数组抛错', () => {
    const rng = new RNG(8);
    const arr = ['a', 'b', 'c'];
    expect(arr).toContain(rng.pick(arr));
    expect(() => rng.pick([])).toThrow();
  });

  it('fork：子流独立且父流可继续', () => {
    const parent = new RNG(7);
    const childA = parent.fork();
    const childB = parent.fork();
    // 两个子流序列不同
    expect(childA.next()).not.toBe(childB.next());
    // 父流继续产生随机数（不因 fork 停摆）
    for (let i = 0; i < 10; i++) {
      const v = parent.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // 同种子的父实例 fork 出的子流可复现
    const p1 = new RNG(2026).fork();
    const p2 = new RNG(2026).fork();
    expect(p1.next()).toBe(p2.next());
  });
});

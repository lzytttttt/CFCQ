import { describe, expect, it } from 'vitest';
import {
  add,
  clone,
  dist,
  dot,
  eq,
  len,
  len2,
  lerp,
  normalize,
  rotate,
  scale,
  sub,
  vec2,
} from '../src/math/Vec2';

describe('Vec2', () => {
  it('add / sub / scale', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec2(5, 5), vec2(2, 1))).toEqual({ x: 3, y: 4 });
    expect(scale(vec2(2, -3), 2)).toEqual({ x: 4, y: -6 });
  });

  it('len / len2 / dist / dot', () => {
    expect(len(vec2(3, 4))).toBe(5);
    expect(len2(vec2(3, 4))).toBe(25);
    expect(dist(vec2(0, 0), vec2(3, 4))).toBe(5);
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(dot(vec2(1, 0), vec2(0, 1))).toBe(0); // 垂直
  });

  it('normalize：单位化与零向量保护', () => {
    expect(normalize(vec2(3, 4))).toEqual({ x: 0.6, y: 0.8 });
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
    expect(len(normalize(vec2(7, -13)))).toBeCloseTo(1, 12);
  });

  it('rotate：绕原点旋转', () => {
    // (1,0) 逆时针 90° → (0,1)
    const r = rotate(vec2(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
    // 旋转不改变长度
    expect(len(rotate(vec2(3, 4), 1.234))).toBeCloseTo(5, 12);
  });

  it('lerp / clone / eq', () => {
    expect(lerp(vec2(0, 0), vec2(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
    const v = vec2(1, 1);
    const c = clone(v);
    c.x = 99;
    expect(v.x).toBe(1); // clone 深拷贝
    expect(eq(vec2(0.1 + 0.2, 0), vec2(0.3, 0), 1e-9)).toBe(true);
  });
});

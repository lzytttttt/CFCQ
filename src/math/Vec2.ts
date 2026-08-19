/**
 * Vec2 —— 二维向量（wiki/09-tech/架构设计.md §2.1 Transform.pos）
 *
 * 采用「接口 + 纯函数」风格：向量是纯数据 {x, y}，
 * 运算函数返回新向量（不可变），避免 class 方法与结构化数据混用的序列化问题。
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** 快捷构造 */
export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

/** 复制 */
export function clone(v: Vec2): Vec2 {
  return { x: v.x, y: v.y };
}

/** a + b */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** a - b */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** v * s（标量缩放） */
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** 长度平方 */
export function len2(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

/** 长度 */
export function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/** 两点距离 */
export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 点积 */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 单位向量；零向量返回 (0,0) */
export function normalize(v: Vec2): Vec2 {
  const l = len(v);
  if (l === 0) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

/** 绕原点旋转 rad 弧度 */
export function rotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** 逐分量线性插值 t∈[0,1] */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 近似相等（浮点容差） */
export function eq(a: Vec2, b: Vec2, eps = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

/**
 * 数值工具（避免散落的 Math.round 语义不一致）
 */

/** 四舍五入到整数（伤害公式统一 round 语义） */
export function round(v: number): number {
  return Math.round(v);
}

/** 线性插值查表：keys 升序，返回 keys→values 的插值（成长表用） */
export function lerpTable(keys: readonly number[], values: readonly number[], x: number): number {
  if (keys.length === 0 || values.length === 0) throw new Error('lerpTable: 空表');
  if (keys.length !== values.length) throw new Error('lerpTable: keys/values 长度不一致');
  if (x <= keys[0]!) return values[0]!;
  const last = keys.length - 1;
  if (x >= keys[last]!) return values[last]!;
  for (let i = 0; i < last; i++) {
    const k0 = keys[i]!;
    const k1 = keys[i + 1]!;
    if (x >= k0 && x <= k1) {
      const t = (x - k0) / (k1 - k0);
      return values[i]! + t * (values[i + 1]! - values[i]!);
    }
  }
  return values[last]!;
}

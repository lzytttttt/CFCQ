/**
 * RNG —— 种子随机数发生器（wiki/09-tech/架构设计.md §2.2 GameContext.rng）
 *
 * 算法：mulberry32（文档未指定算法，此为轻量高质量选择，单状态 32 位）。
 * 同种子序列完全可复现，满足 Rogue 随机关卡回放 / 调试需求。
 */

export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** 下一个 [0, 1) 浮点数 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 浮点数 */
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** [min, max] 闭区间整数（含两端） */
  nextInt(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 以概率 p(0~1) 返回 true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Fisher-Yates 洗牌（返回新数组，不改原数组） */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = out[i]!;
      const b = out[j]!;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  /** 随机取一（空数组抛错） */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('RNG.pick: 空数组');
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** 派生子随机流（子流消耗不影响父流序列） */
  fork(): RNG {
    return new RNG(Math.floor(this.next() * 0xffffffff));
  }
}

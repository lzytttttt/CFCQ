import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { baseWinRate, resolveClash } from '../src/physics/ClashResolver';

const NO_FLAGS = {
  counterRotation: false,
  timingWindow: false,
  foeCombo: false,
  hasBreakTalent: false,
};

describe('baseWinRate 胜率公式', () => {
  it('动量比 1:1 → 0.5', () => {
    expect(baseWinRate(1000, 1000)).toBeCloseTo(0.5, 12);
  });

  it('动量比 2:1 → 2/3，3:1 → 0.75（拼刀机制.md §4 表）', () => {
    expect(baseWinRate(2000, 1000)).toBeCloseTo(2 / 3, 12);
    expect(baseWinRate(3000, 1000)).toBeCloseTo(0.75, 12);
  });

  it('钳制到 [0.1, 0.9]', () => {
    expect(baseWinRate(999999, 1)).toBe(0.9);
    expect(baseWinRate(1, 999999)).toBe(0.1);
  });

  it('双方零动量 → 0.5（防御式）', () => {
    expect(baseWinRate(0, 0)).toBe(0.5);
  });
});

describe('resolveClash 概率分配（胜 p / 败平各半）', () => {
  const N = 6000;

  it('动量相等（p=0.5）：胜≈50% 败≈25% 平≈25%', () => {
    const rng = new RNG(123);
    let win = 0, lose = 0, even = 0;
    for (let i = 0; i < N; i++) {
      const r = resolveClash({ ...NO_FLAGS, playerM: 1000, foeM: 1000 }, rng);
      if (r.outcome === 'win' || r.outcome === 'break') win++;
      else if (r.outcome === 'lose') lose++;
      else even++;
    }
    expect(win / N).toBeGreaterThan(0.45);
    expect(win / N).toBeLessThan(0.55);
    expect(lose / N).toBeGreaterThan(0.21);
    expect(lose / N).toBeLessThan(0.29);
    expect(even / N).toBeGreaterThan(0.21);
    expect(even / N).toBeLessThan(0.29);
  });

  it('玩家大优（p≈0.75）：胜率显著上升', () => {
    const rng = new RNG(456);
    let win = 0;
    for (let i = 0; i < N; i++) {
      const r = resolveClash({ ...NO_FLAGS, playerM: 3000, foeM: 1000 }, rng);
      if (r.outcome === 'win' || r.outcome === 'break') win++;
    }
    expect(win / N).toBeGreaterThan(0.68);
    expect(win / N).toBeLessThan(0.82);
  });

  it('结果可复现（同种子同序列）', () => {
    const input = { ...NO_FLAGS, playerM: 1500, foeM: 1000 };
    const a = resolveClash(input, new RNG(77));
    const b = resolveClash(input, new RNG(77));
    expect(a).toEqual(b);
  });
});

describe('修正项（各 ±0.05）', () => {
  it('相向旋转 + 时机窗口 → winRate 上调 0.1', () => {
    const rng = new RNG(1);
    const base = resolveClash(
      { ...NO_FLAGS, playerM: 1000, foeM: 1000 },
      rng,
    ).winRate;
    const rng2 = new RNG(1);
    const boosted = resolveClash(
      {
        playerM: 1000,
        foeM: 1000,
        counterRotation: true,
        timingWindow: true,
        foeCombo: false,
        hasBreakTalent: false,
      },
      rng2,
    ).winRate;
    expect(boosted).toBeCloseTo(base + 0.1, 12);
  });

  it('敌方连击状态 → winRate 下调 0.05', () => {
    const rng = new RNG(2);
    const base = resolveClash({ ...NO_FLAGS, playerM: 1000, foeM: 1000 }, rng).winRate;
    const rng2 = new RNG(2);
    const reduced = resolveClash(
      { ...NO_FLAGS, playerM: 1000, foeM: 1000, foeCombo: true },
      rng2,
    ).winRate;
    expect(reduced).toBeCloseTo(base - 0.05, 12);
  });
});

describe('解算结果数值（拼刀机制.md §5 表）', () => {
  it('胜：敌僵直 1.5s / 失去刀体 2s / 敌刀弹开 45°，玩家无损', () => {
    // p=0.9 极大动量差，无破刀天赋 → 结果必然是 win 或极小概率 lose/even
    // 用必胜构造：p=0.9 时 lose 概率 0.05 / even 0.05，跑多次取 win 样本验证数值
    const rng = new RNG(9);
    let winSample = null as null | ReturnType<typeof resolveClash>;
    for (let i = 0; i < 500 && !winSample; i++) {
      const r = resolveClash({ ...NO_FLAGS, playerM: 999999, foeM: 1 }, rng);
      if (r.outcome === 'win') winSample = r;
    }
    expect(winSample).not.toBeNull();
    expect(winSample!.stunFoe).toBe(1.5);
    expect(winSample!.disableFoeBlade).toBe(2.0);
    expect(winSample!.foeDeflect).toBeCloseTo(Math.PI / 4, 12);
    expect(winSample!.stunPlayer).toBe(0);
    expect(winSample!.disablePlayerBlade).toBe(0);
    expect(winSample!.playerDeflect).toBe(0);
    expect(winSample!.clashDamage).toBe(0);
  });

  it('败：玩家僵直 0.8s / 失去刀体 1s / 玩家刀弹开 45°', () => {
    const rng = new RNG(10);
    let loseSample = null as null | ReturnType<typeof resolveClash>;
    for (let i = 0; i < 500 && !loseSample; i++) {
      const r = resolveClash({ ...NO_FLAGS, playerM: 1, foeM: 999999 }, rng);
      if (r.outcome === 'lose') loseSample = r;
    }
    expect(loseSample).not.toBeNull();
    expect(loseSample!.stunPlayer).toBe(0.8);
    expect(loseSample!.disablePlayerBlade).toBe(1.0);
    expect(loseSample!.playerDeflect).toBeCloseTo(Math.PI / 4, 12);
    expect(loseSample!.stunFoe).toBe(0);
    expect(loseSample!.clashDamage).toBe(0);
  });

  it('平：双方僵直 0.4s / 失去刀体 0.5s / 双刀弹开', () => {
    const rng = new RNG(11);
    let evenSample = null as null | ReturnType<typeof resolveClash>;
    for (let i = 0; i < 500 && !evenSample; i++) {
      const r = resolveClash({ ...NO_FLAGS, playerM: 1000, foeM: 1000 }, rng);
      if (r.outcome === 'even') evenSample = r;
    }
    expect(evenSample).not.toBeNull();
    expect(evenSample!.stunPlayer).toBe(0.4);
    expect(evenSample!.stunFoe).toBe(0.4);
    expect(evenSample!.disablePlayerBlade).toBe(0.5);
    expect(evenSample!.disableFoeBlade).toBe(0.5);
    expect(evenSample!.playerDeflect).toBeCloseTo(Math.PI / 4, 12);
    expect(evenSample!.foeDeflect).toBeCloseTo(Math.PI / 4, 12);
  });
});

describe('破刀（大胜）', () => {
  it('无天赋永不破刀', () => {
    const rng = new RNG(12);
    for (let i = 0; i < 1000; i++) {
      const r = resolveClash(
        { ...NO_FLAGS, playerM: 999999, foeM: 1, hasBreakTalent: false },
        rng,
      );
      expect(r.outcome).not.toBe('break');
    }
  });

  it('动量不足 2 倍永不破刀', () => {
    const rng = new RNG(13);
    for (let i = 0; i < 1000; i++) {
      const r = resolveClash(
        { ...NO_FLAGS, playerM: 1999, foeM: 1000, hasBreakTalent: true },
        rng,
      );
      expect(r.outcome).not.toBe('break');
    }
  });

  it('满足条件按 30% 概率触发，且伤害 = M×0.02 + 敌攻-30%/10s', () => {
    const rng = new RNG(14);
    const Mp = 4000, Mf = 1000; // 4 倍动量
    let breaks = 0;
    let breakSample = null as null | ReturnType<typeof resolveClash>;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const r = resolveClash(
        { ...NO_FLAGS, playerM: Mp, foeM: Mf, hasBreakTalent: true },
        rng,
      );
      if (r.outcome === 'break') {
        breaks++;
        breakSample ??= r;
      }
    }
    // 胜率 p = 4000/5000 = 0.8，破刀在胜内以 0.3 概率 → 总概率 ≈ 0.24
    expect(breaks / N).toBeGreaterThan(0.18);
    expect(breaks / N).toBeLessThan(0.30);
    expect(breakSample).not.toBeNull();
    expect(breakSample!.clashDamage).toBeCloseTo(Mp * 0.02, 12); // 80
    expect(breakSample!.foeAtkDown).toEqual({ ratio: 0.3, duration: 10 });
    expect(breakSample!.stunFoe).toBe(1.5);
    expect(breakSample!.disableFoeBlade).toBe(2.0);
  });
});

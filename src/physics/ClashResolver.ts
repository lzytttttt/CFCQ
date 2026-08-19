/**
 * ClashResolver —— 拼刀解算（wiki/02-combat/拼刀机制.md §4-§6）
 *
 * 纯函数实现（天赋/状态由调用方传入），保证可单元测试。
 *
 * 已确认的实现裁决（M2 预读）：
 * - 概率分配：胜 p，败 (1-p)/2，平 (1-p)/2（碰撞引擎实现.md 代码隐含分配）
 * - 破刀：玩家动量 ≥ 敌方 2 倍 且 持「破刀诀」天赋 且 30% 概率
 *
 * 解算结果数值（拼刀机制.md §5 表）：
 * - 胜：敌僵直 1.5s / 失去刀体 2s / 敌刀弹开 45°
 * - 败：玩家僵直 0.8s / 失去刀体 1s / 玩家刀弹开 45°
 * - 平：双方僵直 0.4s / 失去刀体 0.5s（表未写失去刀体，按僵直+0.1s 补全）/ 双刀弹开 45°
 * - 破刀（胜的强化）：额外拼刀伤害 M×0.02 + 敌方攻击力 -30% 持续 10s
 */

import type { RNG } from '../core/RNG';
import { clamp } from '../math/Geometry';

/** 拼刀触发后的解算输入（状态快照） */
export interface ClashInput {
  /** 玩家刀体动量 M_p */
  playerM: number;
  /** 敌方刀体动量 M_f */
  foeM: number;
  /** 相向旋转（逆刃切换后与敌刀方向相对）：胜率 +0.05 */
  counterRotation: boolean;
  /** 抓敌方出刀窗口（敌刚出刀 0.25s 内）：胜率 +0.05 */
  timingWindow: boolean;
  /** 敌方处于连击加成状态：胜率 -0.05 */
  foeCombo: boolean;
  /** 玩家持有「破刀诀」天赋 */
  hasBreakTalent: boolean;
}

export type ClashOutcome = 'win' | 'lose' | 'even' | 'break';

/** 解算结果：僵直/失去刀体/弹开角度，由上层（玩家/敌人系统）应用 */
export interface ClashResult {
  outcome: ClashOutcome;
  /** 最终使用的玩家胜率（含修正，供 UI 拼刀风险指示器） */
  winRate: number;
  /** 玩家僵直（秒） */
  stunPlayer: number;
  /** 敌方僵直（秒） */
  stunFoe: number;
  /** 玩家失去刀体（秒） */
  disablePlayerBlade: number;
  /** 敌方失去刀体（秒） */
  disableFoeBlade: number;
  /** 玩家刀弹开角度（弧度，绝对值） */
  playerDeflect: number;
  /** 敌方刀弹开角度（弧度，绝对值） */
  foeDeflect: number;
  /** 破刀额外拼刀伤害（仅 break 时 > 0，= M_p × 0.02） */
  clashDamage: number;
  /** 破刀时敌方攻击力减益幅度与持续时间（仅 break） */
  foeAtkDown?: { ratio: number; duration: number };
}

/** 刀体弹开角度：45°（拼刀机制.md §5） */
const DEFLECT_RAD = Math.PI / 4;
/** 破刀概率（M2 预读确认：碰撞引擎实现.md 代码值） */
const BREAK_CHANCE = 0.3;
/** 破刀需动量优势倍数 */
const BREAK_MOMENTUM_RATIO = 2;
/** 拼刀伤害系数：M × 0.02（拼刀机制.md §6） */
const CLASH_DAMAGE_COEFF = 0.02;
/** 胜率钳制区间 */
const WIN_RATE_MIN = 0.1;
const WIN_RATE_MAX = 0.9;
/** 修正项幅度（各 ±0.05） */
const MOD = 0.05;

/** 基础胜率（拼刀机制.md §4） */
export function baseWinRate(playerM: number, foeM: number): number {
  if (playerM + foeM <= 0) return 0.5;
  return clamp(playerM / (playerM + foeM), WIN_RATE_MIN, WIN_RATE_MAX);
}

/** 拼刀解算主函数：一次掷点，输出四种结果之一及双方状态数值 */
export function resolveClash(input: ClashInput, rng: RNG): ClashResult {
  // 基础胜率 + 修正项（拼刀机制.md §4：各 ±0.05）
  let winRate = baseWinRate(input.playerM, input.foeM);
  if (input.counterRotation) winRate += MOD;
  if (input.timingWindow) winRate += MOD;
  if (input.foeCombo) winRate -= MOD;
  winRate = clamp(winRate, WIN_RATE_MIN, WIN_RATE_MAX);

  const roll = rng.next();

  if (roll < winRate) {
    // ---- 玩家胜 ----
    if (
      input.hasBreakTalent &&
      input.playerM >= input.foeM * BREAK_MOMENTUM_RATIO &&
      rng.next() < BREAK_CHANCE
    ) {
      // 破刀（大胜）：敌僵直/失去刀体同「胜」，附加拼刀伤害与攻击减益
      return {
        outcome: 'break',
        winRate,
        stunPlayer: 0,
        stunFoe: 1.5,
        disablePlayerBlade: 0,
        disableFoeBlade: 2.0,
        playerDeflect: 0,
        foeDeflect: DEFLECT_RAD,
        clashDamage: input.playerM * CLASH_DAMAGE_COEFF,
        foeAtkDown: { ratio: 0.3, duration: 10 },
      };
    }
    return {
      outcome: 'win',
      winRate,
      stunPlayer: 0,
      stunFoe: 1.5,
      disablePlayerBlade: 0,
      disableFoeBlade: 2.0,
      playerDeflect: 0,
      foeDeflect: DEFLECT_RAD,
      clashDamage: 0,
    };
  }

  // 剩余概率 (1-p) 平分给「败」与「平」（M2 预读确认）
  const loseThreshold = 1 - (1 - winRate) / 2;
  if (roll > loseThreshold) {
    // ---- 玩家败 ----
    return {
      outcome: 'lose',
      winRate,
      stunPlayer: 0.8,
      stunFoe: 0,
      disablePlayerBlade: 1.0,
      disableFoeBlade: 0,
      playerDeflect: DEFLECT_RAD,
      foeDeflect: 0,
      clashDamage: 0,
    };
  }

  // ---- 平（硬碰硬） ----
  return {
    outcome: 'even',
    winRate,
    stunPlayer: 0.4,
    stunFoe: 0.4,
    disablePlayerBlade: 0.5,
    disableFoeBlade: 0.5,
    playerDeflect: DEFLECT_RAD,
    foeDeflect: DEFLECT_RAD,
    clashDamage: 0,
  };
}

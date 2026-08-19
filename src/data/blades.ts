/**
 * blades.ts —— 全刀具数据（权威：wiki/06-balance/属性总表.md §7，共 19 把）
 *
 * 数值纪律：以属性总表为唯一权威；特殊效果对照刀具图鉴.md §3 结构化。
 * 品质系数 Q（拼刀机制.md §3）：白1.0/绿1.15/蓝1.3/紫1.5/橙1.8。
 *
 * M4 裁决（用户确认）：刀具数量 19 把（图鉴标题"20"为笔误，已同步修正文档）。
 */

import type { Quality } from '../core/Quality';

/** 刀具特殊效果（结构化 tag + 参数；效果应用逻辑 M6 装备系统接入） */
export type BladeEffect =
  | { tag: 'none' }
  /** 对生命低于阈值%的敌人增伤 */
  | { tag: 'execute'; threshold: number; bonus: number }
  /** 击杀回复 %HP */
  | { tag: 'killHeal'; ratio: number }
  /** 命中附带流血（总伤害，5s） */
  | { tag: 'bleed'; totalDamage: number; duration: number }
  /** 旋转半径 +% */
  | { tag: 'radius'; ratio: number }
  /** 拼刀胜率 +%（绝对加成） */
  | { tag: 'clashWinRate'; bonus: number }
  /** 拼刀伤害 +% */
  | { tag: 'clashDamage'; ratio: number }
  /** 拼刀动量 +% */
  | { tag: 'clashMomentum'; ratio: number }
  /** 暴击率+% 与暴击伤害+% */
  | { tag: 'crit'; rate: number; damage: number }
  /** 命中减速（比例，时长） */
  | { tag: 'slow'; ratio: number; duration: number }
  /** 命中灼烧（总伤害，5s） */
  | { tag: 'burn'; totalDamage: number; duration: number }
  /** 击杀后限时刀法属性+% */
  | { tag: 'berserk'; ratio: number; duration: number }
  /** 破刀触发率 +%；破势加成额外 +%（乘算叠加于 ×1.5） */
  | { tag: 'breakMaster'; breakRate: number; breakGuardBonus: number }
  /** 多刀 +1 */
  | { tag: 'extraBlade' }
  /** 全词条效果 +% */
  | { tag: 'affinity'; ratio: number }
  /** 拼刀胜后回复 %HP */
  | { tag: 'clashHeal'; ratio: number };

export interface BladeData {
  /** 唯一 id（拼音短名） */
  id: string;
  name: string;
  quality: Quality;
  /** 基础伤害（关1基准） */
  baseDamage: number;
  /** 刀长 px */
  length: number;
  /** 刀宽 px */
  width: number;
  /** 转速修正（+0.15 = +15%） */
  speedMod: number;
  effect: BladeEffect;
  /** 获取关卡（1-6；'initial'=初始；6boss=关6Boss；'quest4'=关4任务） */
  obtain: 'initial' | number | 'quest4' | 'boss6';
  desc: string;
}

export const BLADES: readonly BladeData[] = [
  // ---- 凡品（白）----
  {
    id: 'tiejiang', name: '铁匠刀', quality: 'white',
    baseDamage: 18, length: 80, width: 6, speedMod: 0,
    effect: { tag: 'none' }, obtain: 'initial',
    desc: '父亲留下的钝刀，刀刃藏着锈迹，也藏着往事。',
  },
  {
    id: 'pichai', name: '劈柴刀', quality: 'white',
    baseDamage: 22, length: 72, width: 8, speedMod: -0.05,
    effect: { tag: 'none' }, obtain: 1,
    desc: '铁匠铺用来劈柴的粗刀，厚实耐砍。',
  },
  {
    id: 'tigu', name: '剔骨刀', quality: 'white',
    baseDamage: 16, length: 60, width: 4, speedMod: 0.1,
    effect: { tag: 'execute', threshold: 0.3, bonus: 0.2 }, obtain: 1,
    desc: '屠户用的短刀，轻巧锋利。',
  },
  // ---- 良品（绿）----
  {
    id: 'jinggang', name: '精钢刀', quality: 'green',
    baseDamage: 26, length: 85, width: 6, speedMod: 0,
    effect: { tag: 'none' }, obtain: 1,
    desc: '黑风寨铁匠的杰作，质地匀称。',
  },
  {
    id: 'niujiao', name: '牛角刀', quality: 'green',
    baseDamage: 24, length: 70, width: 7, speedMod: 0.05,
    effect: { tag: 'killHeal', ratio: 0.03 }, obtain: 2,
    desc: '刀柄镶牛角，山匪标配。',
  },
  {
    id: 'liuye', name: '柳叶刀', quality: 'green',
    baseDamage: 21, length: 95, width: 4, speedMod: 0.1,
    effect: { tag: 'none' }, obtain: 2,
    desc: '刀身细长如柳叶，快而轻盈。',
  },
  {
    id: 'huya', name: '虎牙短刀', quality: 'green',
    baseDamage: 28, length: 65, width: 8, speedMod: -0.08,
    effect: { tag: 'bleed', totalDamage: 15, duration: 5 }, obtain: 3,
    desc: '断魂谷邪教所用，刃带锯齿。',
  },
  // ---- 精品（蓝）----
  {
    id: 'yanling', name: '雁翎刀', quality: 'blue',
    baseDamage: 34, length: 100, width: 6, speedMod: 0,
    effect: { tag: 'radius', ratio: 0.08 }, obtain: 2,
    desc: '官府雁翎刀的仿制，弧度优雅。',
  },
  {
    id: 'guitou', name: '鬼头刀', quality: 'blue',
    baseDamage: 38, length: 88, width: 9, speedMod: -0.1,
    effect: { tag: 'clashWinRate', bonus: 0.06 }, obtain: 3,
    desc: '刀背厚实，刀首鬼面，气势迫人。',
  },
  {
    id: 'yuanyue', name: '圆月弯刀', quality: 'blue',
    baseDamage: 30, length: 82, width: 5, speedMod: 0.15,
    effect: { tag: 'clashDamage', ratio: 0.2 }, obtain: 4,
    desc: '弧形如满月，转起来光晕流转。',
  },
  {
    id: 'xuantie', name: '玄铁重刀', quality: 'blue',
    baseDamage: 42, length: 110, width: 10, speedMod: -0.2,
    effect: { tag: 'clashMomentum', ratio: 0.25 }, obtain: 3,
    desc: '玄铁打造，势大力沉。',
  },
  // ---- 珍品（紫）----
  {
    id: 'longlin', name: '龙鳞刀', quality: 'purple',
    baseDamage: 48, length: 105, width: 7, speedMod: 0,
    effect: { tag: 'crit', rate: 0.1, damage: 0.5 }, obtain: 4,
    desc: '刀身布满龙鳞纹，藏锋内敛。',
  },
  {
    id: 'hanyue', name: '寒月刀', quality: 'purple',
    baseDamage: 44, length: 100, width: 6, speedMod: 0.05,
    effect: { tag: 'slow', ratio: 0.3, duration: 2 }, obtain: 5,
    desc: '寒气逼人，月色般清冷。',
  },
  {
    id: 'chiyan', name: '赤焰刀', quality: 'purple',
    baseDamage: 46, length: 95, width: 7, speedMod: 0.05,
    effect: { tag: 'burn', totalDamage: 40, duration: 5 }, obtain: 5,
    desc: '刀身赤红如焰，灼人肌肤。',
  },
  {
    id: 'huxiao', name: '虎啸狂刀', quality: 'purple',
    baseDamage: 52, length: 115, width: 9, speedMod: -0.15,
    effect: { tag: 'berserk', ratio: 0.15, duration: 8 }, obtain: 5,
    desc: '刀鸣如虎啸，越战越狂。',
  },
  {
    id: 'pojing', name: '破镜重圆', quality: 'purple',
    baseDamage: 54, length: 118, width: 8, speedMod: 0.05,
    effect: { tag: 'clashHeal', ratio: 0.1 }, obtain: 'quest4',
    desc: '铸剑山庄所赠，以破镜残片重铸，象征和解。',
  },
  // ---- 神品（橙）----
  {
    id: 'tulong', name: '屠龙刀', quality: 'orange',
    baseDamage: 60, length: 120, width: 10, speedMod: 0,
    effect: { tag: 'breakMaster', breakRate: 0.15, breakGuardBonus: 0.2 }, obtain: 6,
    desc: '天下第一刀，斩龙之刃，武林至宝。',
  },
  {
    id: 'qianye', name: '千叶流光刀', quality: 'orange',
    baseDamage: 52, length: 130, width: 5, speedMod: 0.15,
    effect: { tag: 'extraBlade' }, obtain: 6,
    desc: '刀身轻薄如叶，旋转似流光。',
  },
  {
    id: 'cangfeng', name: '藏锋·无名', quality: 'orange',
    baseDamage: 56, length: 125, width: 8, speedMod: 0.1,
    effect: { tag: 'affinity', ratio: 0.2 }, obtain: 'boss6',
    desc: '家传之刀的完全体，锈迹褪尽，锋芒毕露。',
  },
] as const;

/** 按 id 查询 */
export const BLADES_BY_ID: ReadonlyMap<string, BladeData> = new Map(
  BLADES.map((b) => [b.id, b]),
);

/** 初始刀（铁匠刀） */
export const STARTER_BLADE_ID = 'tiejiang';

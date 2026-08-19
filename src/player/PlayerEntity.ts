/**
 * PlayerEntity —— 玩家实体（wiki/06-balance/属性总表.md §1/§2）
 *
 * 职责：HP/移速/防御、WASD 移动、受击（无敌帧 0.5s，M3 预读确认）、
 * 双线经验累积（刀法/刀具独立，升级曲线与经验.md §4/§5 精确表）、
 * 持刀旋转参数汇总（BladeRotator 消费）。
 *
 * 经验规则（升级曲线与经验.md §3，M4 修正）：
 * - 击杀经验同时计入刀法与刀具两线（不分割）
 * - 拼刀经验只入刀法线
 */

import type { IPlayer } from '../core/GameContext';
import { clamp } from '../math/Geometry';
import { vec2, type Vec2 } from '../math/Vec2';
import { round } from '../combat/util';
import {
  bladeDamageBonus,
  bladeKnockbackBonus,
  bladeLengthBonus,
  bladeWidthBonus,
  techComboCap,
  techDamageFactor,
  techOmegaBonus,
  techRadiusBonus,
} from './GrowthTables';
import { bladeExpNeed, techExpNeed } from '../data/upgrades';
import type { Quality } from '../core/Quality';

/** 受击无敌帧（秒，M3 预读确认 0.5s） */
export const IFRAME_DURATION = 0.5;

/** 玩家死亡事件载荷 */
export interface PlayerDeathInfo {
  killedBy: string;
}

export class PlayerEntity implements IPlayer {
  readonly entityId = 1;
  pos: Vec2;

  /** 当前关卡（1-6，属性总表 §1 按关取基础属性） */
  level: number;
  hpMax: number;
  hp: number;
  speed: number;
  def: number;

  /** 双线等级与经验 */
  techLv = 1;
  techExp = 0;
  bladeLv = 1;
  bladeExp = 0;

  /** 当前刀具（M3 固定铁匠刀，装备系统 M6 接入替换） */
  blade: {
    name: string;
    quality: Quality;
    baseDamage: number;
    length: number;
    width: number;
    speedMod: number; // 转速修正（属性总表 §7，铁匠刀 0%）
  };

  /** 无敌帧剩余 */
  iframes = 0;
  /** 僵直剩余（拼刀败 0.8s 等） */
  stun = 0;
  /** 减速状态（毒镖命中）：剩余时间与幅度 */
  slowTime = 0;
  slowRatio = 0;
  /** 破刀诀天赋（M6 升级池接入，拼刀解算输入） */
  hasBreakTalent = false;
  /** 连破 Buff「刀势如虹」剩余（伤害公式.md §4.3） */
  momentumBuffTime = 0;

  /** 本物理帧位移（渲染插值/击退叠加用） */
  readonly moveDelta: Vec2 = vec2();

  onLevelUp: ((line: 'tech' | 'blade', newLv: number) => void) | null = null;
  onDeath: ((info: PlayerDeathInfo) => void) | null = null;

  constructor(level = 1) {
    this.level = level;
    this.pos = vec2(1200, 675);
    const base = { hp: 100, speed: 180, def: 5 }; // 关1（属性总表 §1）
    this.hpMax = base.hp;
    this.hp = base.hp;
    this.speed = base.speed;
    this.def = base.def;
    this.blade = {
      name: '铁匠刀',
      quality: 'white',
      baseDamage: 18,
      length: 80,
      width: 6,
      speedMod: 0,
    };
  }

  /** 是否存活 */
  get alive(): boolean {
    return this.hp > 0;
  }

  /** 刀法伤害系数（属性总表 §3） */
  get techFactor(): number {
    return techDamageFactor(this.techLv);
  }

  /** 刀法连击上限 */
  get comboCap(): number {
    return techComboCap(this.techLv);
  }

  /** 实际角速度 ω = ω0 × (1+刀法加成) × (1+刀具转速修正)（转刀机制.md §3.1） */
  get omega(): number {
    return 3.49 * (1 + techOmegaBonus(this.techLv)) * (1 + this.blade.speedMod);
  }

  /** 当前移速（受减速状态影响） */
  get effectiveSpeed(): number {
    return this.slowTime > 0 ? this.speed * (1 - this.slowRatio) : this.speed;
  }

  /** 实际刀长（刀具 L × 刀法半径加成 × 刀具等级刀长加成） */
  get bladeLength(): number {
    return (
      this.blade.length *
      (1 + techRadiusBonus(this.techLv)) *
      (1 + bladeLengthBonus(this.bladeLv))
    );
  }

  /** 实际刀宽 */
  get bladeWidth(): number {
    return this.blade.width * (1 + bladeWidthBonus(this.bladeLv));
  }

  /** 刀具等级伤害加成 */
  get bladeLevelDamageBonus(): number {
    return bladeDamageBonus(this.bladeLv);
  }

  /** 刀具等级击退加成 */
  get bladeLevelKnockbackBonus(): number {
    return bladeKnockbackBonus(this.bladeLv);
  }

  /** 每物理帧更新（冷却/状态衰减） */
  tick(dt: number): void {
    if (this.iframes > 0) this.iframes = Math.max(0, this.iframes - dt);
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    if (this.slowTime > 0) this.slowTime = Math.max(0, this.slowTime - dt);
    if (this.momentumBuffTime > 0) {
      this.momentumBuffTime = Math.max(0, this.momentumBuffTime - dt);
    }
  }

  /** WASD 移动（僵直时不可移动） */
  move(axis: Vec2, dt: number, worldW: number, worldH: number, playerR: number): void {
    if (this.stun > 0 || !this.alive) {
      this.moveDelta.x = 0;
      this.moveDelta.y = 0;
      return;
    }
    const nx = clamp(
      this.pos.x + axis.x * this.effectiveSpeed * dt,
      playerR,
      worldW - playerR,
    );
    const ny = clamp(
      this.pos.y + axis.y * this.effectiveSpeed * dt,
      playerR,
      worldH - playerR,
    );
    this.moveDelta.x = nx - this.pos.x;
    this.moveDelta.y = ny - this.pos.y;
    this.pos.x = nx;
    this.pos.y = ny;
  }

  /** 受击（返回实际伤害；无敌帧/已死亡返回 0） */
  takeDamage(rawDamage: number, source: string): number {
    if (!this.alive || this.iframes > 0) return 0;
    const dmg = round(rawDamage * (1 - this.def / (this.def + 120)));
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = IFRAME_DURATION;
    if (this.hp <= 0) this.onDeath?.({ killedBy: source });
    return dmg;
  }

  /** 治疗（吸血/回复） */
  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.hpMax, this.hp + amount);
  }

  /** 双线经验（升级曲线与经验.md §3/§4/§5：击杀经验双线同计，拼刀只入刀法） */
  addTechExp(exp: number): boolean {
    let up = false;
    this.techExp += exp;
    let need = techExpNeed(this.techLv);
    while (need !== null && this.techExp >= need && this.techLv < 20) {
      this.techExp -= need;
      this.techLv++;
      up = true;
      this.onLevelUp?.('tech', this.techLv);
      need = techExpNeed(this.techLv);
    }
    return up;
  }

  addBladeExp(exp: number): boolean {
    let up = false;
    this.bladeExp += exp;
    let need = bladeExpNeed(this.bladeLv);
    while (need !== null && this.bladeExp >= need && this.bladeLv < 20) {
      this.bladeExp -= need;
      this.bladeLv++;
      up = true;
      this.onLevelUp?.('blade', this.bladeLv);
      need = bladeExpNeed(this.bladeLv);
    }
    return up;
  }

  /** 击杀经验：双线同计（M4 修正，升级曲线.md §3） */
  addKillExp(exp: number): { techUp: boolean; bladeUp: boolean } {
    return {
      techUp: this.addTechExp(exp),
      bladeUp: this.addBladeExp(exp),
    };
  }

  get techExpNeed(): number {
    return techExpNeed(this.techLv) ?? Number.POSITIVE_INFINITY;
  }

  get bladeExpNeed(): number {
    return bladeExpNeed(this.bladeLv) ?? Number.POSITIVE_INFINITY;
  }
}

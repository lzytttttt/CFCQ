/**
 * Boss —— 多阶段 Boss 实体（wiki/05-enemy/Boss设计.md §3/§4）
 *
 * M8 精简版（用户确认）：每 Boss 2-3 代表性技能，阶段机/血条/拼刀窗口/破刀抗性全量。
 * - 通用：HP 阈值阶段切换（切换短暂无敌+白闪+台词回调）、追踪、拼刀窗口（技能前摇期间胜率 +0.15）
 * - 赵横：横扫（前摇 0.6s 扇形判定）+ 冲锋（蓄力 1s 直线，可被拼刀打断）
 * - 血禅师：毒域（地面持续伤害区）+ 召唤 2 血刀僧
 * - 欧阳冶：重击（前摇 1.2s 大范围，可被拼刀打断）
 * - 司马烈：双刀（相位差 π）+ 飞刀阵（6 把环形飞刀射出）
 * - 冷无缺：影分身（2 个 50% 动量 1HP 分身）
 * - 天绝老人：4 阶段——气劲波/万刃风暴（无敌期）/双刀（动量×1.5）/刀光雨（连拼 3 次破防）
 */

import { RNG } from '../core/RNG';
import { clamp } from '../math/Geometry';
import { vec2, type Vec2 } from '../math/Vec2';
import { createBladeBody, type BladeBody } from '../physics/BladeCollision';
import type { HitTarget } from '../physics/CollisionEngine';
import type { BossData, BossStage } from '../data/bosses';
import type { ProjectileSpec } from './Projectile';

/** 横扫判定半径（px）：伤害判定与预警圈渲染共用（wiki/05-enemy/Boss设计.md §3.2） */
const SWEEP_RADIUS = 140;
/** 重击判定半径（px）：伤害判定与预警圈渲染共用 */
const HEAVY_RADIUS = 220;

export interface BossHooks {
  damagePlayer(amount: number, source: string, kind: 'contact' | 'aoe' | 'explosion' | 'wave'): void;
  spawnProjectile(spec: ProjectileSpec, pos: Vec2, dir: Vec2, ownerId: number): void;
  /** 召唤小怪（血禅师/分身） */
  summonEnemy(kind: 'bloodmonk' | 'shadowClone', pos: Vec2, momentumRatio: number): void;
  /** 毒域/危险区（持续伤害区） */
  spawnZone(pos: Vec2, radius: number, duration: number, dps: number): void;
  /** 阶段切换（演出：白闪/台词） */
  onStageChange(stage: number): void;
  /** 特效请求 */
  fx(kind: 'slam' | 'storm' | 'rain', pos: Vec2): void;
}

type BossAction =
  | 'idle'
  | 'track'
  | 'windupSweep' | 'sweepHit'
  | 'windupCharge' | 'charging'
  | 'windupHeavy' | 'heavyHit'
  | 'castSummon' | 'castZone' | 'castKnives'
  | 'castWave' | 'stormInvuln'
  | 'castRain'
  | 'castClones';

export class Boss {
  readonly spec: BossData;
  readonly target: HitTarget;
  readonly hpMax: number;
  hp: number;
  readonly pos: Vec2;
  readonly speed: number;

  /** 刀体（双刀 Boss 2 条） */
  blades: BladeBody[] = [];
  stun = 0;
  hitFlash = 0;
  brokenGuard = 0;
  bladeDisabled = 0;
  /** 阶段切换无敌 */
  stageInvuln = 0;
  /** 万刃风暴无敌 */
  stormInvulnTimer = 0;
  /** 当前阶段（1 起） */
  stage = 1;
  /** 拼刀窗口开启（技能前摇中：胜率 +0.15） */
  clashWindow = false;
  /** 阶段 4 连拼破防计数（天绝） */
  rainClashCount = 0;
  vulnerable = false;

  private action: BossAction = 'track';
  private actionTimer = 0;
  private cooldown = 1.5;
  private dashDir: Vec2 = vec2(1, 0);
  private readonly rng: RNG;
  private nextId: () => number;

  constructor(
    spec: BossData,
    pos: Vec2,
    worldLevel: number,
    rng: RNG,
    nextId: () => number,
    private readonly hooks: BossHooks,
  ) {
    this.spec = spec;
    this.pos = vec2(pos.x, pos.y);
    this.rng = rng;
    this.nextId = nextId;
    const scale = 1 + 0.15 * (worldLevel - 1);
    this.hpMax = Math.round(spec.hp * scale);
    this.hp = this.hpMax;
    this.speed = spec.speed;
    this.target = {
      id: nextId(),
      pos: this.pos,
      r: 26,
      hittable: true,
      faction: 'enemy',
    };
    const bladeCount = spec.dual ? 2 : 1;
    for (let i = 0; i < bladeCount; i++) {
      const b = createBladeBody({
        owner: 'enemy',
        ownerId: this.target.id,
        center: this.pos,
        length: spec.blade.length,
        width: spec.blade.width,
        omega: spec.blade.omega,
        index: i,
      });
      const q = spec.blade.quality;
      b.quality = q >= 1.8 ? 'orange' : q >= 1.5 ? 'purple' : q >= 1.3 ? 'blue' : q >= 1.15 ? 'green' : 'white';
      b.angle = (i * Math.PI * 2) / bladeCount;
      this.blades.push(b);
    }
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get invulnerable(): boolean {
    return this.stageInvuln > 0 || this.stormInvulnTimer > 0;
  }

  /** 当前阶段定义 */
  get currentStage(): BossStage {
    return this.spec.stages[this.stage - 1]!;
  }

  /**
   * 当前前摇技能的攻击范围半径（px），供渲染层绘制淡淡的预警圈；
   * 非前摇状态或直线技能（冲锋）为 0 —— 不绘制。
   */
  get attackTelegraphRadius(): number {
    switch (this.action) {
      case 'windupSweep':
        return SWEEP_RADIUS;
      case 'windupHeavy':
        return HEAVY_RADIUS;
      default:
        return 0;
    }
  }

  tick(dt: number, playerPos: Vec2, worldW: number, worldH: number): void {
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.brokenGuard > 0) this.brokenGuard = Math.max(0, this.brokenGuard - dt);
    if (this.bladeDisabled > 0) this.bladeDisabled = Math.max(0, this.bladeDisabled - dt);
    if (this.stageInvuln > 0) this.stageInvuln = Math.max(0, this.stageInvuln - dt);
    if (this.stormInvulnTimer > 0) this.stormInvulnTimer = Math.max(0, this.stormInvulnTimer - dt);
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    if (!this.alive) {
      this.target.hittable = false;
      return;
    }
    this.target.hittable = !this.invulnerable;

    const dx = playerPos.x - this.pos.x;
    const dy = playerPos.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    const ux = dist > 0.001 ? dx / dist : 0;
    const uy = dist > 0.001 ? dy / dist : 0;

    if (this.stun > 0) {
      this.stun = Math.max(0, this.stun - dt);
    } else {
      this.runAction(dt, playerPos, dist, ux, uy);
    }

    this.pos.x = clamp(this.pos.x, this.target.r, worldW - this.target.r);
    this.pos.y = clamp(this.pos.y, this.target.r, worldH - this.target.r);

    // 接触伤害
    if (dist < this.target.r + 18) {
      this.hooks.damagePlayer(Math.round(this.damageOf(0)), this.spec.name, 'contact');
    }

    // 刀体同步（阶段 3 天绝双刀动量 ×1.5 → 宽度放大表达）
    const dualBoost =
      this.spec.id === 'tianjue' && this.stage >= 3 ? 1.5 : 1;
    for (const b of this.blades) {
      b.center.x = this.pos.x;
      b.center.y = this.pos.y;
      b.width = this.spec.blade.width * dualBoost;
      b.active = this.alive && this.bladeDisabled <= 0 && this.stun <= 0;
    }
  }

  /** 技能伤害（damages 数组：0=接触 1..n=技能） */
  damageOf(index: number): number {
    const d = this.spec.damages[Math.min(index, this.spec.damages.length - 1)]!;
    return d;
  }

  /** 行为驱动：阶段决定可用技能池 */
  private runAction(dt: number, playerPos: Vec2, dist: number, ux: number, uy: number): void {
    this.clashWindow = false;

    switch (this.action) {
      case 'track': {
        // 追踪
        if (dist > this.target.r + 60) {
          this.pos.x += ux * this.speed * dt;
          this.pos.y += uy * this.speed * dt;
        }
        // 技能选择
        if (this.cooldown <= 0) this.chooseAction(dist);
        break;
      }
      case 'windupSweep': {
        this.actionTimer -= dt;
        this.clashWindow = true;
        if (this.actionTimer <= 0) {
          // 横扫判定（SWEEP_RADIUS 范围）
          if (dist < SWEEP_RADIUS) this.hooks.damagePlayer(this.damageOf(1), this.spec.name, 'aoe');
          this.hooks.fx('slam', this.pos);
          this.action = 'track';
          this.cooldown = 2.2;
        }
        break;
      }
      case 'windupCharge': {
        this.actionTimer -= dt;
        this.clashWindow = true;
        if (this.actionTimer <= 0) {
          const d = vec2(playerPos.x - this.pos.x, playerPos.y - this.pos.y);
          const l = Math.hypot(d.x, d.y) || 1;
          this.dashDir = vec2(d.x / l, d.y / l);
          this.action = 'charging';
          this.actionTimer = 0.8;
        }
        break;
      }
      case 'charging': {
        this.actionTimer -= dt;
        this.pos.x += this.dashDir.x * this.speed * 3.2 * dt;
        this.pos.y += this.dashDir.y * this.speed * 3.2 * dt;
        if (this.actionTimer <= 0) {
          this.action = 'track';
          this.cooldown = 3.0;
        }
        break;
      }
      case 'windupHeavy': {
        this.actionTimer -= dt;
        this.clashWindow = true;
        if (this.actionTimer <= 0) {
          if (dist < HEAVY_RADIUS) this.hooks.damagePlayer(this.damageOf(1), this.spec.name, 'aoe');
          this.hooks.fx('slam', this.pos);
          this.cameraShake();
          this.action = 'track';
          this.cooldown = 4.0;
        }
        break;
      }
      case 'castZone': {
        // 毒域（血禅师）：玩家脚下生成持续区
        this.hooks.spawnZone(vec2(playerPos.x, playerPos.y), 110, 4, Math.round(this.damageOf(1) / 4));
        this.action = 'track';
        this.cooldown = 5.0;
        break;
      }
      case 'castSummon': {
        // 召唤 2 血刀僧
        for (let i = 0; i < 2; i++) {
          const a = (i * Math.PI) / 2 + 0.5;
          this.hooks.summonEnemy(
            'bloodmonk',
            vec2(this.pos.x + Math.cos(a) * 90, this.pos.y + Math.sin(a) * 90),
            1,
          );
        }
        this.action = 'track';
        this.cooldown = 8.0;
        break;
      }
      case 'castKnives': {
        // 司马烈飞刀阵：6 把环形射出
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI * 2) / 6;
          this.hooks.spawnProjectile(
            { kind: 'spinningKnife', damage: this.damageOf(1), speed: 300, life: 3, length: 34 },
            vec2(this.pos.x + Math.cos(a) * 40, this.pos.y + Math.sin(a) * 40),
            vec2(Math.cos(a), Math.sin(a)),
            this.target.id,
          );
        }
        this.action = 'track';
        this.cooldown = 4.5;
        break;
      }
      case 'castWave': {
        // 气劲波（天绝阶段1）：直线远程
        const d = vec2(playerPos.x - this.pos.x, playerPos.y - this.pos.y);
        const l = Math.hypot(d.x, d.y) || 1;
        this.hooks.spawnProjectile(
          { kind: 'arrow', damage: this.damageOf(1), speed: 420, life: 3 },
          this.pos,
          vec2(d.x / l, d.y / l),
          this.target.id,
        );
        this.action = 'track';
        this.cooldown = 2.8;
        break;
      }
      case 'stormInvuln': {
        // 万刃风暴（天绝阶段2）：无敌 + 大范围持续伤害
        this.actionTimer -= dt;
        if (dist < 260) {
          this.hooks.damagePlayer(Math.round(this.damageOf(2) / 3), this.spec.name, 'wave');
        }
        if (this.actionTimer <= 0) {
          this.action = 'track';
          this.cooldown = 3.5;
        }
        break;
      }
      case 'castRain': {
        // 刀光雨（天绝阶段4）：8 方向飞刀 + 破防判定
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI * 2) / 8 + this.rng.nextRange(-0.2, 0.2);
          this.hooks.spawnProjectile(
            { kind: 'spinningKnife', damage: this.damageOf(2), speed: 330, life: 3, length: 34 },
            vec2(this.pos.x + Math.cos(a) * 50, this.pos.y + Math.sin(a) * 50),
            vec2(Math.cos(a), Math.sin(a)),
            this.target.id,
          );
        }
        this.action = 'track';
        this.cooldown = 3.0;
        break;
      }
      case 'castClones': {
        // 影分身（冷无缺）：2 个 50% 动量 1HP 分身
        for (let i = 0; i < 2; i++) {
          const a = (i + 1) * 2.1;
          this.hooks.summonEnemy(
            'shadowClone',
            vec2(this.pos.x + Math.cos(a) * 80, this.pos.y + Math.sin(a) * 80),
            0.5,
          );
        }
        this.action = 'track';
        this.cooldown = 9.0;
        break;
      }
      default:
        this.action = 'track';
    }
  }

  private cameraShake(): void {
    // 由 hooks.fx 传达
  }

  /** 按阶段与 Boss 选择技能 */
  private chooseAction(dist: number): void {
    const id = this.spec.id;
    const stage = this.stage;

    if (id === 'zhaoheng') {
      if (stage >= 2 && dist > 200 && this.rng.chance(0.5)) {
        this.action = 'windupCharge';
        this.actionTimer = 1.0; // 蓄力 1s（可被拼刀打断）
      } else {
        this.action = 'windupSweep';
        this.actionTimer = 0.6; // 前摇 0.6s
      }
    } else if (id === 'bloodmaster') {
      if (stage >= 2 && this.rng.chance(0.4)) {
        this.action = 'castSummon';
      } else {
        this.action = 'castZone';
      }
    } else if (id === 'ouyangye') {
      this.action = 'windupHeavy';
      this.actionTimer = 1.2; // 重击前摇 1.2s（拼刀窗口 +0.2）
    } else if (id === 'simalie') {
      if (stage >= 2 && this.rng.chance(0.55)) {
        this.action = 'castKnives';
      } else {
        this.action = 'windupSweep';
        this.actionTimer = 0.6;
      }
    } else if (id === 'lengwuque') {
      if (stage === 2 && this.rng.chance(0.5)) {
        this.action = 'castClones';
      } else {
        this.action = 'windupCharge';
        this.actionTimer = 0.7;
      }
    } else if (id === 'tianjue') {
      if (stage === 1) {
        this.action = this.rng.chance(0.5) ? 'castWave' : 'windupSweep';
        if (this.action === 'windupSweep') this.actionTimer = 0.6;
      } else if (stage === 2) {
        this.action = 'stormInvuln';
        this.actionTimer = 3.0;
        this.stormInvulnTimer = 3.0;
        this.hooks.fx('storm', this.pos);
      } else if (stage === 3) {
        this.action = this.rng.chance(0.5) ? 'windupCharge' : 'windupSweep';
        this.actionTimer = this.action === 'windupSweep' ? 0.5 : 0.7;
      } else {
        this.action = 'castRain';
      }
    } else {
      this.action = 'windupSweep';
      this.actionTimer = 0.6;
    }
  }

  /** 受击（阶段切换检测） */
  applyHit(damage: number, knockbackDir: Vec2, knockbackDist: number, stun = 0.05): boolean {
    if (!this.alive || this.invulnerable) return false;
    this.hp -= damage;
    this.hitFlash = 0.12;
    this.stun = Math.max(this.stun, stun);
    // 蓄力可被拼刀打断（charge/heavy 蓄力中受击不打断——需拼刀；普通命中不打断蓄力）
    void knockbackDir;
    void knockbackDist;
    if (this.hp <= 0) {
      this.hp = 0;
      this.target.hittable = false;
      return true;
    }
    // 阶段切换检测
    const ratio = this.hp / this.hpMax;
    while (this.stage < this.spec.stages.length && ratio <= this.currentStage.hpTo) {
      this.stage++;
      this.stageInvuln = 1.0; // 切换短暂无敌
      this.action = 'track';
      this.cooldown = 1.2;
      this.hooks.onStageChange(this.stage);
    }
    return false;
  }

  /** 拼刀打断技能（冲锋/重击蓄力中拼刀成功 → 僵直） */
  interruptByClash(): void {
    if (
      this.action === 'windupCharge' ||
      this.action === 'windupHeavy' ||
      this.action === 'charging'
    ) {
      this.action = 'track';
      this.cooldown = 2.5;
    }
  }

  /** 刀光雨破防计数（天绝阶段 4：连拼 3 次成功 → 破防） */
  registerRainClash(): void {
    this.rainClashCount++;
    if (this.rainClashCount >= 3) {
      this.rainClashCount = 0;
      this.vulnerable = true;
      this.brokenGuard = 4.0; // 破防窗口 4s（受伤 +100% 由伤害侧消费）
    }
  }
}

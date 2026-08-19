/**
 * Enemy —— 完整敌人实体（M5，替换 M3 的 SimpleEnemy）
 *
 * 15 种小怪统一状态机（wiki/05-enemy/小怪图鉴.md §5 行为模式）：
 * - 追踪 / 冲刺 / 保持距离 / 包围 / 自爆 / 持刀旋转 / 近身 AOE
 * 行为参数：AIParams.ts（M5 预读确认值）
 *
 * 状态优先级：死亡 > 受击僵直 > 蓄力/冲刺执行 > 常规行为
 */

import type { RNG } from '../core/RNG';
import { clamp } from '../math/Geometry';
import { vec2, type Vec2 } from '../math/Vec2';
import { createBladeBody, type BladeBody } from '../physics/BladeCollision';
import type { HitTarget } from '../physics/CollisionEngine';
import type { EnemyData } from '../data/enemies';
import {
  CULTIST_SUICIDE,
  GUARD_DASH,
  HOUND_DASH,
  RANGED,
  SLAVE_DASH,
  THUG_AOE,
} from './AIParams';
import type { Projectile, ProjectileSpec } from './Projectile';

/** 敌人对世界的动作回调（由 BattleState 注入，避免依赖倒置） */
export interface EnemyHooks {
  /** 对玩家造成伤害（contact 接触 / aoe 挥击 / explosion 自爆） */
  damagePlayer(amount: number, source: string, kind: 'contact' | 'aoe' | 'explosion'): void;
  /** 发射弹道 */
  spawnProjectile(spec: ProjectileSpec, pos: Vec2, dir: Vec2, ownerId: number): void;
  /** 自爆特效请求（粒子/震屏由 BattleState 处理） */
  onExplode(pos: Vec2, radius: number): void;
}

type AIPlan = 'idle' | 'chase' | 'reposition' | 'windupDash' | 'dashing' | 'windupAoe' | 'windupSuicide';

export class Enemy {
  readonly spec: EnemyData;
  readonly target: HitTarget;
  readonly hpMax: number;
  hp: number;
  /** 关卡缩放后伤害 */
  readonly damage: number;

  pos: Vec2;
  stun = 0;
  knockVel: Vec2 = vec2();
  brokenGuard = 0;
  bladeDisabled = 0;
  hitFlash = 0;
  /** 刀体（1-2 条：双刀相位差 π） */
  blades: BladeBody[] = [];

  // ---- AI 状态 ----
  private plan: AIPlan = 'chase';
  private dashCd = 0;
  private dashTimer = 0; // >0 蓄力剩余；<0 冲刺剩余（负值）
  private dashDir: Vec2 = vec2(1, 0);
  private aoeTimer = 0;
  private suicideTimer = 0;
  private shootCd = 0;
  private shootInterval: number;
  private strafeSign: 1 | -1;
  /** 蓄力预警强度 0-1（渲染用） */
  windupGlow = 0;

  constructor(
    spec: EnemyData,
    pos: Vec2,
    worldLevel: number,
    private readonly rng: RNG,
    nextId: () => number,
    private readonly hooks: EnemyHooks,
  ) {
    this.spec = spec;
    this.pos = vec2(pos.x, pos.y);
    const scale = 1 + 0.15 * (worldLevel - 1);
    this.hpMax = Math.round(spec.hp * scale);
    this.hp = this.hpMax;
    this.damage = Math.round(spec.damage * scale);
    this.target = {
      id: nextId(),
      pos: this.pos,
      r: spec.radius,
      hittable: true,
      faction: 'enemy',
    };
    this.strafeSign = rng.chance(0.5) ? 1 : -1;
    this.shootInterval = rng.nextRange(RANGED.shootInterval[0], RANGED.shootInterval[1]);
    this.shootCd = rng.nextRange(0.5, this.shootInterval); // 首发错峰

    if (spec.blade) {
      const count = spec.blade.dual ? 2 : 1;
      for (let i = 0; i < count; i++) {
        this.blades.push(
          createBladeBody({
            owner: 'enemy',
            ownerId: this.target.id,
            center: this.pos,
            length: spec.blade.length,
            width: spec.blade.width,
            omega: spec.blade.omega,
            index: i,
          }),
        );
        // 品质系数：EnemyBladeSpec.quality 为数值，映射品质标签存入 BladeBody
        const q = spec.blade.quality;
        const label = q >= 1.8 ? 'orange' : q >= 1.5 ? 'purple' : q >= 1.3 ? 'blue' : q >= 1.15 ? 'green' : 'white';
        this.blades[i]!.quality = label;
        // 多刀相位均分圆周（双刀差 π）
        this.blades[i]!.angle = (i * Math.PI * 2) / count;
      }
    }
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** 是否处于冲刺中（不可打断的位移） */
  get dashing(): boolean {
    return this.dashTimer < 0;
  }

  /** 当前蓄力预警描述（渲染 HUD/特效用） */
  get windupKind(): 'dash' | 'aoe' | 'suicide' | null {
    if (this.suicideTimer > 0) return 'suicide';
    if (this.aoeTimer > 0) return 'aoe';
    if (this.dashTimer > 0) return 'dash';
    return null;
  }

  tick(dt: number, playerPos: Vec2, worldW: number, worldH: number): void {
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.brokenGuard > 0) this.brokenGuard = Math.max(0, this.brokenGuard - dt);
    if (this.bladeDisabled > 0) this.bladeDisabled = Math.max(0, this.bladeDisabled - dt);
    if (this.dashCd > 0) this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.shootCd > 0) this.shootCd = Math.max(0, this.shootCd - dt);
    this.windupGlow = 0;

    if (!this.alive) {
      this.target.hittable = false;
      return;
    }

    // 击退衰减
    if (!this.dashing) {
      this.pos.x += this.knockVel.x * dt;
      this.pos.y += this.knockVel.y * dt;
      const damp = Math.pow(0.001, dt);
      this.knockVel.x *= damp;
      this.knockVel.y *= damp;
    }

    const dx = playerPos.x - this.pos.x;
    const dy = playerPos.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    const ux = dist > 0.001 ? dx / dist : 0;
    const uy = dist > 0.001 ? dy / dist : 0;

    if (this.stun > 0) {
      this.stun = Math.max(0, this.stun - dt);
    } else {
      this.runBehavior(dt, playerPos, dist, ux, uy);
    }

    // 世界边界
    this.pos.x = clamp(this.pos.x, this.target.r, worldW - this.target.r);
    this.pos.y = clamp(this.pos.y, this.target.r, worldH - this.target.r);

    // 接触伤害（近战类：贴身即伤，由玩家无敌帧限频）
    if (
      this.alive &&
      dist < this.target.r + 18 &&
      this.spec.kind !== 'ranged'
    ) {
      this.hooks.damagePlayer(this.damage, this.spec.name, 'contact');
    }

    // 刀体同步
    for (const b of this.blades) {
      b.center.x = this.pos.x;
      b.center.y = this.pos.y;
      b.active = this.alive && this.bladeDisabled <= 0 && this.stun <= 0;
    }
  }

  private runBehavior(
    dt: number,
    playerPos: Vec2,
    dist: number,
    ux: number,
    uy: number,
  ): void {
    const behaviors = this.spec.behaviors;

    // ---- 进行中的特殊状态 ----

    // 冲刺执行（蓄力完成 → 高速直线）
    if (this.dashTimer < 0) {
      this.dashTimer += dt;
      this.pos.x += this.dashDir.x * this.dashSpeed() * dt;
      this.pos.y += this.dashDir.y * this.dashSpeed() * dt;
      if (this.dashTimer >= 0) this.plan = 'chase';
      return;
    }

    // 冲刺蓄力
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.windupGlow = 1 - this.dashTimer / this.windupDuration();
      if (this.dashTimer <= 0) {
        // 朝玩家当前位置发起冲刺
        const d = vec2(playerPos.x - this.pos.x, playerPos.y - this.pos.y);
        const l = Math.hypot(d.x, d.y) || 1;
        this.dashDir = vec2(d.x / l, d.y / l);
        this.dashTimer = -this.dashDuration();
      }
      return;
    }

    // 自爆引信
    if (this.suicideTimer > 0) {
      this.suicideTimer -= dt;
      this.windupGlow = 1 - this.suicideTimer / CULTIST_SUICIDE.fuse;
      if (this.suicideTimer <= 0) {
        this.explode(playerPos);
        return;
      }
      return; // 引信期间不移动（原地发光预警）
    }

    // AOE 蓄力
    if (this.aoeTimer > 0) {
      this.aoeTimer -= dt;
      this.windupGlow = 1 - this.aoeTimer / THUG_AOE.windup;
      if (this.aoeTimer <= 0) {
        // 前摇结束：范围内判定
        if (dist <= THUG_AOE.range) {
          this.hooks.damagePlayer(this.damage, this.spec.name, 'aoe');
        }
      }
      return;
    }

    // ---- 常规行为选择 ----

    const canDash = behaviors.includes('dash') || behaviors.includes('bladeSpinDash');
    if (canDash && this.dashCd <= 0 && dist < 600 && dist > 80) {
      // 触发冲刺：进入蓄力
      const p = this.dashParams();
      this.dashTimer = p.windup;
      this.dashCd = p.cooldown;
      this.plan = 'windupDash';
      return;
    }

    // 自爆触发
    if (behaviors.includes('selfDestruct') && dist < CULTIST_SUICIDE.triggerDist) {
      this.suicideTimer = CULTIST_SUICIDE.fuse;
      return;
    }

    // 近身 AOE 触发（打手：贴身挥击）
    if (behaviors.includes('meleeAoe') && dist < THUG_AOE.range * 0.9) {
      this.aoeTimer = THUG_AOE.windup;
      return;
    }

    // 远程：保持距离 + 射击
    if (behaviors.includes('keepDistance')) {
      this.rangedMoveAndShoot(dt, playerPos, dist, ux, uy);
      return;
    }

    // 追击（含 surround 切线偏置）
    this.moveToward(dt, ux, uy, dist);
    this.plan = 'chase';
  }

  /** 追击移动（surround 行为叠加切向分量） */
  private moveToward(dt: number, ux: number, uy: number, dist: number): void {
    if (dist <= this.target.r + 22) return; // 贴身停
    let vx = ux;
    let vy = uy;
    if (this.spec.behaviors.includes('surround')) {
      // 切向偏置：绕向玩家侧翼
      vx += -uy * 0.55 * this.strafeSign;
      vy += ux * 0.55 * this.strafeSign;
      const l = Math.hypot(vx, vy) || 1;
      vx /= l;
      vy /= l;
    }
    this.pos.x += vx * this.spec.speed * dt;
    this.pos.y += vy * this.spec.speed * dt;
  }

  /** 远程走位与射击 */
  private rangedMoveAndShoot(
    dt: number,
    playerPos: Vec2,
    dist: number,
    ux: number,
    uy: number,
  ): void {
    let vx = 0;
    let vy = 0;
    if (dist > RANGED.preferMax) {
      vx = ux;
      vy = uy; // 太远靠近
    } else if (dist < RANGED.preferMin) {
      vx = -ux;
      vy = -uy; // 太近后退
    } else {
      // 舒适区间切向游走
      vx = -uy * this.strafeSign * 0.6;
      vy = ux * this.strafeSign * 0.6;
      // 偶尔换向
      if (this.rng.chance(0.005)) this.strafeSign = (this.strafeSign * -1) as 1 | -1;
    }
    this.pos.x += vx * this.spec.speed * dt;
    this.pos.y += vy * this.spec.speed * dt;

    // 射击（射程内 + 冷却完毕）
    if (dist <= RANGED.range && this.shootCd <= 0) {
      this.shootCd = this.shootInterval;
      const dir = vec2(ux, uy);
      const spec: ProjectileSpec =
        this.spec.id === 'archer'
          ? { kind: 'arrow', damage: this.damage, speed: RANGED.projectileSpeed, life: 3 }
          : this.spec.id === 'poisondart'
            ? {
                kind: 'poisonDart', damage: this.damage, speed: RANGED.projectileSpeed, life: 3,
                slow: { ratio: 0.3, duration: 2 },
              }
            : {
                kind: 'spinningKnife', damage: this.damage,
                speed: RANGED.projectileSpeed * 0.9, life: 3.2, length: 40,
              };
      this.hooks.spawnProjectile(spec, this.pos, dir, this.target.id);
    }
  }

  /** 自爆结算 */
  private explode(playerPos: Vec2): void {
    const dist = Math.hypot(playerPos.x - this.pos.x, playerPos.y - this.pos.y);
    if (dist <= CULTIST_SUICIDE.blastRadius) {
      this.hooks.damagePlayer(
        Math.round(this.damage * CULTIST_SUICIDE.damageMult),
        this.spec.name,
        'explosion',
      );
    }
    this.hooks.onExplode(vec2(this.pos.x, this.pos.y), CULTIST_SUICIDE.blastRadius);
    // 自爆后死亡
    this.hp = 0;
    this.target.hittable = false;
  }

  // ---- 冲刺参数按怪种取值 ----
  private dashParams(): { cooldown: number; windup: number; speed: number; duration: number } {
    if (this.spec.id === 'ironguard') return GUARD_DASH;
    if (this.spec.id === 'swordslave') return SLAVE_DASH;
    return HOUND_DASH;
  }
  private dashSpeed(): number {
    return this.dashParams().speed;
  }
  private dashDuration(): number {
    return this.dashParams().duration;
  }
  private windupDuration(): number {
    return this.dashParams().windup;
  }

  /** 受击（返回是否死亡） */
  applyHit(damage: number, knockbackDir: Vec2, knockbackDist: number, stun = 0.08): boolean {
    if (!this.alive) return false;
    this.hp -= damage;
    this.hitFlash = 0.12;
    // 冲刺中被击退但不打断（精英冲撞感）；蓄力被打断（ punished for reading）
    if (this.dashTimer > 0) this.dashTimer = 0;
    this.stun = Math.max(this.stun, this.dashing ? 0.05 : stun);
    if (!this.dashing) {
      const k = knockbackDist / 0.15;
      this.knockVel.x = knockbackDir.x * k;
      this.knockVel.y = knockbackDir.y * k;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.target.hittable = false;
      return true;
    }
    return false;
  }
}

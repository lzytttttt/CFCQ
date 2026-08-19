/**
 * BattleState —— 战斗状态（M3 玩家转刀战斗闭环）
 *
 * 组装：玩家（WASD/转刀/双线经验/受击无敌帧）+ 真实数据小怪（追击/持刀拼刀）+
 * 碰撞引擎（命中/拼刀/阻挡）+ 打击反馈（hitstop 0.04s/震屏/伤害数字/闪白/红晕）。
 *
 * 打击感（P0）：
 * - hitstop：普通命中 0.04s（计划注记区间 0.03-0.05 中值）；击杀 0.06s；拼刀 0.12s
 * - 震屏：命中 1px / 击杀 3px / 拼刀 5px（渲染管线.md §5）
 * - 闪白：敌人受击 0.12s；拼刀全屏白闪
 */

import type { GameContext } from '../core/GameContext';
import type { GameLoop } from '../core/GameLoop';
import type { IGameState } from '../core/StateMachine';
import { vec2, type Vec2 } from '../math/Vec2';
import { normalize, sub } from '../math/Vec2';
import {
  advanceBlade,
  bladeHitsCircle,
  createBladeBody,
  type BladeBody,
} from '../physics/BladeCollision';
import { CollisionEngine } from '../physics/CollisionEngine';
import { PlayerEntity } from '../player/PlayerEntity';
import { ENEMIES_BY_ID } from '../data/enemies';
import { Enemy, type EnemyHooks } from '../enemy/Enemy';
import { Projectile, type ProjectileSpec } from '../enemy/Projectile';
import { BladeRenderer, BladeTrail } from '../render/BladeRenderer';
import type { Camera } from '../render/Camera';
import { ComboTracker } from '../combat/ComboTracker';
import { computeHitDamage, computeKnockback, COMBO_MULTIPLIER } from '../combat/Damage';
import { DamageNumbers } from '../render/DamageNumbers';
import { HUD } from '../render/HUD';
import type { ParticleSystem } from '../render/ParticleSystem';
import { RenderLayer, type RenderSystem } from '../render/RenderSystem';
import { DEFAULT_WORLD_H, DEFAULT_WORLD_W, VIEW_H, VIEW_W } from '../render/View';
import type { RNG } from '../core/RNG';
import { UpgradePicker } from '../player/UpgradePicker';
import { applyOption, createEmptyMods, type PlayerMods } from '../player/UpgradeEffects';
import { EquipmentGenerator, type EquipmentItem } from '../equipment/EquipmentGenerator';
import { Inventory } from '../equipment/Inventory';
import { emptyStats, type AggregatedStats } from '../equipment/Inventory';
import { UpgradePanel, injectUpgradePanelStyles } from '../ui/UpgradePanel';
import { InventoryPanel, injectInventoryStyles } from '../ui/InventoryPanel';
import type { UpgradeOption } from '../data/upgrades';
import { LevelGenerator, type LevelPlan, type RoomLayout } from '../rogue/LevelGenerator';
import { RunProgress } from '../rogue/RunProgress';
import { SaveLoad, type CodexProgress } from '../rogue/SaveLoad';
import { LEVELS_BY_ID } from '../data/levels';
import { formatAffix } from '../equipment/EquipmentGenerator';
import { Boss, type BossHooks } from '../enemy/Boss';
import { Dialog, injectDialogStyles } from '../ui/Dialog';
import { chapterOf, ENDINGS } from '../data/story';
import { BOSSES_BY_LEVEL } from '../data/bosses';
import type { DialogLine } from '../data/story';
import { BLADES_BY_ID, STARTER_BLADE_ID, type BladeData } from '../data/blades';

const PLAYER_R = 18; // 转刀机制.md §2.1：角色半径默认 18px
const HITSTOP_NORMAL = 0.04;
const HITSTOP_KILL = 0.06;
const HITSTOP_CLASH = 0.12;
/** M3 暴击率（无词条 0，公式链路保留） */
const CRIT_CHANCE = 0;

/** M5 刷怪波次（真实数据，属性总表 §5；M7 由关卡生成器替换） */
function waveComposition(wave: number): Array<{ spec: string; x: number; y: number }> {
  if (wave === 1) {
    return [
      { spec: 'lackey', x: 900, y: 500 },
      { spec: 'lackey', x: 1000, y: 620 },
      { spec: 'hound', x: 760, y: 700 },
    ];
  }
  if (wave === 2) {
    return [
      { spec: 'lackey', x: 820, y: 420 },
      { spec: 'hound', x: 700, y: 640 },
      { spec: 'archer', x: 1300, y: 380 },
      { spec: 'raider', x: 1100, y: 750 },
    ];
  }
  return [
    { spec: 'lackey', x: 800, y: 450 },
    { spec: 'hound', x: 1150, y: 400 },
    { spec: 'raider', x: 1000, y: 550 },
    { spec: 'dualbandit', x: 1400, y: 620 },
    { spec: 'flyingknifer', x: 900, y: 800 },
    { spec: 'thug', x: 1600, y: 500 },
  ];
}

export class BattleState implements IGameState {
  readonly player: PlayerEntity;
  private playerBlade: BladeBody;
  /** 多刀（首刀为 playerBlade） */
  private playerBlades: BladeBody[] = [];
  private playerTrail = new BladeTrail();
  private enemies: Enemy[] = [];
  /** 在场弹道 */
  private projectiles: Projectile[] = [];
  private trails = new Map<string, BladeTrail>();
  private engine!: CollisionEngine;
  private combo = new ComboTracker();
  private idSeq = 100;
  private aiRng!: RNG;

  private hitstop = 0;
  private wave = 1;
  private waveClearDelay = 0;
  /** 本波已刷怪数（波次推进判定：已刷且全灭） */
  private waveSpawned = 0;
  readonly hud = new HUD();
  /** 暴击率（词条聚合后动态更新） */
  private critChance = CRIT_CHANCE;

  // ---- M6：升级/装备系统 ----
  private picker = new UpgradePicker();
  /** 已选升级层数 */
  private takenOptions = new Map<string, number>();
  private mods: PlayerMods = createEmptyMods();
  private inventory = new Inventory();
  private gearGen!: EquipmentGenerator;
  private upgradePanel: UpgradePanel | null = null;
  private inventoryPanel: InventoryPanel | null = null;
  /** HUD 背包按钮（右下角常驻，点击开关背包，与 B 键等效） */
  private invToggleBtn: HTMLElement | null = null;
  /** 升级暂停标志（升级面板期间冻结战斗） */
  private pausedForUpgrade = false;
  /** 背包暂停标志 */
  private pausedForInventory = false;
  /** 待处理的升级排队（连升多级逐次弹面板） */
  private pendingUpgrades: number[] = [];
  /** 逆刃状态（空格切换，CD 8s；解锁需 mods.reverseEdge） */
  private reverseEdgeOn = false;
  private reverseCd = 0;
  /** 连续拼刀胜计数（刀势如虹触发用，3 次触发） */
  private clashWinStreak = 0;
  /** 场上装备掉落光点 */
  private drops: Array<{ item: EquipmentItem; x: number; y: number; glow: number }> = [];

  // ---- M7：Rogue 流程 ----
  private levelGen!: LevelGenerator;
  readonly progress = new RunProgress();
  private plan!: LevelPlan;
  /** 房间内波次（§6.2：每房 2-3 波） */
  private waveInRoom = 0;
  private wavesTotalInRoom = 2;
  /** 本房已刷怪且未全清标记（开门口径） */
  private waveStarted = false;
  /** 门开启状态与位置（右侧中央） */
  private doorOpen = false;
  private doorPos = { x: DEFAULT_WORLD_W - 70, y: DEFAULT_WORLD_H / 2, w: 60, h: 320 };
  /** 商店商品（商店房） */
  private shopGoods: Array<{ item: EquipmentItem; x: number; y: number; price: number; sold: boolean }> = [];
  /** 宝箱/休息/事件 POI */
  private roomPoi: { x: number; y: number; kind: 'treasure' | 'rest' | 'event'; used: boolean } | null = null;
  /** 图鉴进度 */
  private codex: CodexProgress = {
    blades: new Set(), enemies: new Set(), bosses: new Set(),
    totalKills: 0, bestLevel: 1, clashWins: 0,
  };
  /** 房间过渡保护（防止连续触发） */
  private transitionLock = 0;
  /** 死亡已存档标记 */
  private deathSaved = false;

  // ---- M9：性能缓存（装备聚合每帧多次遍历 → 脏标记缓存）----
  private gearCache: AggregatedStats = emptyStats();
  private gearDirty = true;

  /** 装备聚合（缓存版：背包/穿戴/强化变化时置脏） */
  private gear(): AggregatedStats {
    if (this.gearDirty) {
      this.gearCache = this.inventory.aggregate();
      this.gearDirty = false;
    }
    return this.gearCache;
  }

  /** M9 平衡：多刀伤害递减（平衡性分析 §6：第2刀 80%、第3刀 60%，防多刀暴击流过强） */
  private bladeDecayOf(blade?: BladeBody): number {
    if (!blade || this.playerBlades.length <= 1) return 1;
    return blade.index === 0 ? 1 : blade.index === 1 ? 0.8 : 0.6;
  }

  // ---- M8：Boss 与剧情 ----
  private boss: Boss | null = null;
  private dialog: Dialog | null = null;
  /** Boss 掉落刀具光点 */
  private bossBladeDrops: Array<{ bladeId: string; x: number; y: number }> = [];
  /** 剧情推进标记 */
  private storyFlags = { openingPlayed: false, midPlayed: false, preBossPlayed: false, postBossPlayed: false };
  /** 已收集刀具（id 列表，背包刀具槽循环切换） */
  private collectedBlades: string[] = [STARTER_BLADE_ID];
  /** 当前装备刀具索引 */
  private bladeIndex = 0;
  /** Boss 毒域区 */
  private zones: Array<{ x: number; y: number; r: number; time: number; dps: number }> = [];
  /** 对话暂停 */
  private pausedForDialog = false;

  constructor(
    private readonly loop: GameLoop,
    private readonly camera: Camera,
    private readonly renderSystem: RenderSystem,
    private readonly particles: ParticleSystem,
    private readonly damageNumbers: DamageNumbers,
  ) {
    this.player = new PlayerEntity(1);
    this.playerBlade = createBladeBody({
      owner: 'player',
      ownerId: 1,
      center: this.player.pos,
      quality: this.player.blade.quality,
      length: this.player.bladeLength,
      width: this.player.bladeWidth,
      omega: this.player.omega,
    });
  }

  // ============ M8：Boss / 剧情 / 刀具 ============

  /** Boss 对世界的动作回调 */
  private makeBossHooks(): BossHooks {
    return {
      damagePlayer: (amount, source, kind) => {
        const dmg = this.player.takeDamage(amount, source);
        if (dmg > 0) {
          this.damageNumbers.spawn(this.player.pos, dmg, 'player');
          this.renderSystem.flash('red', kind === 'wave' ? 0.3 : 0.25, 0.25);
          this.camera.shake(3, 0.2);
        }
      },
      spawnProjectile: (spec, pos, dir, ownerId) => {
        this.projectiles.push(new Projectile(spec, pos, dir, ownerId));
      },
      summonEnemy: (kind, pos, momentumRatio) => {
        if (kind === 'bloodmonk') {
          const spec = ENEMIES_BY_ID.get('bloodmonk')!;
          const e = new Enemy(
            spec,
            pos,
            this.progress.level,
            this.aiRng.fork(),
            () => this.idSeq++,
            this.makeEnemyHooks(),
          );
          this.enemies.push(e);
          this.engine.addTarget(e.target);
          for (const b of e.blades) this.engine.addBlade(b);
        } else {
          // 影分身：1 HP、50% 动量（借用寨刀手数据近似，HP 设 1）
          const spec = ENEMIES_BY_ID.get('raider')!;
          const e = new Enemy(
            spec,
            pos,
            this.progress.level,
            this.aiRng.fork(),
            () => this.idSeq++,
            this.makeEnemyHooks(),
          );
          (e as unknown as { hpMax: number }).hpMax = 1;
          (e as unknown as { hp: number }).hp = 1;
          this.enemies.push(e);
          this.engine.addTarget(e.target);
          for (const b of e.blades) {
            this.engine.addBlade(b);
            b.omega *= momentumRatio;
          }
        }
      },
      spawnZone: (pos, radius, duration, dps) => {
        this.zones.push({ x: pos.x, y: pos.y, r: radius, time: duration, dps });
      },
      onStageChange: (stage) => {
        this.renderSystem.flash('white', 0.5, 0.4);
        this.camera.shake(6, 0.35);
        // 阶段台词（天绝）
        const story = chapterOf(this.progress.level);
        const line = story?.bossStageLines?.[stage];
        if (line && this.dialog && !this.pausedForDialog) {
          this.pausedForDialog = true;
          this.dialog.play(line, () => {
            this.pausedForDialog = false;
          });
        }
      },
      fx: (kind, pos) => {
        if (kind === 'slam') {
          this.camera.shake(6, 0.3);
          this.particles.kill(pos);
        } else if (kind === 'storm') {
          this.camera.shake(8, 0.5);
          this.renderSystem.flash('white', 0.3, 0.3);
        } else if (kind === 'rain') {
          this.renderSystem.flash('gold', 0.3, 0.3);
        }
      },
    };
  }

  /** 播放剧情段落（对话期间暂停） */
  private playStory(section: 'opening' | 'midProgress' | 'postBoss' | 'ending' | 'endingA' | 'endingB'): void {
    const story = chapterOf(this.progress.level);
    if (!story || !this.dialog) return;
    let lines: readonly DialogLine[] =
      story[section === 'endingA' || section === 'endingB' ? 'ending' : section] ?? [];
    if (section === 'endingA') lines = ENDINGS.A;
    if (section === 'endingB') lines = ENDINGS.B;
    if (!lines || lines.length === 0) return;
    this.pausedForDialog = true;
    this.dialog.play(lines, () => {
      this.pausedForDialog = false;
    });
  }

  /** 换装刀具（背包刀具槽循环切换） */
  private switchBlade(): void {
    if (this.collectedBlades.length <= 1) return;
    this.bladeIndex = (this.bladeIndex + 1) % this.collectedBlades.length;
    this.equipBlade(this.collectedBlades[this.bladeIndex]!);
  }

  /** 应用刀具数据到玩家 */
  private equipBlade(bladeId: string): void {
    const data = BLADES_BY_ID.get(bladeId);
    if (!data) return;
    this.player.blade = {
      name: data.name,
      quality: data.quality,
      baseDamage: data.baseDamage,
      length: data.length,
      width: data.width,
      speedMod: data.speedMod,
    };
    this.codex.blades.add(bladeId);
    this.renderSystem.flash('gold', 0.25, 0.2);
  }

  /** Boss 击败结算（对话 + 掉刀 + 通关） */
  private onBossDefeated(): void {
    const bossSpec = this.boss!.spec;
    const story = chapterOf(this.progress.level);
    // Boss 掉刀具光点（剧情刀）
    for (const bladeId of bossSpec.rewardBlades) {
      if (!this.collectedBlades.includes(bladeId)) {
        this.collectedBlades.push(bladeId);
      }
      this.drops.push({
        item: this.gearGen.generateWithQuality('accessory', this.progress.level, 'purple', this.aiRng),
        x: this.boss!.pos.x + 60,
        y: this.boss!.pos.y,
        glow: 0,
      });
    }
    // Boss 掉落刀具光点（专用渲染：刀形光点由 drops 统一，拾取即收集）
    this.bossBladeDrops.push({ bladeId: bossSpec.rewardBlades[0]!, x: this.boss!.pos.x - 60, y: this.boss!.pos.y });
    // 移除 Boss 刀体
    for (const b of this.boss!.blades) this.engine.removeBlade(b);
    this.engine.removeTarget(this.boss!.target);

    // 战后对话 → 开门
    const openDoor = () => {
      this.doorOpen = true;
      this.renderSystem.flash('gold', 0.3, 0.4);
    };
    if (story && !this.storyFlags.postBossPlayed && this.dialog) {
      this.storyFlags.postBossPlayed = true;
      this.pausedForDialog = true;
      this.dialog.play(story.postBoss, () => {
        this.pausedForDialog = false;
        openDoor();
      });
    } else {
      openDoor();
    }
  }

  /** 关卡通关（M8 版：Boss 击败后过门触发，含结局） */
  private onLevelClearM8(): void {
    const lv = this.progress.level;
    const reward = this.progress.levelClearReward(lv);
    this.player.addKillExp(reward.exp);
    this.inventory.scrap += reward.scrap;

    if (lv >= 6) {
      // 第 6 关通关 → 双结局
      this.codex.bestLevel = Math.max(this.codex.bestLevel, 6);
      const hasStarter = this.collectedBlades[this.bladeIndex] === STARTER_BLADE_ID;
      this.hud.victory = true;
      SaveLoad.save(this.codex, null);
      // 战后 → 结局链式播放
      const story = chapterOf(6);
      const ending = hasStarter ? ENDINGS.B : ENDINGS.A;
      if (story && this.dialog) {
        this.pausedForDialog = true;
        this.dialog.play([...story.postBoss, ...ending], () => {
          this.pausedForDialog = false;
          // 觉醒结局：铁匠刀升华为藏锋·无名
          if (hasStarter) {
            this.collectedBlades.push('cangfeng');
            this.bladeIndex = this.collectedBlades.length - 1;
            this.equipBlade('cangfeng');
          }
        });
      }
      return;
    }
    // 非终关：结尾对话 → 下一关
    const advance = () => {
      this.progress.advanceLevel();
      this.plan = this.levelGen.generate(this.progress.level);
      this.storyFlags = { openingPlayed: false, midPlayed: false, preBossPlayed: false, postBossPlayed: false };
      this.enterRoom(0);
      this.playStory('opening');
    };
    const story = chapterOf(lv);
    if (story && this.dialog) {
      this.pausedForDialog = true;
      this.dialog.play(story.ending, () => {
        this.pausedForDialog = false;
        advance();
      });
    } else {
      advance();
    }
  }

  private updateBossAndZones(dt: number): void {
    // Boss tick
    if (this.boss) {
      this.boss.tick(dt, this.player.pos, DEFAULT_WORLD_W, DEFAULT_WORLD_H);
      for (const b of this.boss.blades) {
        if (b.active && this.boss.alive) {
          advanceBlade(b, dt);
          this.trailOf(b).push(b.angle);
        }
      }
      if (!this.boss.alive) {
        this.onBossDefeated();
        this.boss = null;
      }
    }
    // 毒域
    for (const z of this.zones) {
      z.time -= dt;
      const d = Math.hypot(this.player.pos.x - z.x, this.player.pos.y - z.y);
      if (d < z.r) {
        this.player.takeDamage(Math.max(1, Math.round(z.dps * dt)), '毒域');
      }
    }
    this.zones = this.zones.filter((z) => z.time > 0);
    // Boss 刀具光点拾取（拾取即装备并同步索引）
    for (const d of this.bossBladeDrops) {
      const dist = Math.hypot(this.player.pos.x - d.x, this.player.pos.y - d.y);
      if (dist < 40) {
        this.equipBlade(d.bladeId);
        const idx = this.collectedBlades.indexOf(d.bladeId);
        if (idx >= 0) this.bladeIndex = idx;
        d.x = -9999;
      }
    }
    this.bossBladeDrops = this.bossBladeDrops.filter((d) => d.x > -999);
  }

  /** 敌人对世界的动作回调（EnemyHooks 落地） */
  private makeEnemyHooks(): EnemyHooks {
    return {
      damagePlayer: (amount, source, kind) => {
        const dmg = this.player.takeDamage(amount, source);
        if (dmg > 0) {
          this.damageNumbers.spawn(this.player.pos, dmg, 'player');
          this.renderSystem.flash('red', kind === 'explosion' ? 0.4 : 0.25, 0.25);
          this.camera.shake(kind === 'explosion' ? 5 : 3, 0.2);
        }
      },
      spawnProjectile: (spec, pos, dir, ownerId) => {
        this.projectiles.push(new Projectile(spec, pos, dir, ownerId));
      },
      onExplode: (pos, radius) => {
        this.particles.kill(pos);
        this.particles.emit(pos, 14, {
          color: '#e8763a',
          type: 'spark',
          speedMin: 150,
          speedMax: 380,
          lifeMin: 0.2,
          lifeMax: 0.5,
          sizeMin: 2,
          sizeMax: 5,
        });
        void radius;
      },
    };
  }

  enter(ctx: GameContext): void {
    ctx.world = { width: DEFAULT_WORLD_W, height: DEFAULT_WORLD_H };
    ctx.player = this.player;
    this.camera.resizeWorld(DEFAULT_WORLD_W, DEFAULT_WORLD_H);
    this.camera.snapTo(this.player.pos);

    // 玩家事件：升级触发（升级曲线 §8：刀法弹面板暂停，刀具自动升级仅提示）
    this.player.onLevelUp = (line, lv) => {
      this.particles.levelUp(this.player.pos);
      if (line === 'tech') {
        this.pendingUpgrades.push(lv);
      }
    };
    this.player.onDeath = () => {
      this.hud.showDeathOverlay = true;
    };

    // 碰撞引擎
    this.aiRng = ctx.rng.fork();
    this.engine = new CollisionEngine(
      DEFAULT_WORLD_W,
      DEFAULT_WORLD_H,
      120,
      ctx.rng.fork(),
    );
    this.gearGen = new EquipmentGenerator(ctx.rng.fork());

    // M7：Rogue 流程（生成器 + 图鉴读档 + 第一关生成）
    this.levelGen = new LevelGenerator(ctx.rng.fork());
    const saved = SaveLoad.load();
    this.codex = saved.codex;
    this.plan = this.levelGen.generate(this.progress.level);
    this.enterRoom(0);

    // M6：DOM UI 初始化（升级面板/背包）；M8：对话
    injectUpgradePanelStyles();
    injectInventoryStyles();
    injectDialogStyles();
    const overlay = document.getElementById('ui-overlay');
    if (overlay) {
      this.upgradePanel ??= new UpgradePanel(overlay);
      this.inventoryPanel ??= new InventoryPanel(
        overlay,
        this.inventory,
        () => this.player.blade.name,
        () => this.switchBlade(),
      );
      this.dialog ??= new Dialog(overlay);
    }
    // 剧情标记重置 + 开场对话
    this.storyFlags = { openingPlayed: false, midPlayed: false, preBossPlayed: false, postBossPlayed: false };
    this.zones = [];
    this.playStory('opening');
    if (overlay) {
      // 背包按钮（右下角常驻，点击开关背包；点击后 blur 防空格键误触发）
      this.invToggleBtn?.remove();
      const btn = document.createElement('button');
      btn.className = 'inv-toggle-btn';
      btn.type = 'button';
      btn.textContent = '行囊 [B]';
      btn.addEventListener('click', () => {
        this.toggleInventory();
        btn.blur();
      });
      overlay.appendChild(btn);
      this.invToggleBtn = btn;
    }
    this.engine.setListener({
      onBladeHitEnemy: (blade, target, hitPoint) => {
        if (blade.owner === 'player') {
          this.onPlayerHit(target, hitPoint, blade);
        } else {
          this.onEnemyBladeHitPlayer(blade, target, hitPoint);
        }
      },
      onBladeClash: (pb, fb, hitPoint, result) => {
        this.onClash(pb, fb, hitPoint, result);
      },
    });

    // 注册玩家刀体 + 玩家本体目标
    this.playerBlade = this.engine.addBlade(
      createBladeBody({
        owner: 'player',
        ownerId: 1,
        center: this.player.pos,
        quality: this.player.blade.quality,
        length: this.player.bladeLength,
        width: this.player.bladeWidth,
        omega: this.player.omega,
      }),
    );
    this.playerTrail.clear();
    this.trails.clear();
    this.playerBlade.quality = this.player.blade.quality;
    // 重置多刀与升级状态
    for (const b of this.playerBlades.slice(1)) this.engine.removeBlade(b);
    this.playerBlades = [this.playerBlade];
    this.takenOptions.clear();
    this.mods = createEmptyMods();
    this.pendingUpgrades = [];
    this.pausedForUpgrade = false;
    this.pausedForInventory = false;
    this.reverseEdgeOn = false;
    this.reverseCd = 0;
    this.clashWinStreak = 0;
    this.drops = [];
    this.critChance = CRIT_CHANCE;

    this.engine.addTarget({
      id: 1,
      pos: this.player.pos,
      r: PLAYER_R,
      hittable: true,
      faction: 'player',
    });

    this.hud.kills = 0;
    this.hud.showDeathOverlay = false;
    this.hud.victory = false;
    this.combo.reset();
    this.hitstop = 0;
    this.deathSaved = false;
    this.enemies = [];
    this.projectiles = [];

    // 渲染层
    this.registerRenderLayers();
  }

  exit(ctx: GameContext): void {
    ctx.player = null;
    this.engine.clearAll();
    this.particles.clear();
    this.damageNumbers.clear();
    this.playerTrail.clear();
    this.trails.clear();
    this.projectiles = [];
    // 清理背包 DOM（按钮移除、面板隐藏、暂停标志复位）
    this.invToggleBtn?.remove();
    this.invToggleBtn = null;
    this.inventoryPanel?.hide();
    this.pausedForInventory = false;
  }

  update(dt: number, ctx: GameContext): void {
    // 背包开关（B 键 toggle，统一在此处理；置于暂停早退之前，确保背包打开期间仍能关闭）
    if (ctx.input.isPressed('KeyB')) {
      this.toggleInventory();
    }

    // 升级/背包/对话暂停（面板期间冻结战斗，UI 由 DOM 层驱动）
    if (this.pausedForUpgrade || this.pausedForInventory || this.pausedForDialog) {
      this.camera.update(dt);
      this.particles.update(dt);
      this.damageNumbers.update(dt);
      this.renderSystem.update(dt);
      this.dialog?.tick();
      return;
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return; // hitstop 冻结物理
    }

    // 升级排队处理（每次弹一个面板）
    if (this.pendingUpgrades.length > 0 && !this.upgradePanel?.visible) {
      this.openUpgradePanel(this.pendingUpgrades.shift()!);
    }

    // 逆刃冷却
    if (this.reverseCd > 0) this.reverseCd = Math.max(0, this.reverseCd - dt);

    // 逆刃切换（空格键，M6 确认；解锁需 mods.reverseEdge，CD 8s）
    if (ctx.input.isPressed('Space') && this.mods.reverseEdge && this.reverseCd <= 0) {
      this.reverseEdgeOn = !this.reverseEdgeOn;
      this.reverseCd = 8;
      this.playerBlade.omega *= -1; // 反转旋转
      this.renderSystem.flash('gold', 0.2, 0.15);
    }

    this.hud.tick(dt);
    // HUD 信息同步（M7）
    this.hud.gold = this.progress.gold;
    const roomTotal = this.plan?.rooms.length ?? 0;
    this.hud.levelInfo = `第${this.progress.level}关 ${this.progress.levelName} · 房间 ${this.progress.roomIndex + 1}/${roomTotal}`;

    // 玩家状态与移动
    this.player.tick(dt);
    this.player.move(ctx.input.getAxis(), dt, ctx.world.width, ctx.world.height, PLAYER_R);

    // 玩家刀体参数同步（等级成长 + 升级修正 + 装备词条实时生效，M9 缓存）
    const gear = this.gear();
    const omegaMod = this.player.omega * (1 + this.mods.spinSpeed + gear.spinSpeed);
    const lenMod = this.player.bladeLength * (1 + this.mods.radius + gear.radius + gear.bladeLen);
    const widMod = this.player.bladeWidth * (1 + gear.bladeWid);
    for (const b of this.playerBlades) {
      b.center.x = this.player.pos.x;
      b.center.y = this.player.pos.y;
      // 逆刃反转后的基础方向（reverseEdgeOn 时 omega 取负）
      const dirSign = this.reverseEdgeOn ? -1 : 1;
      b.omega = dirSign * omegaMod;
      b.length = lenMod;
      b.width = widMod;
      b.active = this.player.alive && this.player.stun <= 0;
      advanceBlade(b, dt);
      this.trailOf(b).push(b.angle);
    }

    // 敌人（完整 AI）
    for (const e of this.enemies) {
      e.tick(dt, this.player.pos, ctx.world.width, ctx.world.height);
      for (const b of e.blades) {
        if (b.active && e.alive) {
          advanceBlade(b, dt);
          this.trailOf(b).push(b.angle);
        }
      }
    }

    // 弹道更新与结算
    this.updateProjectiles(dt);

    // Boss / 毒域 / Boss 掉刀
    this.updateBossAndZones(dt);

    // 对话逐字打印
    this.dialog?.tick();

    // 装备掉落光点更新与拾取
    this.updateDrops(dt);

    // 连击窗口时钟
    this.combo.tick(dt);

    // 碰撞步进（M6：逆刃相向修正 + 破刀诀天赋；M8：Boss 拼刀窗口 +0.15）
    this.engine.step(dt, {
      counterRotation: this.reverseEdgeOn,
      foeCombo: false,
      hasBreakTalent: this.player.hasBreakTalent,
      /** Boss 技能前摇拼刀窗口（Boss设计 §3.2：胜率 +0.15） */
      bossWindow: this.boss?.clashWindow ?? false,
    });

    // 相机 / 粒子 / 数字
    this.camera.follow(this.player.pos, dt);
    this.camera.update(dt);
    this.particles.update(dt);
    this.damageNumbers.update(dt);
    this.renderSystem.update(dt);

    // 房间流程推进（波次/开门/过关）+ POI 交互
    this.updateRoomFlow(dt);
    this.updatePoi(ctx);

    // 死亡存档（一次性）
    if (!this.player.alive && !this.deathSaved) {
      this.deathSaved = true;
      this.onPlayerDeathSave();
    }
  }

  // ============ M6：升级/装备系统 ============

  /** 打开三选一面板（升级曲线 §8：暂停 + 选择后 1s 无敌） */
  private openUpgradePanel(newLv: number): void {
    if (!this.upgradePanel) return;
    const options = this.picker.pick(
      { newTechLv: newLv, taken: this.takenOptions },
      this.aiRng,
    );
    if (options.length === 0) return;
    this.pausedForUpgrade = true;
    this.upgradePanel.show(options, this.takenOptions, (i) => {
      const opt = options[i];
      if (opt) {
        this.takenOptions.set(opt.id, (this.takenOptions.get(opt.id) ?? 0) + 1);
        applyOption(this.mods, opt.id);
        if (opt.id === 'breakBladeArt') this.player.hasBreakTalent = true;
      }
      this.upgradePanel?.hide();
      this.pausedForUpgrade = false;
      // 选择后 1s 无敌（升级曲线 §8）
      this.player.iframes = Math.max(this.player.iframes, 1.0);
      // 立即重算战斗参数（转速/半径/多刀/暴击等）
      this.applyModsToCombat();
    });
  }

  /** 升级修正 + 装备词条聚合 → 战斗参数 */
  private applyModsToCombat(): void {
    const gear = this.inventory.aggregate();
    this.critChance = gear.critRate;

    // 玩家刀体多刀（mods.extraBlades + gear.extraBlade，上限 4：转刀机制 §3.1）
    const wantBlades = 1 + Math.min(3, this.mods.extraBlades + gear.extraBlade);
    while (this.playerBlades.length < wantBlades) {
      const b = this.engine.addBlade(
        createBladeBody({
          owner: 'player',
          ownerId: 1,
          center: this.player.pos,
          quality: this.player.blade.quality,
          length: this.player.bladeLength,
          width: this.player.bladeWidth,
          omega: this.player.omega,
          index: this.playerBlades.length,
        }),
      );
      b.angle = (b.index * Math.PI * 2) / wantBlades;
      this.playerBlades.push(b);
    }
  }

  /** 装备掉落判定（M6 简易掉落：持刀怪 12% / 精英 35%；等级=关卡1） */
  private maybeDropEquipment(enemy: Enemy): void {
    const chance = enemy.spec.kind === 'elite' ? 0.35 : enemy.spec.blade ? 0.12 : 0.03;
    if (!this.aiRng.chance(chance)) return;
    const parts = ['armor', 'accessory', 'tome'] as const;
    const part = parts[this.aiRng.nextInt(0, 2)]!;
    const item = this.gearGen.generate(part, 1, this.aiRng);
    this.drops.push({ item, x: enemy.pos.x, y: enemy.pos.y, glow: 0 });
  }

  /** 装备光点更新与拾取（靠近自动入包） */
  private updateDrops(dt: number): void {
    for (const d of this.drops) {
      d.glow += dt * 3;
      const dist = Math.hypot(this.player.pos.x - d.x, this.player.pos.y - d.y);
      if (dist < 40) {
        if (this.inventory.addItem(d.item)) {
          d.x = -9999; // 标记已拾取
        }
      }
    }
    this.drops = this.drops.filter((d) => d.x > -999);
  }

  /** 背包开关（B 键与 HUD 背包按钮共用入口；升级三选一期间不响应，避免双面板重叠） */
  private toggleInventory(): void {
    if (!this.inventoryPanel || this.pausedForUpgrade) return;
    if (this.inventoryPanel.visible) {
      this.inventoryPanel.hide();
      this.pausedForInventory = false;
      this.gearDirty = true; // M9：背包变化置脏
      this.applyModsToCombat(); // 穿戴变化立即生效
    } else {
      this.inventoryPanel.show();
      this.pausedForInventory = true;
    }
  }

  /** 背包关闭钩子（保留 API：外部队列需要时手动恢复） */
  private inventoryPanelRefreshHook(): void {
    this.pausedForInventory = this.inventoryPanel?.visible ?? false;
  }

  /** 弹道更新：飞行 + 与玩家/玩家刀体交互 */
  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      p.update(dt);
      if (!p.active) continue;

      // 命中玩家（圆判定）
      const dx = this.player.pos.x - p.pos.x;
      const dy = this.player.pos.y - p.pos.y;
      const hitR = p.radius + PLAYER_R;
      if (this.player.alive && dx * dx + dy * dy <= hitR * hitR) {
        const dmg = this.player.takeDamage(p.spec.damage, '弹幕');
        if (dmg > 0) {
          this.damageNumbers.spawn(this.player.pos, dmg, 'player');
          this.renderSystem.flash('red', 0.25, 0.25);
          if (p.spec.slow) {
            // 毒镖减速（毒镖手：命中减速 30%/2s）
            this.player.slowTime = Math.max(this.player.slowTime, p.spec.slow.duration);
            this.player.slowRatio = p.spec.slow.ratio;
          }
          p.active = false;
        } else if (this.player.iframes > 0) {
          p.active = false; // 无敌帧内弹体消散
        }
        continue;
      }

      // 与玩家刀体交互（扫掠击碎 / 飞刀瞬时拼刀 70%）
      const swept = bladeHitsCircle(this.playerBlade, { c: p.pos, r: p.radius });
      const interact = p.interactWithPlayerBlade(this.playerBlade, swept, this.aiRng);
      if (interact === 'crushed' || interact === 'clashWin') {
        this.particles.hit(p.pos, this.playerBlade.angle);
        this.hud.clashCount++; // 拦截计入拼刀计数（clashWin 路径）
        if (interact === 'clashWin') {
          this.player.addTechExp(25); // 瞬时拼刀同样给拼刀经验
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.active);
  }

  // ============ 战斗结算 ============

  private onPlayerHit(target: { id: number; pos: Vec2 }, hitPoint: Vec2, blade?: BladeBody): void {
    // Boss 受击路径
    if (this.boss && this.boss.target.id === target.id) {
      this.onPlayerHitBoss(hitPoint, blade);
      return;
    }
    const enemy = this.enemies.find((e) => e.target.id === target.id);
    if (!enemy || !enemy.alive) return;
    const gear = this.gear();

    const combo = this.combo.register(target.id, this.player.comboCap + this.mods.comboCapBonus);
    this.hud.setCombo(combo);

    const crit = this.critChance > 0 && this.aiRng.chance(this.critChance);
    // 连击伤害加成（怒涛连斩 +0.1/层叠加到基础连击倍率）与暴起/狂战/装备 + 多刀递减（M9）
    const comboDmgBonus =
      (COMBO_MULTIPLIER[Math.min(combo, 5) - 1]! + this.mods.comboDamageBonus + gear.comboDamage) *
      (combo >= 3 ? 1 + this.mods.surgeDamage : 1) *
      (this.player.hp / this.player.hpMax < 0.4 ? 1 + this.mods.berserkDamage : 1) *
      this.bladeDecayOf(blade);
    const dmg = computeHitDamage({
      bladeBaseDamage: this.player.blade.baseDamage,
      bladeLevelBonus: this.player.bladeLevelDamageBonus,
      gearAtkBonus: gear.atk,
      techniqueFactor: this.player.techFactor,
      combo,
      crit,
      critMultiplier: 1.5 + gear.critDamage,
      enemyDef: enemy.spec.def,
      targetBrokenGuard: enemy.brokenGuard > 0,
      momentumBuff: this.player.momentumBuffTime > 0,
      comboMultiplierOverride: comboDmgBonus,
    });

    // 击退方向：命中点切线方向（伤害公式.md §5）
    const dir = normalize(sub(hitPoint, this.player.pos));
    const kb = computeKnockback(
      combo,
      this.player.bladeLevelKnockbackBonus + this.mods.knockback + gear.knockback,
    );
    const died = enemy.applyHit(dmg, dir, kb);

    // 反馈
    this.damageNumbers.spawn(
      enemy.pos,
      dmg,
      enemy.brokenGuard > 0 ? 'breakGuard' : crit ? 'crit' : 'normal',
    );
    this.particles.hit(hitPoint, this.playerBlade.angle);
    this.camera.shake(1, 0.08);
    this.hitstop = died ? HITSTOP_KILL : HITSTOP_NORMAL;

    if (died) {
      this.hud.kills++;
      this.codex.totalKills++;
      this.combo.clear(target.id);
      this.particles.kill(enemy.pos);
      this.camera.shake(3, 0.2);
      // 击杀经验双线同计（升级曲线与经验.md §3，M4 修正；EXP 随关卡 ×(1+0.1(关-1))）
      this.player.addKillExp(
        Math.round(enemy.spec.exp * (1 + 0.1 * (this.progress.level - 1))),
      );
      // 击杀回复（词条/套装噬血2件）
      if (gear.killHeal > 0) this.player.heal(Math.round(this.player.hpMax * gear.killHeal));
      // 金币掉落（属性总表 §5 goldDrop）
      this.progress.addGold(
        this.aiRng.nextInt(enemy.spec.goldDrop[0], enemy.spec.goldDrop[1]),
      );
      // 碎片掉落（刀具强化 §5：小怪 1-3）
      if (enemy.spec.scrapDrop[1] > 0) {
        this.inventory.scrap += this.aiRng.nextInt(
          enemy.spec.scrapDrop[0],
          enemy.spec.scrapDrop[1],
        );
      }
      // 移除敌人刀体（尸体保留到波次清理）
      for (const b of enemy.blades) this.engine.removeBlade(b);
      // 装备掉落（M6 简易掉落验证）
      this.maybeDropEquipment(enemy);
    }
  }

  private onEnemyBladeHitPlayer(
    blade: BladeBody,
    _target: { id: number },
    _hitPoint: Vec2,
  ): void {
    // Boss 刀体命中玩家
    if (this.boss && this.boss.blades.includes(blade)) {
      const dmg = this.player.takeDamage(Math.round(this.boss.damageOf(0)), this.boss.spec.name);
      if (dmg > 0) {
        this.damageNumbers.spawn(this.player.pos, dmg, 'player');
        this.renderSystem.flash('red', 0.25, 0.25);
        this.camera.shake(3, 0.2);
      }
      return;
    }
    // 敌方刀体命中玩家（blade.ownerId 即敌人 id）
    const enemy = this.enemies.find((e) => e.blades.includes(blade));
    if (!enemy || !enemy.alive) return;
    const dmg = this.player.takeDamage(enemy.damage, enemy.spec.name);
    if (dmg > 0) {
      this.damageNumbers.spawn(this.player.pos, dmg, 'player');
      this.renderSystem.flash('red', 0.25, 0.25);
      this.camera.shake(3, 0.2);
    }
  }

  /** 玩家刀体命中 Boss */
  private onPlayerHitBoss(hitPoint: Vec2, blade?: BladeBody): void {
    const boss = this.boss!;
    if (!boss.alive) return;
    const gear = this.gear();
    const combo = this.combo.register(boss.target.id, this.player.comboCap + this.mods.comboCapBonus);
    this.hud.setCombo(combo);
    const crit = this.critChance > 0 && this.aiRng.chance(this.critChance);
    const comboDmgBonus =
      (COMBO_MULTIPLIER[Math.min(combo, 5) - 1]! + this.mods.comboDamageBonus + gear.comboDamage) *
      (combo >= 3 ? 1 + this.mods.surgeDamage : 1);
    // Boss 破防窗口受伤 +100%（天绝阶段 4 连拼 3 次触发）
    const vulnerableMult = boss.vulnerable ? 2 : 1;
    // M9 平衡：多刀伤害递减（平衡性分析 §6 预案：第2刀 80%、第3刀 60%）
    const bladeDecay = this.bladeDecayOf(blade);
    const dmg = computeHitDamage({
      bladeBaseDamage: this.player.blade.baseDamage,
      bladeLevelBonus: this.player.bladeLevelDamageBonus,
      gearAtkBonus: gear.atk,
      techniqueFactor: this.player.techFactor,
      combo,
      crit,
      critMultiplier: 1.5 + gear.critDamage,
      enemyDef: 8,
      targetBrokenGuard: boss.brokenGuard > 0,
      momentumBuff: this.player.momentumBuffTime > 0,
      comboMultiplierOverride: comboDmgBonus * vulnerableMult * bladeDecay,
    });
    const dir = normalize(sub(hitPoint, this.player.pos));
    const died = boss.applyHit(dmg, dir, 0);
    this.damageNumbers.spawn(
      boss.pos,
      dmg,
      boss.vulnerable ? 'breakGuard' : crit ? 'crit' : 'normal',
    );
    this.particles.hit(hitPoint, this.playerBlade.angle);
    this.camera.shake(1, 0.08);
    this.hitstop = died ? HITSTOP_KILL : HITSTOP_NORMAL;
    if (died) {
      this.hud.kills++;
      this.codex.totalKills++;
      this.player.addKillExp(Math.round(8 * 15 * (1 + 0.1 * (this.progress.level - 1)))); // Boss EXP = 小怪×15
      this.combo.clear(boss.target.id);
      this.particles.kill(boss.pos);
      this.camera.shake(5, 0.35);
    }
  }

  private onClash(
    pb: BladeBody,
    fb: BladeBody,
    hitPoint: Vec2,
    result: { outcome: string; winRate: number; stunPlayer: number; stunFoe: number; disablePlayerBlade: number; disableFoeBlade: number; clashDamage: number },
  ): void {
    this.hitstop = HITSTOP_CLASH;
    this.hud.clashCount++;
    this.particles.clash(hitPoint);
    this.renderSystem.flash('white', 0.45, 0.18);
    this.camera.shake(5, 0.25);

    const gear = this.gear();
    const enemy = this.enemies.find((e) => e.blades.includes(fb));
    const boss = this.boss && this.boss.blades.includes(fb) ? this.boss : null;
    void pb;

    // 应用结果
    if (result.stunPlayer > 0) this.player.stun = Math.max(this.player.stun, result.stunPlayer);
    if (result.disablePlayerBlade > 0) {
      for (const b of this.playerBlades) b.active = false;
      this.player.stun = Math.max(this.player.stun, result.disablePlayerBlade);
    }
    // Boss 拼刀结果：打断技能 + 僵直 + 刀光雨计数
    if (boss) {
      if (result.stunFoe > 0) boss.stun = Math.max(boss.stun, result.stunFoe);
      if (result.disableFoeBlade > 0) boss.bladeDisabled = Math.max(boss.bladeDisabled, result.disableFoeBlade);
      if (result.outcome === 'win' || result.outcome === 'break') {
        boss.brokenGuard = 1.5;
        boss.interruptByClash(); // 拼刀打断冲锋/重击（Boss设计 §4.1/§4.3）
        const clashDmg = result.clashDamage > 0
          ? Math.round(result.clashDamage * (1 + gear.clashDamage))
          : 0;
        if (clashDmg > 0) {
          boss.applyHit(clashDmg, vec2(0, 0), 0);
          this.damageNumbers.spawn(boss.pos, clashDmg, 'breakGuard');
        }
        // 天绝阶段 4：刀光雨连拼 3 次破防
        if (boss.spec.id === 'tianjue' && boss.stage === 4) {
          boss.registerRainClash();
        }
      }
    }
    if (enemy) {
      if (result.stunFoe > 0) enemy.stun = Math.max(enemy.stun, result.stunFoe);
      if (result.disableFoeBlade > 0) enemy.bladeDisabled = Math.max(enemy.bladeDisabled, result.disableFoeBlade);
      if (result.outcome === 'win' || result.outcome === 'break') {
        enemy.brokenGuard = 1.5; // 破势窗口（拼刀机制.md §7：敌僵直期间 ×1.5）
        // 破刀拼刀伤害（带装备拼刀伤害加成）
        const clashDmg = result.clashDamage > 0
          ? Math.round(result.clashDamage * (1 + gear.clashDamage))
          : 0;
        if (clashDmg > 0) {
          enemy.applyHit(clashDmg, vec2(0, 0), 0);
          this.damageNumbers.spawn(enemy.pos, clashDmg, 'breakGuard');
        }
        // 拼刀胜回复（破镜重圆特效/装备词条）
        if (gear.clashWinRate >= 0 || true) {
          // clashHeal 特效由刀具 tag 提供（M6 简化：破镜重圆装备时词条等效）
        }
      }
    }

    // 连胜计数 → 刀势如虹（连续 3 次胜；M9：破军 4 件阈值减半连 2 次即触发——套装与词条 §3.5）
    if (result.outcome === 'win' || result.outcome === 'break') {
      this.hud.clashWins++;
      this.clashWinStreak++;
      const warlord4 = this.gear().activeSets.some((s) => s.set === 'warlord' && s.pieces === 4);
      const threshold = warlord4 ? 2 : 3;
      if (this.mods.bladeAura && this.clashWinStreak >= threshold) {
        this.player.momentumBuffTime = 8; // 刀势如虹 8s
        this.clashWinStreak = 0;
        this.particles.levelUp(this.player.pos);
        this.renderSystem.flash('gold', 0.35, 0.3);
      }
    } else {
      this.clashWinStreak = 0;
    }

    // 拼刀经验 +25（拼刀机制.md §7，只入刀法线）
    this.player.addTechExp(25);
    if (result.outcome === 'break') {
      this.particles.bladeBreak(hitPoint);
      this.camera.shake(8, 0.3);
      // M9 打磨：破刀慢镜头（渲染管线.md §5：破刀 8px + 慢镜头 0.3s 全场暗化）
      this.hitstop = 0.3;
      this.renderSystem.flash('white', 0.8, 0.12);
      this.renderSystem.flash('black', 0.5, 0.3);
    }
  }

  // ============ 渲染 ============

  private registerRenderLayers(): void {
    const g2 = this;
    this.renderSystem.clearLayer(RenderLayer.Background);
    this.renderSystem.addLayer(RenderLayer.Background, (g) => g2.drawBackground(g));

    this.renderSystem.clearLayer(RenderLayer.Enemies);
    this.renderSystem.addLayer(RenderLayer.Enemies, (g) => {
      g2.drawEnemies(g);
      g2.drawBoss(g);
      // 毒域（紫色半透明圆）
      for (const z of g2.zones) {
        g.fillStyle = `rgba(122, 58, 142, ${Math.min(0.35, z.time * 0.2)})`;
        g.beginPath();
        g.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#9b6fd4';
        g.lineWidth = 2;
        g.stroke();
      }
      for (const p of g2.projectiles) p.draw(g);
      g2.drawPlayer(g);
    });

    this.renderSystem.clearLayer(RenderLayer.Blades);
    this.renderSystem.addLayer(RenderLayer.Blades, (g) => {
      const br = new BladeRenderer();
      for (const b of g2.playerBlades) br.drawBlade(g, b, g2.trailOf(b));
      for (const e of g2.enemies) {
        for (const b of e.blades) br.drawBlade(g, b, g2.trailOf(b));
      }
    });

    this.renderSystem.clearLayer(RenderLayer.Pickups);
    this.renderSystem.addLayer(RenderLayer.Pickups, (g) => {
      // 装备掉落光点（品质色呼吸光）
      for (const d of g2.drops) {
        const pulse = 0.6 + 0.4 * Math.sin(d.glow);
        const colors: Record<string, string> = {
          white: '221,221,221', green: '102,255,102', blue: '102,204,255',
          purple: '204,102,255', orange: '255,204,102',
        };
        const rgb = colors[d.item.quality] ?? '255,255,255';
        const grad = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, 16 + pulse * 6);
        grad.addColorStop(0, `rgba(${rgb},${(0.85 * pulse).toFixed(2)})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(d.x, d.y, 16 + pulse * 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgba(${rgb},0.95)`;
        g.save();
        g.translate(d.x, d.y);
        g.rotate(Math.PI / 4);
        g.fillRect(-4, -4, 8, 8);
        g.restore();
      }

      // 门（开启后金光门）
      if (g2.doorOpen) {
        const d = g2.doorPos;
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
        const grad = g.createLinearGradient(d.x, d.y - d.h / 2, d.x, d.y + d.h / 2);
        grad.addColorStop(0, `rgba(212,168,83,${0.25 * pulse})`);
        grad.addColorStop(0.5, `rgba(246,195,68,${0.5 * pulse})`);
        grad.addColorStop(1, `rgba(212,168,83,${0.25 * pulse})`);
        g.fillStyle = grad;
        g.fillRect(d.x, d.y - d.h / 2, d.w, d.h);
        g.strokeStyle = '#f6c344';
        g.lineWidth = 3;
        g.strokeRect(d.x, d.y - d.h / 2, d.w, d.h);
        // 门内箭头提示
        g.fillStyle = `rgba(245,237,224,${0.5 + 0.4 * pulse})`;
        g.beginPath();
        g.moveTo(d.x + 18, d.y - 14);
        g.lineTo(d.x + 42, d.y);
        g.lineTo(d.x + 18, d.y + 14);
        g.closePath();
        g.fill();
      } else {
        // 关闭的门（暗色栅栏）
        const d = g2.doorPos;
        g.fillStyle = '#242430';
        g.fillRect(d.x, d.y - d.h / 2, d.w, d.h);
        g.strokeStyle = '#3a3a48';
        g.lineWidth = 3;
        g.strokeRect(d.x, d.y - d.h / 2, d.w, d.h);
      }

      // Boss 掉落刀具光点（鎏金刀形）
      for (const bd of g2.bossBladeDrops) {
        const data = BLADES_BY_ID.get(bd.bladeId);
        if (!data) continue;
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 280);
        const grad = g.createRadialGradient(bd.x, bd.y, 0, bd.x, bd.y, 34);
        grad.addColorStop(0, `rgba(246,195,68,${(0.55 * pulse).toFixed(2)})`);
        grad.addColorStop(1, 'rgba(246,195,68,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(bd.x, bd.y, 34, 0, Math.PI * 2);
        g.fill();
        // 刀形（旋转微动）
        g.save();
        g.translate(bd.x, bd.y);
        g.rotate(Math.sin(performance.now() / 500) * 0.3);
        g.strokeStyle = '#f6c344';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-18, 0);
        g.lineTo(18, 0);
        g.stroke();
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-18, 0);
        g.lineTo(-26, 0);
        g.stroke();
        g.restore();
        // 名字标签
        g.font = '700 15px "Alimama ShuHeiTi", sans-serif';
        g.textAlign = 'center';
        g.fillStyle = '#f6c344';
        g.fillText(`【${data.name}】`, bd.x, bd.y + 48);
        g.textAlign = 'left';
      }

      // POI（宝箱/休息/事件）
      if (g2.roomPoi && !g2.roomPoi.used) {
        const p = g2.roomPoi;
        const label = p.kind === 'treasure' ? '宝箱' : p.kind === 'rest' ? '休息' : '事件';
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 400);
        const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
        grad.addColorStop(0, `rgba(246,195,68,${0.4 * pulse})`);
        grad.addColorStop(1, 'rgba(246,195,68,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(p.x, p.y, 30, 0, Math.PI * 2);
        g.fill();
        // 图标（宝箱方块/休息圆环/事件菱形）
        g.strokeStyle = '#f6c344';
        g.lineWidth = 3;
        if (p.kind === 'treasure') {
          g.fillStyle = '#8b7355';
          g.beginPath();
          g.roundRect(p.x - 16, p.y - 12, 32, 24, 4);
          g.fill();
          g.stroke();
        } else if (p.kind === 'rest') {
          g.beginPath();
          g.arc(p.x, p.y, 14, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = '#3ba272';
          g.beginPath();
          g.arc(p.x, p.y, 8, 0, Math.PI * 2);
          g.fill();
        } else {
          g.save();
          g.translate(p.x, p.y);
          g.rotate(Math.PI / 4);
          g.strokeRect(-10, -10, 20, 20);
          g.restore();
        }
        // 标签 + E 键提示
        g.font = '700 16px "Alimama ShuHeiTi", sans-serif';
        g.fillStyle = '#f5ede0';
        g.textAlign = 'center';
        g.fillText(`${label} [E]`, p.x, p.y - 34);
        g.textAlign = 'left';
      }

      // 商店商品
      for (const gd of g2.shopGoods) {
        if (gd.sold) continue;
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 350);
        const colors: Record<string, string> = {
          white: '221,221,221', green: '102,255,102', blue: '102,204,255',
          purple: '204,102,255', orange: '255,204,102',
        };
        const rgb = colors[gd.item.quality] ?? '255,255,255';
        // 光柱
        const grad = g.createLinearGradient(gd.x, gd.y - 60, gd.x, gd.y + 20);
        grad.addColorStop(0, `rgba(${rgb},0)`);
        grad.addColorStop(0.6, `rgba(${rgb},${0.25 * pulse})`);
        grad.addColorStop(1, `rgba(${rgb},0.05)`);
        g.fillStyle = grad;
        g.fillRect(gd.x - 26, gd.y - 60, 52, 80);
        // 物品核
        g.fillStyle = `rgba(${rgb},0.9)`;
        g.save();
        g.translate(gd.x, gd.y);
        g.rotate(Math.PI / 4);
        g.fillRect(-9, -9, 18, 18);
        g.restore();
        // 价签
        const affordable = g2.progress.gold >= gd.price;
        g.font = '700 16px "Alimama ShuHeiTi", sans-serif';
        g.textAlign = 'center';
        g.fillStyle = affordable ? '#f6c344' : '#66666f';
        g.fillText(`◈${gd.price}`, gd.x, gd.y + 40);
        g.font = '400 13px "Alimama ShuHeiTi", sans-serif';
        g.fillStyle = '#c9c2b4';
        g.fillText(gd.item.name, gd.x, gd.y + 60);
        g.fillText('[E] 购买', gd.x, gd.y - 46);
        g.textAlign = 'left';
      }
    });

    this.renderSystem.clearLayer(RenderLayer.Particles);
    this.renderSystem.addLayer(RenderLayer.Particles, (g) => g2.particles.draw(g));

    this.renderSystem.clearLayer(RenderLayer.UI);
    this.renderSystem.addLayer(RenderLayer.UI, (g) => {
      g2.damageNumbers.draw(g);
      g2.hud.draw(g, g2.player);
      g2.drawBossHpBar(g);
    });
  }

  private trailOf(blade: BladeBody): BladeTrail {
    const key = `${blade.owner}:${blade.ownerId}:${blade.index}`;
    let t = this.trails.get(key);
    if (!t) {
      t = new BladeTrail();
      this.trails.set(key, t);
    }
    return t;
  }

  private spawnWave(): void {
    this.hud.wave = this.wave;
    const hooks = this.makeEnemyHooks();
    for (const w of waveComposition(this.wave)) {
      const spec = ENEMIES_BY_ID.get(w.spec)!;
      const e = new Enemy(
        spec,
        vec2(w.x, w.y),
        1,
        this.aiRng.fork(),
        () => this.idSeq++,
        hooks,
      );
      this.enemies.push(e);
      this.engine.addTarget(e.target);
      for (const b of e.blades) this.engine.addBlade(b);
      this.waveSpawned++;
    }
  }

  // ============ M7：Rogue 房间流程 ============

  /** 进入指定房间（重置障碍/敌人/刀体注册/POI） */
  private enterRoom(index: number): void {
    this.transitionLock = 0.5;
    const room = this.plan.rooms[index]!;
    this.doorOpen = false;
    this.waveInRoom = 0;
    this.waveStarted = false;
    this.shopGoods = [];
    this.roomPoi = null;
    this.boss = null;
    this.zones = [];

    // 重置碰撞引擎（保留玩家刀体由后文重注册）
    for (const b of this.playerBlades.slice(1)) this.engine.removeBlade(b);
    this.engine.clearAll();
    this.playerBlades = [];
    this.enemies = [];
    this.projectiles = [];
    this.drops = [];
    this.particles.clear();
    this.damageNumbers.clear();
    this.trails.clear();

    // 玩家归位到房间左中
    this.player.pos.x = 200;
    this.player.pos.y = DEFAULT_WORLD_H / 2;
    this.camera.snapTo(this.player.pos);

    // 重新注册玩家本体与刀体
    this.engine.addTarget({
      id: 1,
      pos: this.player.pos,
      r: PLAYER_R,
      hittable: true,
      faction: 'player',
    });
    this.playerBlade = this.engine.addBlade(
      createBladeBody({
        owner: 'player',
        ownerId: 1,
        center: this.player.pos,
        quality: this.player.blade.quality,
        length: this.player.bladeLength,
        width: this.player.bladeWidth,
        omega: this.player.omega,
      }),
    );
    this.playerBlades = [this.playerBlade];
    this.applyModsToCombat();

    // 障碍
    for (const ob of room.obstacles) this.engine.addObstacle(ob);

    // 按房间类型初始化
    const cfg = LEVELS_BY_ID.get(this.progress.level)!;
    switch (room.kind) {
      case 'start':
        this.wavesTotalInRoom = 0;
        this.doorOpen = true; // 起始房无怪直接开门
        break;
      case 'battle':
        this.wavesTotalInRoom = this.aiRng.nextInt(2, 3);
        this.spawnRoomWave(room, cfg.spawnPool, 'mixed');
        break;
      case 'elite':
        this.wavesTotalInRoom = 1;
        this.spawnRoomWave(room, [cfg.elite ?? 'banditlord'], 'elite');
        break;
      case 'treasure':
        this.wavesTotalInRoom = 0;
        this.roomPoi = { x: room.poi!.x, y: room.poi!.y, kind: 'treasure', used: false };
        this.doorOpen = true;
        break;
      case 'shop':
        this.wavesTotalInRoom = 0;
        this.setupShop(room);
        this.doorOpen = true;
        break;
      case 'rest':
        this.wavesTotalInRoom = 0;
        this.roomPoi = { x: room.poi!.x, y: room.poi!.y, kind: 'rest', used: false };
        this.doorOpen = true;
        break;
      case 'event':
        this.wavesTotalInRoom = 0;
        this.roomPoi = { x: room.poi!.x, y: room.poi!.y, kind: 'event', used: false };
        this.doorOpen = true;
        break;
      case 'boss': {
        // M8：正式 Boss 战（战前对话 → Boss 登场）
        this.wavesTotalInRoom = 1;
        this.waveStarted = true;
        const bossSpec = BOSSES_BY_LEVEL.get(this.progress.level)!;
        const bossPos = vec2(DEFAULT_WORLD_W / 2, 400);
        const story = chapterOf(this.progress.level);
        const startFight = () => {
          if (!this.boss) {
            this.boss = new Boss(
              bossSpec,
              bossPos,
              this.progress.level,
              this.aiRng.fork(),
              () => this.idSeq++,
              this.makeBossHooks(),
            );
            this.engine.addTarget(this.boss.target);
            for (const b of this.boss.blades) this.engine.addBlade(b);
            this.codex.bosses.add(bossSpec.id);
          }
        };
        if (story && !this.storyFlags.preBossPlayed && this.dialog) {
          this.storyFlags.preBossPlayed = true;
          this.pausedForDialog = true;
          this.dialog.play(story.preBoss, () => {
            this.pausedForDialog = false;
            startFight();
          });
        } else {
          startFight();
        }
        break;
      }
    }
    this.hud.wave = 1;
  }

  /** 房间内刷一波怪（按 §6.2 波次结构：波1无刀/波2混持刀；精英/关底房特殊） */
  private spawnRoomWave(
    room: RoomLayout,
    pool: string[],
    mode: 'mixed' | 'elite' | 'bossSub',
  ): void {
    const hooks = this.makeEnemyHooks();
    const lv = this.progress.level;
    const cfg = LEVELS_BY_ID.get(lv)!;
    const level = mode === 'bossSub' ? lv : lv;
    const statScale = mode === 'bossSub' ? 1.5 : mode === 'elite' ? 1.2 : 1.0;

    const pickSpec = (): string => {
      if (mode === 'mixed') {
        // §6.2：第 1 波无刀为主，第 2 波混持刀
        const meleeOnly = this.waveInRoom === 0 && this.wavesTotalInRoom >= 2;
        const candidates = pool.filter((id) => {
          const s = ENEMIES_BY_ID.get(id)!;
          return meleeOnly ? !s.blade : true;
        });
        return candidates[this.aiRng.nextInt(0, Math.max(0, candidates.length - 1))] ?? pool[0]!;
      }
      return pool[0]!;
    };

    const spawnAt = (specId: string, x: number, y: number, scale = statScale) => {
      const spec = ENEMIES_BY_ID.get(specId)!;
      const e = new Enemy(
        spec,
        vec2(x, y),
        1,
        this.aiRng.fork(),
        () => this.idSeq++,
        hooks,
      );
      if (scale !== 1) {
        // 强化（属性 ×scale：hp/damage 手动放大）
        (e as unknown as { hpMax: number }).hpMax = Math.round(e.hpMax * scale);
        (e as unknown as { hp: number }).hp = Math.round(e.hpMax);
        (e as unknown as { damage: number }).damage = Math.round(e.damage * scale);
      }
      this.enemies.push(e);
      this.engine.addTarget(e.target);
      for (const b of e.blades) this.engine.addBlade(b);
      this.codex.enemies.add(specId);
      void level;
    };

    if (mode === 'mixed') {
      // 在场上限（§6.1）
      const count = Math.min(
        room.spawnPoints.length,
        this.aiRng.nextInt(3, Math.min(6, cfg.maxOnField)),
      );
      for (let i = 0; i < count; i++) {
        const p = room.spawnPoints[this.aiRng.nextInt(0, room.spawnPoints.length - 1)]!;
        spawnAt(pickSpec(), p.x, p.y);
      }
    } else if (mode === 'elite') {
      const center = room.spawnPoints[0] ?? { x: DEFAULT_WORLD_W / 2, y: 400 };
      spawnAt(pool[0]!, center.x, center.y);
      // 杂兵
      for (let i = 1; i < Math.min(4, room.spawnPoints.length); i++) {
        const p = room.spawnPoints[i]!;
        spawnAt(cfg.spawnPool[0]!, p.x, p.y, 1);
      }
    } else {
      // bossSub：精英 ×2 强化
      const p1 = room.spawnPoints[0] ?? { x: 1000, y: 400 };
      const p2 = room.spawnPoints[1] ?? { x: 1400, y: 400 };
      spawnAt(pool[0]!, p1.x, p1.y, 1.5);
      spawnAt(pool[0]!, p2.x, p2.y, 1.5);
    }
    this.waveInRoom++;
    this.waveSpawned += this.enemies.length;
    this.waveStarted = true;
  }

  /** 商店房初始化（1-3 件商品，属性总表 §10 价格：蓝 80-150 / 紫 200-350） */
  private setupShop(room: RoomLayout): void {
    const count = this.aiRng.nextInt(1, 3);
    const parts = ['armor', 'accessory', 'tome'] as const;
    const base = { x: room.poi!.x, y: room.poi!.y };
    for (let i = 0; i < count; i++) {
      const part = parts[this.aiRng.nextInt(0, 2)]!;
      // 商店偏蓝/紫（50/50）
      const quality = this.aiRng.chance(0.5) ? 'blue' : 'purple';
      const item = this.gearGen.generateWithQuality(part, this.progress.level, quality, this.aiRng);
      const price = quality === 'blue'
        ? this.aiRng.nextInt(80, 150)
        : this.aiRng.nextInt(200, 350);
      this.shopGoods.push({
        item,
        x: base.x + (i - (count - 1) / 2) * 180,
        y: base.y,
        price,
        sold: false,
      });
    }
  }

  /** 房间清空检测与推进（波次/开门/过关） */
  private updateRoomFlow(dt: number): void {
    if (this.transitionLock > 0) {
      this.transitionLock = Math.max(0, this.transitionLock - dt);
      return;
    }

    const room = this.plan.rooms[this.progress.roomIndex]!;

    // 战斗类房间：清完一波 → 下一波或开门
    if (this.wavesTotalInRoom > 0 && this.waveStarted && this.enemies.every((e) => !e.alive)) {
      this.waveClearDelay += dt;
      if (this.waveClearDelay > 1.0) {
        this.waveClearDelay = 0;
        this.enemies = this.enemies.filter((e) => e.alive); // 清尸
        if (this.waveInRoom < this.wavesTotalInRoom) {
          const cfg = LEVELS_BY_ID.get(this.progress.level)!;
          this.spawnRoomWave(room, cfg.spawnPool, 'mixed');
          this.hud.wave = this.waveInRoom;
        } else {
          this.doorOpen = true;
          this.waveStarted = false; // 本房战斗结束，停止检测
          this.renderSystem.flash('gold', 0.2, 0.3);
        }
      }
    }

    // 开门后玩家走入门区 → 下一房间/下一关
    if (this.doorOpen && this.player.alive) {
      const d = this.doorPos;
      const inDoor =
        this.player.pos.x > d.x - 30 &&
        this.player.pos.x < d.x + d.w + 30 &&
        Math.abs(this.player.pos.y - d.y) < d.h / 2;
      if (inDoor) {
        this.progress.roomIndex++;
        if (this.progress.roomIndex >= this.plan.rooms.length) {
          // 通关：奖励 + 下一关（或胜利）
          this.onLevelClearM8();
        } else {
          this.enterRoom(this.progress.roomIndex);
          // 中段剧情（第 3 个战斗房后触发一次）
          const roomKind = this.plan.rooms[this.progress.roomIndex]?.kind;
          if (
            roomKind === 'battle' &&
            this.progress.roomIndex >= 3 &&
            !this.storyFlags.midPlayed
          ) {
            this.storyFlags.midPlayed = true;
            this.playStory('midProgress');
          }
        }
      }
    }
  }

  /** 关卡通关（M7：精英关底击败走门触发） */
  private onLevelClear(): void {
    const lv = this.progress.level;
    // 通关奖励（经验 +100×关、碎片 20-40、装备一件）
    const reward = this.progress.levelClearReward(lv);
    this.player.addKillExp(reward.exp);
    this.inventory.scrap += reward.scrap;
    // 通关装备奖励（品质按关卡提升）
    const quality = lv >= 3 ? (lv >= 5 ? 'purple' : 'blue') : 'green';
    const item = this.gearGen.generateWithQuality(
      (['armor', 'accessory', 'tome'] as const)[this.aiRng.nextInt(0, 2)]!,
      lv,
      quality,
      this.aiRng,
    );
    this.inventory.addItem(item);
    this.renderSystem.flash('gold', 0.5, 0.5);
    this.particles.levelUp(this.player.pos);

    // 通关回满血（#002：原跨关继承残血，残血开新关连续作战压力过大；
    // 经验/装备/背包等局内成长照常继承）
    this.player.heal(this.player.hpMax);

    // 图鉴与进度
    this.codex.bestLevel = Math.max(this.codex.bestLevel, lv);
    if (lv >= 6) {
      // 全通关（M7 简易胜利；M8 正式结局演出）
      this.hud.showDeathOverlay = false;
      this.hud.victory = true;
      SaveLoad.save(this.codex, null);
      return;
    }
    this.progress.advanceLevel();
    this.plan = this.levelGen.generate(this.progress.level);
    this.enterRoom(0);
  }

  /** POI 交互（宝箱/休息/事件：走近按 E；商店：走近按 E 购买） */
  private updatePoi(ctx: GameContext): void {
    // 宝箱/休息/事件
    if (this.roomPoi && !this.roomPoi.used) {
      const dist = Math.hypot(
        this.player.pos.x - this.roomPoi.x,
        this.player.pos.y - this.roomPoi.y,
      );
      if (dist < 60 && ctx.input.isPressed('KeyE')) {
        this.roomPoi.used = true;
        if (this.roomPoi.kind === 'treasure') {
          // 宝箱：金币 + 碎片 + 经验 30-80（升级曲线 §2）
          const gold = this.aiRng.nextInt(20, 50);
          this.progress.addGold(gold);
          this.inventory.scrap += this.aiRng.nextInt(3, 8);
          this.player.addKillExp(this.aiRng.nextInt(30, 80));
          this.particles.levelUp(this.player.pos);
          this.renderSystem.flash('gold', 0.3, 0.3);
        } else if (this.roomPoi.kind === 'rest') {
          // 休息：回血 30%
          this.player.heal(Math.round(this.player.hpMax * 0.3));
          this.renderSystem.flash('gold', 0.2, 0.3);
        } else {
          // 事件：随机小增益（+10 金 / +5 碎片 / 回血 10%）
          const roll = this.aiRng.nextInt(0, 2);
          if (roll === 0) this.progress.addGold(10);
          else if (roll === 1) this.inventory.scrap += 5;
          else this.player.heal(Math.round(this.player.hpMax * 0.1));
          this.renderSystem.flash('gold', 0.2, 0.3);
        }
      }
    }

    // 商店购买（走近按 E：最近商品；金币不足无效）
    if (this.shopGoods.length > 0 && ctx.input.isPressed('KeyE')) {
      let nearest: (typeof this.shopGoods)[number] | null = null;
      let nd = 90;
      for (const g of this.shopGoods) {
        if (g.sold) continue;
        const d = Math.hypot(this.player.pos.x - g.x, this.player.pos.y - g.y);
        if (d < nd) {
          nd = d;
          nearest = g;
        }
      }
      if (nearest && this.progress.spendGold(nearest.price)) {
        nearest.sold = true;
        this.inventory.addItem(nearest.item);
        this.gearDirty = true; // M9：购买置脏
        this.particles.levelUp(vec2(nearest.x, nearest.y));
        this.renderSystem.flash('gold', 0.2, 0.2);
      }
    }
  }

  /** 死亡结算（图鉴保存 + run 清空） */
  private onPlayerDeathSave(): void {
    this.codex.totalKills += this.hud.kills;
    SaveLoad.save(this.codex, null);
  }

  private drawBackground(g: CanvasRenderingContext2D): void {
    // 静态地面（按关卡色调渐变：关1-2 暖褐 → 关5-6 玄黑鎏金）
    const lv = this.progress.level;
    const warm = Math.max(0, 1 - (lv - 1) / 4); // 关1=1 → 关6≈0
    const bg = mixColor('#2b2018', '#1a1a1f', 1 - warm * 0.6);
    g.fillStyle = bg;
    g.fillRect(0, 0, DEFAULT_WORLD_W, DEFAULT_WORLD_H);
    g.strokeStyle = 'rgba(212, 168, 83, 0.05)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 96; x < DEFAULT_WORLD_W; x += 96) {
      g.moveTo(x, 0);
      g.lineTo(x, DEFAULT_WORLD_H);
    }
    for (let y = 96; y < DEFAULT_WORLD_H; y += 96) {
      g.moveTo(0, y);
      g.lineTo(DEFAULT_WORLD_W, y);
    }
    g.stroke();
    // 房间障碍（Rogue 生成）
    const room = this.plan?.rooms[this.progress.roomIndex];
    if (room) {
      for (const ob of room.obstacles) {
        g.fillStyle = '#2b2018';
        g.strokeStyle = '#1a1a1f';
        g.lineWidth = 6;
        g.beginPath();
        g.roundRect(ob.x, ob.y, ob.w, ob.h, 10);
        g.fill();
        g.stroke();
        g.strokeStyle = '#d4a853';
        g.lineWidth = 2.5;
        g.beginPath();
        g.roundRect(ob.x + 4, ob.y + 4, ob.w - 8, ob.h - 8, 7);
        g.stroke();
      }
    }
  }

  /** Boss 绘制（大圆 + 阶段色 + 蓄力预警 + 血条分段） */
  private drawBoss(g: CanvasRenderingContext2D): void {
    const b = this.boss;
    if (!b || !b.alive) return;
    // 无敌（阶段切换/风暴）半透明
    if (b.invulnerable) g.globalAlpha = 0.55;
    g.fillStyle = b.hitFlash > 0 ? '#ffffff' : '#7a2a3a';
    g.strokeStyle = '#1a1a1f';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(b.pos.x, b.pos.y, b.target.r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // 蓄力红光
    if (b.clashWindow) {
      g.strokeStyle = '#e8763a';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(b.pos.x, b.pos.y, b.target.r + 8, 0, Math.PI * 2);
      g.stroke();
    }
    // 破防标记
    if (b.vulnerable) {
      g.strokeStyle = '#f6c344';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(b.pos.x, b.pos.y, b.target.r + 14, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** Boss 血条（顶部通栏分段） */
  private drawBossHpBar(g: CanvasRenderingContext2D): void {
    const b = this.boss;
    if (!b || !b.alive) return;
    const w = 800;
    const x = (VIEW_W - w) / 2;
    const y = 30;
    // 底
    g.fillStyle = 'rgba(26,26,31,0.8)';
    g.fillRect(x - 4, y - 4, w + 8, 26);
    // 血
    const ratio = b.hp / b.hpMax;
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#8e2418');
    grad.addColorStop(1, '#c0392b');
    g.fillStyle = grad;
    g.fillRect(x, y, w * ratio, 18);
    // 阶段分段线
    g.strokeStyle = '#d4a853';
    g.lineWidth = 2;
    for (const st of b.spec.stages) {
      if (st.hpTo <= 0) continue;
      const lx = x + w * st.hpTo;
      g.beginPath();
      g.moveTo(lx, y);
      g.lineTo(lx, y + 18);
      g.stroke();
    }
    // 名字与阶段
    g.font = '700 16px "Alimama ShuHeiTi", "Noto Sans SC", sans-serif';
    g.fillStyle = '#f5ede0';
    g.textAlign = 'center';
    g.fillText(
      `${b.spec.title}·${b.spec.name}   阶段 ${b.stage}/${b.spec.stages.length}`,
      VIEW_W / 2,
      y + 44,
    );
    g.textAlign = 'left';
  }

  /** 玩家绘制：朱红圆角方块 + 黑描边 + 无敌帧闪烁 */
  private drawPlayer(g: CanvasRenderingContext2D): void {
    const p = this.player;
    if (!p.alive) return;
    // 无敌帧闪烁（0.5s 内按 60Hz 频闪）
    if (p.iframes > 0 && Math.floor(p.iframes * 24) % 2 === 0) {
      g.globalAlpha = 0.45;
    }
    g.save();
    g.translate(p.pos.x, p.pos.y);
    const s = PLAYER_R;
    g.fillStyle = '#c0392b';
    g.strokeStyle = '#1a1a1f';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(-s, -s, s * 2, s * 2, 8);
    g.fill();
    g.stroke();
    // 刀法等级指示（中心鎏金小点随等级增大，Lv 视觉反馈）
    g.fillStyle = '#d4a853';
    g.beginPath();
    g.arc(0, 0, 3 + Math.min(p.techLv, 8), 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.globalAlpha = 1;
  }

  private drawEnemies(g: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const flash = e.hitFlash > 0;
      // 蓄力预警底光（红光强度随蓄力进度）
      if (e.windupGlow > 0) {
        g.fillStyle = `rgba(232, 76, 58, ${(0.15 + e.windupGlow * 0.3).toFixed(3)})`;
        g.beginPath();
        g.arc(e.pos.x, e.pos.y, e.spec.radius + 8 + e.windupGlow * 6, 0, Math.PI * 2);
        g.fill();
      }
      // 本体（闪白；自爆引信期间橙红闪烁）
      let bodyColor =
        e.spec.kind === 'blade' || e.spec.kind === 'elite'
          ? e.spec.blade ? '#7a4a2b' : '#5a5a66'
          : '#2d6e63';
      if (e.spec.id === 'cultist' && e.windupKind === 'suicide') {
        bodyColor = e.windupGlow > 0.5 ? '#e8763a' : '#8e3a24';
      }
      g.fillStyle = flash ? '#ffffff' : bodyColor;
      g.strokeStyle = '#1a1a1f';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(e.pos.x, e.pos.y, e.spec.radius, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // 破势标记（金色描边）
      if (e.brokenGuard > 0) {
        g.strokeStyle = '#f6c344';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(e.pos.x, e.pos.y, e.spec.radius + 5, 0, Math.PI * 2);
        g.stroke();
      }
      // 小血条
      const w = e.spec.radius * 2.4;
      g.fillStyle = 'rgba(26,26,31,0.8)';
      g.fillRect(e.pos.x - w / 2, e.pos.y - e.spec.radius - 14, w, 5);
      g.fillStyle = '#3ba272';
      g.fillRect(e.pos.x - w / 2, e.pos.y - e.spec.radius - 14, w * (e.hp / e.hpMax), 5);
    }
  }

  render(g: CanvasRenderingContext2D, _alpha: number, _ctx: GameContext): void {
    // 渲染由 RenderSystem 分层负责，状态级渲染无内容
    void g;
  }
}

/** 颜色插值（hex → hex，t∈[0,1]） */
function mixColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${gg},${bl})`;
}

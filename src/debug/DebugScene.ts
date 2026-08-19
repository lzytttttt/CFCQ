/**
 * DebugScene —— 引擎验证场景（第二里程碑临时交付）
 *
 * 运行时验证 M2 全部模块：CollisionEngine（命中/拼刀/阻挡）、Camera（跟随+震动）、
 * BladeRenderer（刀体+拖尾）、ParticleSystem（事件预设）、RenderSystem（分层+闪光）。
 * 第三里程碑由正式 BattleState 替换。
 *
 * 场景内容：
 * - WASD 移动测试方块（含圆-AABB 阻挡推出验证）
 * - 玩家刀体旋转，命中静态假人 → 火花粒子 + 命中计数 + 1px 震动
 * - 敌方持刀假人（旋转刀体），刀体相交 → 拼刀解算 → 白闪 + 5px 震动 + 结果日志
 */

import type { GameContext } from '../core/GameContext';
import type { GameLoop } from '../core/GameLoop';
import type { IGameState } from '../core/StateMachine';
import { clamp } from '../math/Geometry';
import { vec2, type Vec2 } from '../math/Vec2';
import { advanceBlade, createBladeBody, type BladeBody } from '../physics/BladeCollision';
import { CollisionEngine, type HitTarget } from '../physics/CollisionEngine';
import { BladeRenderer, BladeTrail } from '../render/BladeRenderer';
import type { Camera } from '../render/Camera';
import type { ParticleSystem } from '../render/ParticleSystem';
import { RenderLayer, type RenderSystem } from '../render/RenderSystem';
import { DEFAULT_WORLD_H, DEFAULT_WORLD_W, VIEW_H, VIEW_W } from '../render/View';

const PLAYER_SPEED = 320;
const PLAYER_R = 22;
const BLADE_LENGTH = 112;
const BLADE_OMEGA = 3.49; // ω0 基准（200°/s）
const FOE_BLADE_LENGTH = 96;
const FOE_BLADE_OMEGA = -3.49; // 敌刀逆时针（与玩家刀相向，验证拼刀检测）
const GRID_SIZE = 96;

const C = {
  ink: '#1a1a1f',
  brown: '#2b2018',
  paper: '#f5ede0',
  red: '#c0392b',
  gold: '#d4a853',
  cyan: '#4fd1c5',
  gridLine: 'rgba(212, 168, 83, 0.06)',
};

/** 静态假人位置（无刀，纯命中验证） */
const DUMMY_POSITIONS: Array<[number, number]> = [
  [900, 480],
  [1500, 700],
  [700, 1000],
  [1900, 400],
];

/** 敌方持刀假人（拼刀验证） */
const FOE_POS: Vec2 = vec2(1500, 380);

const OBSTACLES = [
  { x: 520, y: 360, w: 220, h: 90 },
  { x: 1780, y: 940, w: 120, h: 240 },
  { x: 1180, y: 620, w: 90, h: 90 },
];

export class DebugScene implements IGameState {
  private readonly loop: GameLoop;
  private readonly camera: Camera;
  private readonly renderSystem: RenderSystem;
  private readonly particles: ParticleSystem;
  private readonly bladeRenderer = new BladeRenderer();

  private playerPos: Vec2 = vec2(DEFAULT_WORLD_W / 2, DEFAULT_WORLD_H / 2);
  private engine!: CollisionEngine;
  private playerBlade!: BladeBody;
  private playerTrail = new BladeTrail();
  private foeBlade!: BladeBody;
  private foeTrail = new BladeTrail();
  private foeBladeDisabled = 0;

  private hitCount = 0;
  private clashCount = 0;
  private lastClashText = '—';
  private elapsed = 0;
  private bgCanvas: HTMLCanvasElement | null = null;

  constructor(
    loop: GameLoop,
    camera: Camera,
    renderSystem: RenderSystem,
    particles: ParticleSystem,
  ) {
    this.loop = loop;
    this.camera = camera;
    this.renderSystem = renderSystem;
    this.particles = particles;
  }

  enter(ctx: GameContext): void {
    this.elapsed = 0;
    this.hitCount = 0;
    this.clashCount = 0;
    this.lastClashText = '—';
    this.playerPos = vec2(DEFAULT_WORLD_W / 2, DEFAULT_WORLD_H / 2);
    ctx.world = { width: DEFAULT_WORLD_W, height: DEFAULT_WORLD_H };
    this.camera.resizeWorld(DEFAULT_WORLD_W, DEFAULT_WORLD_H);
    this.camera.snapTo(this.playerPos);

    // ---- 碰撞引擎与登记 ----
    this.engine = new CollisionEngine(
      DEFAULT_WORLD_W,
      DEFAULT_WORLD_H,
      120,
      ctx.rng.fork(),
    );
    this.engine.setListener({
      onBladeHitEnemy: (_blade, target, hitPoint) => {
        this.hitCount++;
        this.particles.hit(hitPoint, this.playerBlade.angle);
        this.camera.shake(1, 0.08); // 命中 1px（渲染管线.md §5）
        void target;
      },
      onBladeClash: (_pb, _fb, hitPoint, result) => {
        this.clashCount++;
        this.lastClashText = `${result.outcome}（胜率 ${(result.winRate * 100).toFixed(0)}%）`;
        this.particles.clash(hitPoint);
        this.renderSystem.flash('white', 0.45, 0.18); // 拼刀白闪
        this.camera.shake(5, 0.25); // 拼刀 5px
        if (result.outcome === 'break') this.particles.bladeBreak(hitPoint);
        // 应用解算结果：敌刀失去刀体（场景侧简化模拟）
        this.foeBladeDisabled = Math.max(this.foeBladeDisabled, result.disableFoeBlade);
      },
      onBodyBlocked: () => {
        /* 阻挡推出已由引擎完成（位移修正） */
      },
    });

    this.playerBlade = this.engine.addBlade(
      createBladeBody({
        owner: 'player',
        ownerId: 1,
        center: this.playerPos,
        quality: 'green',
        length: BLADE_LENGTH,
        width: 7,
        omega: BLADE_OMEGA,
      }),
    );
    this.playerTrail.clear();

    this.foeBlade = this.engine.addBlade(
      createBladeBody({
        owner: 'enemy',
        ownerId: 99,
        center: FOE_POS,
        quality: 'white',
        length: FOE_BLADE_LENGTH,
        width: 6,
        omega: FOE_BLADE_OMEGA,
      }),
    );
    this.foeTrail.clear();
    this.foeBladeDisabled = 0;

    // 静态假人（可被命中目标）
    for (const [x, y] of DUMMY_POSITIONS) {
      this.engine.addTarget({
        id: Math.floor(x * 1000 + y),
        pos: vec2(x, y),
        r: 20,
        hittable: true,
        faction: 'enemy',
      });
    }
    // 敌方持刀假人本体
    this.engine.addTarget({
      id: 99,
      pos: FOE_POS,
      r: 24,
      hittable: true,
      faction: 'enemy',
    });
    // 玩家本体（圆-AABB 阻挡验证目标）
    this.engine.addTarget({
      id: 1,
      pos: this.playerPos,
      r: PLAYER_R,
      hittable: true,
      faction: 'player',
    });

    for (const ob of OBSTACLES) this.engine.addObstacle(ob);

    // ---- 渲染层注册 ----
    this.buildBackground();
    this.renderSystem.clearLayer(RenderLayer.Background);
    this.renderSystem.addLayer(RenderLayer.Background, (g) => {
      if (this.bgCanvas) g.drawImage(this.bgCanvas, 0, 0);
    });
    this.renderSystem.clearLayer(RenderLayer.Enemies);
    this.renderSystem.addLayer(RenderLayer.Enemies, (g) => this.drawDummies(g));
    this.renderSystem.clearLayer(RenderLayer.Blades);
    this.renderSystem.addLayer(RenderLayer.Blades, (g) => {
      this.bladeRenderer.drawBlade(g, this.playerBlade, this.playerTrail);
      this.bladeRenderer.drawBlade(g, this.foeBlade, this.foeTrail);
    });
    this.renderSystem.clearLayer(RenderLayer.Particles);
    this.renderSystem.addLayer(RenderLayer.Particles, (g) => this.particles.draw(g));
    this.renderSystem.clearLayer(RenderLayer.UI);
    this.renderSystem.addLayer(RenderLayer.UI, (g) => this.drawHUD(g));
  }

  exit(_ctx: GameContext): void {
    this.engine.clearAll();
    this.bgCanvas = null;
  }

  update(dt: number, ctx: GameContext): void {
    this.elapsed += dt;

    // WASD 移动 + 边界钳制
    const axis = ctx.input.getAxis();
    this.playerPos.x = clamp(
      this.playerPos.x + axis.x * PLAYER_SPEED * dt,
      PLAYER_R,
      ctx.world.width - PLAYER_R,
    );
    this.playerPos.y = clamp(
      this.playerPos.y + axis.y * PLAYER_SPEED * dt,
      PLAYER_R,
      ctx.world.height - PLAYER_R,
    );

    // 刀体推进（持刀方职责）
    this.playerBlade.center.x = this.playerPos.x;
    this.playerBlade.center.y = this.playerPos.y;
    advanceBlade(this.playerBlade, dt);
    this.playerTrail.push(this.playerBlade.angle);

    // 敌方刀体（失去刀体期间停转）
    if (this.foeBladeDisabled > 0) {
      this.foeBladeDisabled = Math.max(0, this.foeBladeDisabled - dt);
      this.foeBlade.active = false;
    } else {
      this.foeBlade.active = true;
      advanceBlade(this.foeBlade, dt);
    }
    this.foeTrail.push(this.foeBlade.angle);

    // 碰撞引擎步进
    this.engine.step(dt);

    // 相机与渲染系统
    this.camera.follow(this.playerPos, dt);
    this.camera.update(dt);
    this.particles.update(dt);
    this.renderSystem.update(dt);
  }

  /** 静态背景离屏缓存 */
  private buildBackground(): void {
    const cv = document.createElement('canvas');
    cv.width = DEFAULT_WORLD_W;
    cv.height = DEFAULT_WORLD_H;
    const bg = cv.getContext('2d');
    if (!bg) return;

    bg.fillStyle = C.ink;
    bg.fillRect(0, 0, DEFAULT_WORLD_W, DEFAULT_WORLD_H);
    bg.strokeStyle = C.gridLine;
    bg.lineWidth = 1;
    bg.beginPath();
    for (let x = GRID_SIZE; x < DEFAULT_WORLD_W; x += GRID_SIZE) {
      bg.moveTo(x, 0);
      bg.lineTo(x, DEFAULT_WORLD_H);
    }
    for (let y = GRID_SIZE; y < DEFAULT_WORLD_H; y += GRID_SIZE) {
      bg.moveTo(0, y);
      bg.lineTo(DEFAULT_WORLD_W, y);
    }
    bg.stroke();

    bg.strokeStyle = C.gold;
    bg.lineWidth = 3;
    bg.strokeRect(1.5, 1.5, DEFAULT_WORLD_W - 3, DEFAULT_WORLD_H - 3);

    for (const o of OBSTACLES) {
      bg.fillStyle = C.brown;
      bg.strokeStyle = C.ink;
      bg.lineWidth = 6;
      roundRect(bg, o.x, o.y, o.w, o.h, 10);
      bg.fill();
      bg.stroke();
      bg.strokeStyle = C.gold;
      bg.lineWidth = 2.5;
      roundRect(bg, o.x + 4, o.y + 4, o.w - 8, o.h - 8, 7);
      bg.stroke();
    }

    this.bgCanvas = cv;
  }

  private drawDummies(g: CanvasRenderingContext2D): void {
    // 静态假人：青色圆（卡通描边）
    for (const [x, y] of DUMMY_POSITIONS) {
      g.fillStyle = '#2d6e63';
      g.strokeStyle = C.ink;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(x, y, 20, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // 敌方持刀假人本体：褐圆 + 状态标识
    g.fillStyle = this.foeBlade.active ? '#7a4a2b' : '#4a3a30';
    g.strokeStyle = C.ink;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(FOE_POS.x, FOE_POS.y, 24, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (!this.foeBlade.active) {
      g.fillStyle = C.gold;
      g.font = 'bold 16px sans-serif';
      g.fillText('失刀', FOE_POS.x - 16, FOE_POS.y + 6);
    }
  }

  private drawHUD(g: CanvasRenderingContext2D): void {
    const font = (size: number, weight = 400) =>
      `${weight} ${size}px "Alimama ShuHeiTi", "Noto Sans SC", "Microsoft YaHei", sans-serif`;

    // 顶部调试条
    g.fillStyle = 'rgba(26, 26, 31, 0.72)';
    g.fillRect(0, 0, VIEW_W, 64);
    g.strokeStyle = 'rgba(212, 168, 83, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 64.5);
    g.lineTo(VIEW_W, 64.5);
    g.stroke();

    g.fillStyle = C.gold;
    g.font = font(24, 700);
    g.fillText('藏锋出鞘 · 引擎验证场景 M2', 28, 40);

    g.fillStyle = C.paper;
    g.font = font(17, 400);
    const fps = this.loop.fps.toFixed(0);
    const up = this.loop.lastUpdateMs.toFixed(2);
    const rp = this.loop.lastRenderMs.toFixed(2);
    g.fillText(
      `FPS ${fps}   物理 ${up}ms   渲染 ${rp}ms   实体 ${this.engine.targetCount}目标/${this.engine.bladeCount}刀`,
      420,
      40,
    );

    // 左下：事件统计与操作提示
    g.font = font(16, 400);
    const lines = [
      `命中 ${this.hitCount} 次（对级 CD 0.25s 生效中）`,
      `拼刀 ${this.clashCount} 次   最近结果：${this.lastClashText}`,
      `玩家 (${this.playerPos.x.toFixed(0)}, ${this.playerPos.y.toFixed(0)})`,
      '',
      'WASD 移动 · 走向右侧持刀假人触发拼刀',
      '贴近障碍物验证圆-AABB 阻挡推出',
    ];
    g.fillStyle = 'rgba(26, 26, 31, 0.6)';
    g.fillRect(16, VIEW_H - 22 * lines.length - 30, 400, 22 * lines.length + 18);
    g.fillStyle = C.paper;
    lines.forEach((s, i) => g.fillText(s, 30, VIEW_H - 22 * lines.length - 10 + i * 22));
    if (this.elapsed > 0) {
      g.fillStyle = C.cyan;
      g.fillText('● 引擎运转中', VIEW_W - 150, VIEW_H - 24);
    }
  }
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

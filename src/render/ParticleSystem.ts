/**
 * ParticleSystem —— 粒子系统（wiki/09-tech/渲染管线.md §3）
 *
 * 对象池化（架构文档 §6 性能预算：避免 GC 卡顿），同屏上限 500。
 * 事件预设按渲染管线文档 §3 表：
 * 命中 5-8 火花 / 击杀 12 碎片+光点 / 拼刀 16 火星+白闪 /
 * 破刀 24 刀刃碎片 / 升级 金色光环上升
 */

import { vec2, type Vec2 } from '../math/Vec2';
import type { RNG } from '../core/RNG';

/** 同屏粒子上限（渲染管线.md §6：超出丢弃最老） */
export const MAX_PARTICLES = 500;

/** 速度阻尼（文档 update：每帧 ×0.92，按 60fps 归一化到 dt） */
const DAMPING_PER_FRAME = 0.92;

export type ParticleType = 'spark' | 'glow' | 'shard' | 'ring';

interface Particle {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: ParticleType;
  /** shard 旋转 */
  rot: number;
  rotSpeed: number;
  /** ring 外扩速度 */
  expand: number;
}

interface EmitOpts {
  color: string;
  type?: ParticleType;
  /** 初速范围 px/s */
  speedMin?: number;
  speedMax?: number;
  lifeMin?: number;
  lifeMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  /** 发射锥中心方向（弧度）；默认全向 */
  dir?: number;
  /** 发射锥半张角（弧度）；默认 π（全向） */
  spread?: number;
  /** ring 外扩速度 */
  expand?: number;
}

function createParticle(): Particle {
  return {
    active: false,
    pos: vec2(),
    vel: vec2(),
    life: 0,
    maxLife: 1,
    size: 3,
    color: '#fff',
    type: 'spark',
    rot: 0,
    rotSpeed: 0,
    expand: 0,
  };
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private activeCount = 0;
  /** 上限截断统计（性能监控） */
  dropped = 0;

  constructor(private readonly rng: RNG) {
    // 预热池（避免运行时按需扩容的首帧抖动）
    for (let i = 0; i < 128; i++) this.pool.push(createParticle());
  }

  /** 激活粒子数 */
  get count(): number {
    return this.activeCount;
  }

  private acquire(): Particle | null {
    if (this.activeCount >= MAX_PARTICLES) {
      // 渲染管线.md §6：超出上限「丢弃最老」——复用剩余寿命最小的粒子
      let oldest: Particle | null = null;
      for (const p of this.pool) {
        if (!p.active) continue;
        if (!oldest || p.life < oldest.life) oldest = p;
      }
      if (!oldest) return null;
      this.dropped++;
      return oldest; // 直接复用（active 保持 true，重置字段）
    }
    // 池中找 inactive
    for (const p of this.pool) {
      if (!p.active) {
        p.active = true;
        this.activeCount++;
        return p;
      }
    }
    // 池耗尽且未达上限 → 扩容
    const p = createParticle();
    p.active = true;
    this.pool.push(p);
    this.activeCount++;
    return p;
  }

  /** 发射 count 个粒子 */
  emit(pos: Vec2, count: number, opts: EmitOpts): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;
      p.pos.x = pos.x;
      p.pos.y = pos.y;
      p.maxLife = p.life = this.rng.nextRange(
        opts.lifeMin ?? 0.25,
        opts.lifeMax ?? 0.6,
      );
      p.size = this.rng.nextRange(opts.sizeMin ?? 2, opts.sizeMax ?? 5);
      p.color = opts.color;
      p.type = opts.type ?? 'spark';
      p.expand = opts.expand ?? 0;
      p.rot = this.rng.nextRange(0, Math.PI * 2);
      p.rotSpeed = this.rng.nextRange(-6, 6);

      const speed = this.rng.nextRange(opts.speedMin ?? 60, opts.speedMax ?? 220);
      const dir = opts.dir ?? 0;
      const spread = opts.spread ?? Math.PI;
      const ang = dir + this.rng.nextRange(-spread, spread);
      p.vel.x = Math.cos(ang) * speed;
      p.vel.y = Math.sin(ang) * speed;
    }
  }

  /** 每物理帧更新（位移 + 阻尼 + 生命周期） */
  update(dt: number): void {
    const damp = Math.pow(DAMPING_PER_FRAME, dt * 60);
    for (const p of this.pool) {
      if (!p.active) continue;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.vel.x *= damp;
      p.vel.y *= damp;
      p.rot += p.rotSpeed * dt;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.activeCount--;
      }
    }
  }

  /** 绘制全部活跃粒子（世界坐标系下调用） */
  draw(g: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife; // 1 → 0 渐隐
      g.globalAlpha = t;
      switch (p.type) {
        case 'spark': {
          // 拉长速度方向的短划线（火花）
          const vlen = Math.hypot(p.vel.x, p.vel.y);
          const k = vlen > 1 ? Math.min(p.size * 2.2, 14) / vlen : 0;
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(1, p.size * 0.5);
          g.beginPath();
          g.moveTo(p.pos.x, p.pos.y);
          g.lineTo(p.pos.x - p.vel.x * k, p.pos.y - p.vel.y * k);
          g.stroke();
          break;
        }
        case 'glow': {
          // 径向渐变光点
          const r = p.size * (0.5 + t * 0.5);
          const grad = g.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, r);
          grad.addColorStop(0, p.color);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'shard': {
          // 旋转三角碎片
          g.save();
          g.translate(p.pos.x, p.pos.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.beginPath();
          g.moveTo(p.size, 0);
          g.lineTo(-p.size * 0.6, -p.size * 0.5);
          g.lineTo(-p.size * 0.6, p.size * 0.5);
          g.closePath();
          g.fill();
          g.restore();
          break;
        }
        case 'ring': {
          // 外扩光环（升级特效）
          const r = p.size + (p.maxLife - p.life) * p.expand;
          g.strokeStyle = p.color;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2);
          g.stroke();
          break;
        }
      }
    }
    g.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
    this.activeCount = 0;
    this.dropped = 0;
  }

  // ============ 事件预设（渲染管线.md §3 表） ============

  /** 命中：5-8 火花，朝命中切线方向 */
  hit(pos: Vec2, tangentDir: number): void {
    const n = this.rng.nextInt(5, 8);
    this.emit(pos, n, {
      color: '#ffcc66',
      type: 'spark',
      dir: tangentDir,
      spread: Math.PI / 3,
      speedMin: 120,
      speedMax: 260,
      lifeMin: 0.15,
      lifeMax: 0.35,
      sizeMin: 2,
      sizeMax: 4,
    });
  }

  /** 击杀：12 碎片 + 光点扩散 */
  kill(pos: Vec2, color = '#d4a853'): void {
    this.emit(pos, 8, {
      color,
      type: 'shard',
      speedMin: 80,
      speedMax: 200,
      lifeMin: 0.3,
      lifeMax: 0.6,
      sizeMin: 3,
      sizeMax: 6,
    });
    this.emit(pos, 4, {
      color,
      type: 'glow',
      speedMin: 20,
      speedMax: 60,
      lifeMin: 0.3,
      lifeMax: 0.5,
      sizeMin: 8,
      sizeMax: 16,
    });
  }

  /** 拼刀：16 火星四溅（白光闪由 RenderSystem.flash 承担） */
  clash(pos: Vec2): void {
    this.emit(pos, 16, {
      color: '#ffffff',
      type: 'spark',
      speedMin: 150,
      speedMax: 380,
      lifeMin: 0.15,
      lifeMax: 0.4,
      sizeMin: 2,
      sizeMax: 5,
    });
    this.emit(pos, 4, {
      color: '#ffcc66',
      type: 'glow',
      speedMin: 0,
      speedMax: 40,
      lifeMin: 0.2,
      lifeMax: 0.35,
      sizeMin: 10,
      sizeMax: 18,
    });
  }

  /** 破刀：24 刀刃碎片（慢镜头由 hitstop 承担，M3） */
  bladeBreak(pos: Vec2): void {
    this.emit(pos, 24, {
      color: '#cc66ff',
      type: 'shard',
      speedMin: 100,
      speedMax: 320,
      lifeMin: 0.4,
      lifeMax: 0.8,
      sizeMin: 3,
      sizeMax: 7,
    });
    this.emit(pos, 1, {
      color: '#ffffff',
      type: 'ring',
      speedMin: 0,
      speedMax: 0,
      lifeMin: 0.35,
      lifeMax: 0.35,
      sizeMin: 12,
      sizeMax: 12,
      expand: 260,
    });
  }

  /** 升级：金色光环上升 */
  levelUp(pos: Vec2): void {
    this.emit(pos, 1, {
      color: '#f6c344',
      type: 'ring',
      speedMin: 0,
      speedMax: 0,
      lifeMin: 0.6,
      lifeMax: 0.6,
      sizeMin: 14,
      sizeMax: 14,
      expand: 120,
    });
    this.emit(pos, 10, {
      color: '#f6c344',
      type: 'glow',
      dir: -Math.PI / 2, // 向上
      spread: Math.PI / 5,
      speedMin: 40,
      speedMax: 120,
      lifeMin: 0.5,
      lifeMax: 0.9,
      sizeMin: 4,
      sizeMax: 9,
    });
  }
}

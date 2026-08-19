/**
 * DamageNumbers —— 伤害数字（对象池）
 *
 * 样式（卡通 2D 武侠）：普通白字黑描边 / 暴击朱红大字 / 破势金边 / 玩家受伤红字。
 * 上浮 + 渐隐 + 轻微随机水平偏移。
 */

import { vec2, type Vec2 } from '../math/Vec2';
import type { RNG } from '../core/RNG';

export type DamageNumberKind = 'normal' | 'crit' | 'breakGuard' | 'player';

interface Entry {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  text: string;
  kind: DamageNumberKind;
}

const KIND_STYLE: Record<
  DamageNumberKind,
  { color: string; outline: string; size: number; weight: number }
> = {
  normal: { color: '#f5ede0', outline: '#1a1a1f', size: 22, weight: 700 },
  crit: { color: '#c0392b', outline: '#f5ede0', size: 30, weight: 900 },
  breakGuard: { color: '#f6c344', outline: '#1a1a1f', size: 26, weight: 900 },
  player: { color: '#e8763a', outline: '#1a1a1f', size: 24, weight: 700 },
};

export class DamageNumbers {
  private pool: Entry[] = [];

  constructor(private readonly rng: RNG) {}

  spawn(pos: Vec2, amount: number, kind: DamageNumberKind): void {
    let e = this.pool.find((p) => !p.active);
    if (!e) {
      if (this.pool.length >= 80) return; // 上限
      e = {
        active: false,
        pos: vec2(),
        vel: vec2(),
        life: 0,
        maxLife: 1,
        text: '',
        kind: 'normal',
      };
      this.pool.push(e);
    }
    e.active = true;
    e.pos.x = pos.x + this.rng.nextRange(-10, 10);
    e.pos.y = pos.y - 14;
    e.vel.x = this.rng.nextRange(-18, 18);
    e.vel.y = -78;
    e.maxLife = e.life = kind === 'crit' ? 0.9 : 0.7;
    e.text = String(Math.round(amount));
    e.kind = kind;
  }

  update(dt: number): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
      e.vel.y += 160 * dt; // 重力回落
      e.life -= dt;
      if (e.life <= 0) e.active = false;
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      const s = KIND_STYLE[e.kind];
      const t = e.life / e.maxLife;
      g.globalAlpha = Math.min(1, t * 2);
      g.font = `${s.weight} ${s.size}px "Alimama ShuHeiTi", "Noto Sans SC", sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = s.outline;
      g.strokeText(e.text, e.pos.x, e.pos.y);
      g.fillStyle = s.color;
      g.fillText(e.text, e.pos.x, e.pos.y);
    }
    g.globalAlpha = 1;
    g.textAlign = 'left';
  }

  clear(): void {
    for (const e of this.pool) e.active = false;
  }
}

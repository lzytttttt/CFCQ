/**
 * HUD —— 简易战斗 HUD（M3 验证版；M6 做正式美化）
 *
 * 内容：左上血条（朱红）+ 双经验条（刀法青/刀具金）+ 击杀数 + 连击提示 + 死亡覆盖层。
 */

import type { PlayerEntity } from '../player/PlayerEntity';
import { VIEW_H, VIEW_W } from './View';

const C = {
  ink: '#1a1a1f',
  paper: '#f5ede0',
  red: '#c0392b',
  gold: '#d4a853',
  cyan: '#4fd1c5',
};

export class HUD {
  kills = 0;
  wave = 0;
  clashCount = 0;
  lastCombo = 0;
  comboFlash = 0;
  showDeathOverlay = false;
  victory = false;
  /** 关卡/房间/金币（M7 Rogue 流程） */
  levelInfo = '';
  gold = 0;

  setCombo(combo: number): void {
    if (combo > this.lastCombo) this.comboFlash = 0.5;
    this.lastCombo = combo;
  }

  tick(dt: number): void {
    if (this.comboFlash > 0) this.comboFlash = Math.max(0, this.comboFlash - dt);
  }

  draw(g: CanvasRenderingContext2D, player: PlayerEntity): void {
    const font = (size: number, weight = 400) =>
      `${weight} ${size}px "Alimama ShuHeiTi", "Noto Sans SC", "Microsoft YaHei", sans-serif`;

    // ---- 左上：血条 + 双经验条 ----
    const x = 28;
    let y = 34;

    // 血条
    const hpW = 300;
    g.fillStyle = 'rgba(26,26,31,0.75)';
    roundRectPath(g, x - 6, y - 20, hpW + 12, 30, 8);
    g.fill();
    g.strokeStyle = C.gold;
    g.lineWidth = 2;
    roundRectPath(g, x - 2, y - 16, hpW + 4, 22, 6);
    g.stroke();
    const hpRatio = player.hp / player.hpMax;
    const grad = g.createLinearGradient(x, 0, x + hpW, 0);
    grad.addColorStop(0, '#8e2418');
    grad.addColorStop(1, '#e8763a');
    g.fillStyle = grad;
    if (hpRatio > 0) {
      roundRectPath(g, x, y - 13, hpW * hpRatio, 16, 4);
      g.fill();
    }
    g.fillStyle = C.paper;
    g.font = font(14, 700);
    g.fillText(`HP ${player.hp}/${player.hpMax}`, x + 8, y + 1);

    // 经验条（刀法青 / 刀具金）
    y += 40;
    this.expBar(g, x, y, 220, C.cyan, '刀法', player.techLv, player.techExp, player.techExpNeed);
    y += 26;
    this.expBar(g, x, y, 220, C.gold, '刀具', player.bladeLv, player.bladeExp, player.bladeExpNeed);

    // ---- 右上：击杀 / 拼刀 / 金币 / 关卡房间 ----
    g.fillStyle = C.paper;
    g.font = font(18, 700);
    g.textAlign = 'right';
    g.fillText(`击杀 ${this.kills} · 拼刀 ${this.clashCount}`, VIEW_W - 28, 36);
    g.fillStyle = C.gold;
    g.font = font(16, 700);
    g.fillText(`◈ ${this.gold}`, VIEW_W - 28, 62);
    g.fillStyle = '#c9c2b4';
    g.font = font(14, 400);
    g.fillText(this.levelInfo, VIEW_W - 28, 86);
    g.textAlign = 'left';

    // ---- 中央连击提示 ----
    if (this.lastCombo >= 2 && this.comboFlash > 0) {
      g.globalAlpha = Math.min(1, this.comboFlash * 2);
      g.font = font(34, 900);
      g.textAlign = 'center';
      g.lineWidth = 5;
      g.strokeStyle = C.ink;
      g.strokeText(`${this.lastCombo} 连击!`, VIEW_W / 2, 150);
      g.fillStyle = C.gold;
      g.fillText(`${this.lastCombo} 连击!`, VIEW_W / 2, 150);
      g.textAlign = 'left';
      g.globalAlpha = 1;
    }

    // ---- 无敌帧提示（受击闪烁状态） ----
    if (player.iframes > 0 && player.alive) {
      g.fillStyle = 'rgba(232, 118, 58, 0.08)';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // ---- 胜利覆盖层（M7 简易版；M8 正式结局演出） ----
    if (this.victory) {
      g.fillStyle = 'rgba(26, 26, 31, 0.75)';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.textAlign = 'center';
      g.font = font(72, 900);
      g.lineWidth = 8;
      g.strokeStyle = C.ink;
      g.strokeText('武林问鼎 · 出鞘!', VIEW_W / 2, VIEW_H / 2 - 30);
      g.fillStyle = C.gold;
      g.fillText('武林问鼎 · 出鞘!', VIEW_W / 2, VIEW_H / 2 - 30);
      g.font = font(22, 400);
      g.fillStyle = C.paper;
      g.fillText(`击杀 ${this.kills} · 图鉴进度已保存（正式结局演出 M8 交付）`, VIEW_W / 2, VIEW_H / 2 + 40);
      g.textAlign = 'left';
    } else if (this.showDeathOverlay) {
      // ---- 死亡覆盖层 ----
      g.fillStyle = 'rgba(26, 26, 31, 0.7)';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.textAlign = 'center';
      g.font = font(64, 900);
      g.lineWidth = 8;
      g.strokeStyle = C.ink;
      g.strokeText('力竭倒地', VIEW_W / 2, VIEW_H / 2 - 20);
      g.fillStyle = C.red;
      g.fillText('力竭倒地', VIEW_W / 2, VIEW_H / 2 - 20);
      g.font = font(22, 400);
      g.fillStyle = C.paper;
      g.fillText('图鉴进度已保存 · 刷新页面重开一局（正式结算 M9 交付）', VIEW_W / 2, VIEW_H / 2 + 40);
      g.textAlign = 'left';
    }
  }

  private expBar(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    color: string,
    label: string,
    lv: number,
    exp: number,
    need: number,
  ): void {
    g.fillStyle = 'rgba(26,26,31,0.6)';
    roundRectPath(g, x - 4, y - 12, w + 8, 20, 6);
    g.fill();
    g.fillStyle = color;
    const ratio = Math.min(1, exp / need);
    if (ratio > 0) {
      roundRectPath(g, x, y - 9, w * ratio, 14, 4);
      g.fill();
    }
    g.fillStyle = '#1a1a1f';
    g.font = '700 12px "Alimama ShuHeiTi", sans-serif';
    g.fillText(`${label} Lv${lv}`, x + 6, y + 3);
  }
}

function roundRectPath(
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

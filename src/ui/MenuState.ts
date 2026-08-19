/**
 * MenuState —— 主菜单（设计方案 §UI-1：水墨质感玄黑背景 + 鎏金大字标题「藏锋出鞘」
 * + 菜单项（开始闯荡）+ 底部版本号 + 标题旁旋转刀光动效）
 *
 * DOM 实现；Enter / 点击开始 → BattleState。
 */

import type { GameContext } from '../core/GameContext';
import type { IGameState } from '../core/StateMachine';

export class MenuState implements IGameState {
  private root: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private rafId = 0;
  private onStart: (() => void) | null = null;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly version: string,
  ) {}

  enter(_ctx: GameContext): void {
    this.exit();
    const root = document.createElement('div');
    root.className = 'menu-screen';
    root.innerHTML = `
      <div class="menu-inner">
        <canvas class="menu-blade-fx" width="360" height="360"></canvas>
        <div class="menu-title">藏锋出鞘</div>
        <div class="menu-subtitle">一把铁匠锤下敲出的刀 · 从铁匠铺到武林盟主</div>
        <button class="menu-start" type="button">开始闯荡</button>
        <div class="menu-controls">
          <span>WASD 移动</span><i></i><span>空格 逆刃</span><i></i><span>B 背包</span><i></i><span>E 交互</span><i></i><span>ESC 暂停</span>
        </div>
        <div class="menu-version">v${this.version} · Rogue 转刀动作游戏</div>
      </div>
    `;
    this.overlay.appendChild(root);
    this.root = root;

    const start = root.querySelector('.menu-start') as HTMLElement;
    start.addEventListener('click', () => this.begin());
    this.keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.begin();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    // 标题旁旋转刀光动效（Canvas：青金双色弧光）
    const fx = root.querySelector('.menu-blade-fx') as HTMLCanvasElement;
    const g = fx.getContext('2d');
    if (g) {
      const cx = 180, cy = 180;
      const draw = () => {
        g.clearRect(0, 0, 360, 360);
        const t = performance.now() / 1000;
        // 双层弧光
        for (let layer = 0; layer < 2; layer++) {
          const r = 120 - layer * 34;
          const a0 = t * (2.2 - layer * 0.6) + layer * 2.4;
          g.strokeStyle = layer === 0 ? 'rgba(79,209,197,0.75)' : 'rgba(212,168,83,0.7)';
          g.lineWidth = 7 - layer * 2;
          g.lineCap = 'round';
          g.beginPath();
          g.arc(cx, cy, r, a0, a0 + Math.PI * 0.85);
          g.stroke();
        }
        // 中心刀核
        g.save();
        g.translate(cx, cy);
        g.rotate(t * 3);
        g.strokeStyle = '#f6c344';
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-26, 0);
        g.lineTo(26, 0);
        g.moveTo(-26, 0);
        g.lineTo(-36, 0);
        g.stroke();
        g.restore();
        this.rafId = requestAnimationFrame(draw);
      };
      draw();
    }
  }

  private begin(): void {
    this.onStart?.();
  }

  /** 注册开始回调（状态机切换） */
  onBegin(cb: () => void): void {
    this.onStart = cb;
  }

  exit(_ctx?: GameContext): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    cancelAnimationFrame(this.rafId);
    this.root?.remove();
    this.root = null;
  }

  update(_dt: number, _ctx: GameContext): void {}
  render(_g: CanvasRenderingContext2D, _alpha: number, _ctx: GameContext): void {}
}

export function injectMenuStyles(): void {
  if (document.getElementById('menu-styles')) return;
  const css = document.createElement('style');
  css.id = 'menu-styles';
  css.textContent = `
.menu-screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:30;background:radial-gradient(ellipse 70% 60% at 50% 42%,#26262e 0%,#1a1a1f 55%,#101014 100%);animation:menuIn .5s ease}
@keyframes menuIn{from{opacity:0}to{opacity:1}}
.menu-inner{display:flex;flex-direction:column;align-items:center;position:relative;padding-bottom:40px}
.menu-blade-fx{position:absolute;top:-150px;left:50%;transform:translateX(-50%);opacity:.9}
.menu-title{font-size:120px;font-weight:900;letter-spacing:26px;text-indent:26px;color:#f5ede0;text-shadow:0 0 60px rgba(212,168,83,.5),0 4px 0 #8e6a2a,0 8px 24px #000;margin-top:60px;background:linear-gradient(180deg,#fdf6e3 20%,#e8c67a 55%,#b98a3a 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 24px rgba(212,168,83,.45))}
.menu-subtitle{font-size:19px;color:#c9c2b4aa;letter-spacing:6px;margin:26px 0 58px}
.menu-start{pointer-events:auto;font-family:inherit;font-size:26px;font-weight:900;letter-spacing:12px;text-indent:12px;color:#f5ede0;background:linear-gradient(160deg,#3a2523,#2a1c1a);border:2px solid #d4a85399;border-radius:14px;padding:18px 74px;cursor:pointer;transition:all .22s ease;box-shadow:0 10px 30px -10px #000}
.menu-start:hover{transform:translateY(-3px);border-color:#f6c344;box-shadow:0 16px 40px -12px rgba(212,168,83,.5),0 0 0 1px #f6c344}
.menu-controls{display:flex;align-items:center;gap:14px;margin-top:54px;font-size:14px;color:#8a8a96}
.menu-controls i{width:1px;height:12px;background:#8a8a9655}
.menu-version{margin-top:20px;font-size:13px;color:#66666f;letter-spacing:2px}
  `;
  document.head.appendChild(css);
}

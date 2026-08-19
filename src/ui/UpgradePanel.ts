/**
 * UpgradePanel —— 升级三选一（DOM 覆盖层，设计方案 §UI-3）
 *
 * 三张竖版卡片：刀法卡青蓝描边 / 装备卡紫玉描边（M6 刀法线为主），
 * 键盘 1/2/3 快速选择，hover 上浮 + 微光扫过，弹性入场。
 */

import type { UpgradeOption } from '../data/upgrades';
import { WEIGHT_VALUE } from '../data/upgrades';

/** 流派配色（青蓝=疾风/紫=破刃/金=惊鸿/朱红=连击） */
const SCHOOL_STYLE: Record<string, { border: string; tag: string; name: string }> = {
  swift: { border: '#4fd1c5', tag: '疾风', name: '转速' },
  arc: { border: '#d4a853', tag: '惊鸿', name: '范围' },
  breaker: { border: '#9b6fd4', tag: '破刃', name: '拼刀' },
  combo: { border: '#c0392b', tag: '连击', name: '爆发' },
};

export class UpgradePanel {
  private root: HTMLElement | null = null;
  private cards: HTMLElement[] = [];
  private selection: ((index: number) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly overlay: HTMLElement) {}

  /** 显示三选一（战斗暂停由 BattleState 处理；此处仅 UI） */
  show(options: UpgradeOption[], taken: Map<string, number>, onPick: (i: number) => void): void {
    this.hide();
    this.selection = onPick;

    const root = document.createElement('div');
    root.className = 'upgrade-panel';
    root.innerHTML = `
      <div class="upgrade-title">刀法精进 · 三选一</div>
      <div class="upgrade-sub">按键 1 / 2 / 3 或点击选择</div>
      <div class="upgrade-cards"></div>
    `;
    const cardsWrap = root.querySelector('.upgrade-cards') as HTMLElement;
    this.cards = [];

    options.forEach((o, i) => {
      const style = SCHOOL_STYLE[o.school]!;
      const stacks = taken.get(o.id) ?? 0;
      const node = document.createElement('div');
      node.className = 'upgrade-card';
      node.style.setProperty('--card-border', style.border);
      node.innerHTML = `
        <div class="uc-top">
          <span class="uc-tag" style="background:${style.border}22;color:${style.border}">${style.tag} · ${style.name}</span>
          <span class="uc-type">${o.type === 'node' ? '节点' : `可叠加 ${stacks}/${o.maxStacks}`}</span>
        </div>
        <div class="uc-name">${o.name}</div>
        <div class="uc-effect">${o.effect}</div>
        ${o.reqLevel ? `<div class="uc-req">需 Lv${o.reqLevel}</div>` : ''}
        <div class="uc-key">${i + 1}</div>
      `;
      node.addEventListener('click', () => this.pick(i));
      cardsWrap.appendChild(node);
      this.cards.push(node);
    });

    // 键盘 1/2/3
    this.keyHandler = (e) => {
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.pick(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.pick(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') this.pick(2);
    };
    window.addEventListener('keydown', this.keyHandler);

    this.overlay.appendChild(root);
    this.root = root;
    // 弹性入场动画
    requestAnimationFrame(() => root.classList.add('shown'));
  }

  private pick(i: number): void {
    const cb = this.selection;
    if (cb && this.root) {
      this.selection = null;
      cb(i);
    }
  }

  hide(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.root?.remove();
    this.root = null;
    this.cards = [];
    this.selection = null;
  }

  get visible(): boolean {
    return this.root !== null;
  }
}

export function injectUpgradePanelStyles(): void {
  if (document.getElementById('upgrade-panel-styles')) return;
  const css = document.createElement('style');
  css.id = 'upgrade-panel-styles';
  css.textContent = `
.upgrade-panel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(26,26,31,.78);backdrop-filter:blur(6px);pointer-events:auto;z-index:20;opacity:0;transform:scale(.94);transition:opacity .22s ease,transform .22s cubic-bezier(.34,1.56,.64,1)}
.upgrade-panel.shown{opacity:1;transform:scale(1)}
.upgrade-title{font-size:44px;font-weight:900;color:#f5ede0;text-shadow:0 0 24px rgba(212,168,83,.55);letter-spacing:8px}
.upgrade-sub{font-size:16px;color:#d4a853cc;margin-bottom:18px}
.upgrade-cards{display:flex;gap:26px}
.upgrade-card{position:relative;width:230px;min-height:300px;background:linear-gradient(160deg,#242430 0%,#1c1c24 100%);border:2px solid var(--card-border,#4fd1c5);border-radius:16px;padding:22px 18px;cursor:pointer;display:flex;flex-direction:column;gap:12px;transition:transform .18s ease,box-shadow .18s ease;animation:cardIn .4s cubic-bezier(.34,1.56,.64,1) backwards}
.upgrade-card:nth-child(2){animation-delay:.07s}.upgrade-card:nth-child(3){animation-delay:.14s}
@keyframes cardIn{from{opacity:0;transform:translateY(34px) scale(.9)}to{opacity:1;transform:none}}
.upgrade-card::after{content:'';position:absolute;inset:0;border-radius:16px;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.07) 50%,transparent 70%);transform:translateX(-120%);transition:transform .6s ease}
.upgrade-card:hover{transform:translateY(-10px);box-shadow:0 18px 42px -12px var(--card-border),0 0 0 1px var(--card-border)}
.upgrade-card:hover::after{transform:translateX(120%)}
.uc-top{display:flex;justify-content:space-between;align-items:center}
.uc-tag{font-size:13px;font-weight:700;padding:3px 10px;border-radius:999px}
.uc-type{font-size:12px;color:#8a8a96}
.uc-name{font-size:30px;font-weight:900;color:#f5ede0;letter-spacing:2px}
.uc-effect{font-size:16px;line-height:1.6;color:#c9c2b4;flex:1}
.uc-req{font-size:12px;color:#d4a85399}
.uc-key{position:absolute;bottom:12px;right:14px;width:30px;height:30px;border-radius:8px;border:1.5px solid #f5ede033;display:flex;align-items:center;justify-content:center;font-weight:700;color:#f5ede0aa;font-size:15px}
  `;
  document.head.appendChild(css);
}

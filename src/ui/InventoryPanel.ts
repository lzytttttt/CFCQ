/**
 * InventoryPanel —— 背包装备界面（DOM 覆盖层，设计方案 §UI-4）
 *
 * 左侧五槽位（刀/甲/饰1/饰2/籍）+ 套装进度徽记；右侧背包列表（品质色边框）
 * 与词条明细；底部熔铸/强化按钮。按 B 开关。
 */

import type { EquipmentItem } from '../equipment/EquipmentGenerator';
import { formatAffix } from '../equipment/EquipmentGenerator';
import type { Inventory, SlotId } from '../equipment/Inventory';
import { FORGE_DIMENSIONS } from '../data/equipment';

const QUALITY_BORDER: Record<string, string> = {
  white: '#dddddd99',
  green: '#66ff66aa',
  blue: '#66ccffaa',
  purple: '#cc66ffaa',
  orange: '#ffcc66cc',
};

const SLOT_NAMES: Record<SlotId, string> = {
  blade: '刀具',
  armor: '护甲',
  accessory1: '饰品·一',
  accessory2: '饰品·二',
  tome: '秘籍',
};

export class InventoryPanel {
  private root: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private refresh: (() => void) | null = null;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly inventory: Inventory,
    private readonly bladeName: () => string,
    /** M8：刀具槽点击回调（循环切换刀具） */
    private onSwitchBlade: () => void = () => {},
  ) {}

  /** 当前刀具名（槽位刷新用） */
  private bladeNameText(): string {
    return this.bladeName();
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  get visible(): boolean {
    return this.root !== null;
  }

  show(): void {
    this.hide();
    const root = document.createElement('div');
    root.className = 'inv-panel';
    this.root = root;
    this.overlay.appendChild(root);
    this.render();
    // B 键开关统一由 BattleState toggle（避免双重监听竞争）
  }

  hide(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.root?.remove();
    this.root = null;
    this.refresh = null;
  }

  /** 全量重绘（数据变化后调用） */
  private render(): void {
    const root = this.root;
    if (!root) return;
    const inv = this.inventory;
    const stats = inv.aggregate();

    const slots = (['blade', 'armor', 'accessory1', 'accessory2', 'tome'] as SlotId[])
      .map((slot) => {
        const item = inv.equipped[slot];
        const locked = !inv.unlockedSlots.has(slot);
        const border = item ? QUALITY_BORDER[item.quality] : '#f5ede022';
        return `
        <div class="inv-slot ${locked ? 'locked' : ''}" data-slot="${slot}" style="border-color:${border}">
          <div class="is-name">${SLOT_NAMES[slot]}</div>
          ${slot === 'blade'
            ? `<div class="is-item">铁匠刀</div>`
            : item
              ? `<div class="is-item">${item.name}</div>
                 <div class="is-set">${item.set ? item.set : ''}</div>`
              : `<div class="is-empty">${locked ? '未解锁' : '空'}</div>`}
        </div>`;
      })
      .join('');

    const bagItems = inv.bag
      .map((item) => {
        const affixes = [item.main, ...item.subs]
          .map((a) => `<div class="ia-line">${formatAffix(a)}</div>`)
          .join('');
        return `
        <div class="inv-bagitem" data-uid="${item.uid}" style="border-color:${QUALITY_BORDER[item.quality]}">
          <div class="ib-head">
            <span class="ib-name">${item.name}</span>
            <span class="ib-lv">Lv${item.level}</span>
          </div>
          <div class="ib-affixes">${affixes}</div>
          <div class="ib-actions">
            <button class="ib-btn equip" data-uid="${item.uid}">穿戴</button>
            <button class="ib-btn salvage" data-uid="${item.uid}">熔铸</button>
          </div>
        </div>`;
      })
      .join('');

    const setBadges = stats.activeSets
      .map((s) => `<span class="set-badge">${s.name} ${s.pieces}件</span>`)
      .join('');

    const forgeRow = FORGE_DIMENSIONS.map(
      (d) =>
        `<button class="forge-btn" data-dim="${d.id}">${d.name} ${inv.forge[d.id] ?? 0}/${d.maxStacks}</button>`,
    ).join('');

    root.innerHTML = `
      <div class="inv-wrap">
        <div class="inv-title-row">
          <span class="inv-title">行囊 · 装备</span>
          <span class="inv-scrap">金属碎片 <b>${inv.scrap}</b></span>
          <span class="inv-hint">B 键 / 右下角按钮关闭</span>
        </div>
        <div class="inv-body">
          <div class="inv-left">
            <div class="inv-slots">${slots}</div>
            <div class="inv-sets">${setBadges || '<span class="set-none">未激活套装</span>'}</div>
            <div class="inv-forge">
              <div class="forge-title">装备刀强化</div>
              <div class="forge-row">${forgeRow}</div>
            </div>
          </div>
          <div class="inv-right">
            <div class="bag-count">${inv.bag.length}/24</div>
            <div class="inv-bag">${bagItems || '<div class="bag-empty">背包空空如也——击杀持刀怪与精英掉落装备</div>'}</div>
          </div>
        </div>
      </div>
    `;

    // 事件绑定：刀具槽点击循环切换（M8：Boss 掉刀收集）
    const bladeSlot = root.querySelector<HTMLElement>('[data-slot="blade"]');
    bladeSlot?.addEventListener('click', () => {
      this.onSwitchBlade();
      // 刷新槽位显示
      const nameEl = bladeSlot.querySelector('.is-item');
      if (nameEl) nameEl.textContent = this.bladeName();
    });

    root.querySelectorAll<HTMLElement>('.ib-btn.equip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = Number(btn.dataset.uid);
        const item = inv.bag.find((x) => x.uid === uid);
        if (!item) return;
        const slot: SlotId =
          item.part === 'armor' ? 'armor' : item.part === 'tome' ? 'tome' : 'accessory1';
        // 饰品优先空槽
        if (item.part === 'accessory' && !inv.equipped.accessory1) {
          inv.equip('accessory1', uid);
        } else if (item.part === 'accessory' && !inv.equipped.accessory2) {
          inv.equip('accessory2', uid);
        } else {
          inv.equip(slot, uid);
        }
        this.render();
      });
    });
    root.querySelectorAll<HTMLElement>('.ib-btn.salvage').forEach((btn) => {
      btn.addEventListener('click', () => {
        inv.salvage(Number(btn.dataset.uid));
        this.render();
      });
    });
    root.querySelectorAll<HTMLElement>('.forge-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        inv.forgeUpgrade(btn.dataset.dim as 'edge' | 'longArm' | 'thickBlade' | 'breaker');
        this.render();
      });
    });
    void this.bladeName;
  }
}

export function injectInventoryStyles(): void {
  if (document.getElementById('inv-panel-styles')) return;
  const css = document.createElement('style');
  css.id = 'inv-panel-styles';
  css.textContent = `
.inv-panel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(26,26,31,.82);backdrop-filter:blur(6px);pointer-events:auto;z-index:20;animation:fadeIn .18s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.inv-wrap{width:1060px;max-width:92%;background:linear-gradient(160deg,#232330,#1a1a22);border:1.5px solid #d4a85344;border-radius:18px;padding:26px 30px;box-shadow:0 30px 80px -30px #000}
.inv-title-row{display:flex;align-items:baseline;gap:18px;margin-bottom:18px}
.inv-title{font-size:30px;font-weight:900;color:#f5ede0;letter-spacing:6px}
.inv-scrap{font-size:16px;color:#d4a853}.inv-scrap b{font-size:20px}
.inv-hint{margin-left:auto;font-size:13px;color:#8a8a96}
.inv-body{display:flex;gap:26px}
.inv-left{width:340px;flex-shrink:0}
.inv-slots{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.inv-slot{background:#1c1c24;border:1.5px solid #f5ede022;border-radius:12px;padding:12px;min-height:86px;transition:border-color .2s}
.inv-slot.locked{opacity:.45}
.is-name{font-size:12px;color:#8a8a96;margin-bottom:6px}
.is-item{font-size:17px;font-weight:700;color:#f5ede0}
.is-set{font-size:12px;color:#4fd1c5;margin-top:3px}
.is-empty{font-size:14px;color:#55555f;margin-top:8px}
.inv-sets{margin-top:14px;min-height:30px;display:flex;gap:8px;flex-wrap:wrap}
.set-badge{font-size:13px;font-weight:700;color:#f6c344;border:1px solid #f6c34466;border-radius:999px;padding:4px 12px}
.set-none{font-size:13px;color:#55555f}
.inv-forge{margin-top:18px;background:#1c1c24;border-radius:12px;padding:14px}
.forge-title{font-size:14px;color:#d4a853;margin-bottom:10px;font-weight:700}
.forge-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.forge-btn{background:#2b2b38;border:1px solid #f5ede022;color:#c9c2b4;border-radius:8px;padding:8px 6px;font-size:13px;cursor:pointer;transition:all .15s}
.forge-btn:hover{border-color:#d4a853;color:#f5ede0}
.inv-right{flex:1;display:flex;flex-direction:column;min-width:0}
.bag-count{font-size:13px;color:#8a8a96;text-align:right;margin-bottom:8px}
.inv-bag{display:flex;flex-direction:column;gap:10px;max-height:520px;overflow-y:auto;padding-right:4px}
.inv-bag::-webkit-scrollbar{width:6px}.inv-bag::-webkit-scrollbar-thumb{background:#d4a85344;border-radius:3px}
.inv-bagitem{background:#1c1c24;border:1.5px solid #f5ede022;border-radius:12px;padding:12px 14px}
.ib-head{display:flex;justify-content:space-between;align-items:baseline}
.ib-name{font-size:16px;font-weight:700;color:#f5ede0}
.ib-lv{font-size:12px;color:#8a8a96}
.ib-affixes{margin:8px 0}
.ia-line{font-size:13px;color:#c9c2b4;line-height:1.7}
.ib-actions{display:flex;gap:8px}
.ib-btn{flex:1;background:#2b2b38;border:1px solid #f5ede022;color:#c9c2b4;border-radius:7px;padding:6px;font-size:13px;cursor:pointer;transition:all .15s}
.ib-btn:hover{color:#f5ede0;border-color:#d4a853}
.bag-empty{color:#55555f;font-size:14px;text-align:center;padding:40px 0}
.inv-toggle-btn{position:fixed;right:34px;bottom:30px;pointer-events:auto;z-index:21;background:linear-gradient(160deg,#2b2b38,#1c1c24);border:1.5px solid #d4a85366;color:#f5ede0;border-radius:12px;padding:12px 22px;font-size:17px;font-weight:700;font-family:'Alimama ShuHeiTi','Noto Sans SC','Microsoft YaHei',sans-serif;letter-spacing:2px;cursor:pointer;box-shadow:0 8px 24px -8px #000;transition:all .15s}
.inv-toggle-btn:hover{border-color:#f6c344;color:#f6c344}
.inv-toggle-btn:active{transform:translateY(1px)}
  `;
  document.head.appendChild(css);
}

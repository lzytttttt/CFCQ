/**
 * Dialog —— 剧情对话框（DOM 覆盖层，设计方案 §UI-6）
 *
 * 底部对话框：立绘色块 + 名字牌 + 逐字打印；E 键推进（M8 确认）——
 * 打印中按 E 先补全，补全后按 E 翻页。系统提示金色 / 独白斜体。
 */

import type { DialogLine } from '../data/story';

const SPEAKER_COLOR: Record<string, string> = {
  陈锋: '#c0392b',
  赵横: '#8e3a24',
  血禅师: '#7a3a8e',
  欧阳冶: '#b8722d',
  司马烈: '#3d6eb4',
  冷无缺: '#555a6e',
  天绝老人: '#d4a853',
  老者: '#7d8a7d',
  山贼头目: '#8e5a3a',
  群雄: '#8a8a96',
  系统: '#f6c344',
  字幕: '#d4a853',
};

export class Dialog {
  private root: HTMLElement | null = null;
  private queue: DialogLine[] = [];
  private currentText = '';
  private shown = 0;
  private typing = false;
  private done: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastTypeTime = 0;

  constructor(private readonly overlay: HTMLElement) {}

  /** 播放一组对话（onDone 全部结束时回调） */
  play(lines: readonly DialogLine[], onDone?: () => void): void {
    this.hide();
    if (lines.length === 0) {
      onDone?.();
      return;
    }
    this.queue = [...lines];
    this.done = onDone ?? null;

    const root = document.createElement('div');
    root.className = 'dialog-box';
    root.innerHTML = `
      <div class="dlg-portrait"></div>
      <div class="dlg-body">
        <div class="dlg-name"></div>
        <div class="dlg-text"></div>
        <div class="dlg-hint">[E] 继续</div>
      </div>
    `;
    this.overlay.appendChild(root);
    this.root = root;

    this.keyHandler = (e) => {
      if (e.code === 'KeyE' || e.code === 'Enter') this.advance();
    };
    window.addEventListener('keydown', this.keyHandler);

    this.showNext();
  }

  /** E 键推进：打印中补全 / 完毕后下一条 */
  advance(): void {
    if (!this.root) return;
    if (this.typing) {
      this.shown = this.currentText.length;
      this.typing = false;
      this.renderText();
      return;
    }
    this.showNext();
  }

  private showNext(): void {
    const line = this.queue.shift();
    if (!line) {
      const cb = this.done;
      this.hide(); // 注意：hide 会清 done，先取回调
      cb?.();
      return;
    }
    // 名字与立绘色
    const nameEl = this.root!.querySelector('.dlg-name') as HTMLElement;
    const portEl = this.root!.querySelector('.dlg-portrait') as HTMLElement;
    nameEl.textContent = line.speaker;
    nameEl.style.color = SPEAKER_COLOR[line.speaker] ?? '#f5ede0';
    portEl.style.background = `linear-gradient(160deg, ${SPEAKER_COLOR[line.speaker] ?? '#666'}33, ${SPEAKER_COLOR[line.speaker] ?? '#666'}66)`;
    portEl.style.borderColor = `${SPEAKER_COLOR[line.speaker] ?? '#666'}aa`;

    this.currentText = line.text;
    this.shown = 0;
    this.typing = true;
    this.isSystem = !!line.system;
    this.isNarration = !!line.narration;
    this.lastTypeTime = performance.now();
    this.renderText();
  }

  private isSystem = false;
  private isNarration = false;

  /** 每帧由宿主调用（驱动逐字打印） */
  tick(): void {
    if (!this.typing || !this.root) return;
    const now = performance.now();
    if (now - this.lastTypeTime < 24) return; // 约 42 字/秒
    this.lastTypeTime = now;
    this.shown = Math.min(this.currentText.length, this.shown + 1);
    if (this.shown >= this.currentText.length) this.typing = false;
    this.renderText();
  }

  private renderText(): void {
    const el = this.root!.querySelector('.dlg-text') as HTMLElement;
    el.textContent = this.currentText.slice(0, this.shown);
    el.classList.toggle('system', this.isSystem);
    el.classList.toggle('narration', this.isNarration);
    // 光标
    if (this.typing) el.textContent += '▏';
  }

  hide(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.root?.remove();
    this.root = null;
    this.queue = [];
    this.typing = false;
    this.done = null;
  }

  get visible(): boolean {
    return this.root !== null;
  }
}

export function injectDialogStyles(): void {
  if (document.getElementById('dialog-styles')) return;
  const css = document.createElement('style');
  css.id = 'dialog-styles';
  css.textContent = `
.dialog-box{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);width:1180px;max-width:94%;display:flex;gap:16px;background:linear-gradient(160deg,rgba(35,35,48,.96),rgba(26,26,31,.96));border:1.5px solid #d4a85366;border-radius:14px;padding:18px 22px;pointer-events:auto;z-index:25;animation:dlgIn .25s ease;box-shadow:0 18px 50px -18px #000}
@keyframes dlgIn{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.dlg-portrait{width:76px;height:100px;min-height:100px;border:2px solid #666;border-radius:10px;flex-shrink:0;background:#333}
.dlg-body{flex:1;position:relative;min-width:0}
.dlg-name{font-size:20px;font-weight:900;letter-spacing:2px;margin-bottom:8px}
.dlg-text{font-size:19px;line-height:1.75;color:#f5ede0;min-height:66px}
.dlg-text.narration{font-style:italic;color:#c9c2b4}
.dlg-text.system{color:#f6c344;font-weight:700}
.dlg-hint{position:absolute;right:0;bottom:-4px;font-size:12px;color:#d4a85399;animation:hintPulse 1.2s ease infinite}
@keyframes hintPulse{0%,100%{opacity:.4}50%{opacity:1}}
  `;
  document.head.appendChild(css);
}

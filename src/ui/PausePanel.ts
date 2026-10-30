export class PausePanel {
  private root: HTMLDivElement | null = null;

  constructor(private readonly host: HTMLElement, onResume: () => void) {
    const root = document.createElement('div');
    root.className = 'pause-panel';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '游戏已暂停');
    root.innerHTML = '<section class="pause-card"><h2>暂　停</h2><p>战斗已暂停</p><button type="button">继续游戏</button><small>按 ESC 继续</small></section>';
    root.querySelector('button')!.addEventListener('click', onResume);
    root.hidden = true;
    host.appendChild(root);
    this.root = root;
  }

  get visible(): boolean {
    return this.root !== null && !this.root.hidden;
  }

  show(): void { if (this.root) this.root.hidden = false; }
  hide(): void { if (this.root) this.root.hidden = true; }

  destroy(): void {
    this.root?.remove();
    this.root = null;
  }
}

export function injectPausePanelStyles(): void {
  if (document.getElementById('pause-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'pause-panel-styles';
  style.textContent = `
.pause-panel[hidden]{display:none!important}.pause-panel{position:absolute;inset:0;display:grid;place-items:center;background:rgba(12,14,20,.72);backdrop-filter:blur(5px);z-index:40;color:#f5ede0;pointer-events:auto}
.pause-card{min-width:280px;padding:30px 42px;text-align:center;background:linear-gradient(150deg,#292832,#1c1c24);border:1px solid #d4a85399;border-radius:16px;box-shadow:0 20px 60px #0009}
.pause-card h2{margin:0;color:#e7c77d;font-size:34px;letter-spacing:8px}.pause-card p{margin:12px 0 22px;color:#d4d0c8}
.pause-card button{border:1px solid #e7c77d;border-radius:8px;padding:11px 30px;background:#d4a853;color:#211d16;font:700 16px inherit;cursor:pointer}.pause-card button:hover{background:#efd28d}
.pause-card small{display:block;margin-top:14px;color:#aaa7a1}
`;
  document.head.appendChild(style);
}

export type EscapeAction = 'close-inventory' | 'resume' | 'pause' | 'ignore';
export function escapeAction(state: {
  inventory: boolean; paused: boolean; upgrade: boolean; dialog: boolean;
  dead: boolean; victory: boolean;
}): EscapeAction {
  if (state.inventory) return 'close-inventory';
  if (state.paused) return 'resume';
  if (state.upgrade || state.dialog || state.dead || state.victory) return 'ignore';
  return 'pause';
}

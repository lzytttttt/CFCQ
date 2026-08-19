/**
 * SaveLoad —— localStorage 存档（wiki/09-tech/架构设计.md rogue/SaveLoad）
 *
 * - 存档版本号 + 向前兼容迁移（执行注记：防清档）
 * - 图鉴进度（解锁刀具/小怪/Boss）跨局保留（游戏概述 §3：失败重开保留图鉴）
 * - 局内快照（关卡/房间/金币/玩家状态/背包）用于"继续闯荡"（同会话续玩）
 */

const SAVE_KEY = 'cfcq.save.v1';
const SAVE_VERSION = 1;

export interface CodexProgress {
  /** 已解锁刀具 id 集 */
  blades: Set<string>;
  /** 已遭遇小怪 id 集 */
  enemies: Set<string>;
  /** 已击败 Boss id 集 */
  bosses: Set<string>;
  /** 累计击杀 */
  totalKills: number;
  /** 最高到达关卡 */
  bestLevel: number;
  /** 拼刀胜利次数 */
  clashWins: number;
}

export interface RunSnapshot {
  level: number;
  roomIndex: number;
  gold: number;
  scrap: number;
  techLv: number;
  techExp: number;
  bladeLv: number;
  bladeExp: number;
  hp: number;
  takenOptions: Array<[string, number]>;
  /** 背包与穿戴（简化序列化：uid 剔除） */
  bag: SerializedItem[];
  equipped: Record<string, SerializedItem | undefined>;
  forge: Record<string, number>;
}

/** 装备序列化（AffixDef 引用转 id） */
export interface SerializedItem {
  part: string;
  name: string;
  quality: string;
  level: number;
  set: string | null;
  main: { id: string; value: number };
  subs: Array<{ id: string; value: number }>;
}

interface SaveData {
  version: number;
  codex: {
    blades: string[];
    enemies: string[];
    bosses: string[];
    totalKills: number;
    bestLevel: number;
    clashWins: number;
  };
  run: RunSnapshot | null;
}

export function emptyCodex(): CodexProgress {
  return {
    blades: new Set(),
    enemies: new Set(),
    bosses: new Set(),
    totalKills: 0,
    bestLevel: 1,
    clashWins: 0,
  };
}

export class SaveLoad {
  /** 读档（无存档/损坏返回空进度；版本不匹配走迁移） */
  static load(): { codex: CodexProgress; run: RunSnapshot | null } {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { codex: emptyCodex(), run: null };
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== SAVE_VERSION) {
        // 向前兼容迁移点（未来版本升级在此追加变换）
        return { codex: migrate(data), run: data.run ?? null };
      }
      return {
        codex: {
          blades: new Set(data.codex.blades),
          enemies: new Set(data.codex.enemies),
          bosses: new Set(data.codex.bosses),
          totalKills: data.codex.totalKills,
          bestLevel: data.codex.bestLevel,
          clashWins: data.codex.clashWins,
        },
        run: data.run ?? null,
      };
    } catch {
      // 损坏存档：视为无存档（防崩溃）
      return { codex: emptyCodex(), run: null };
    }
  }

  static save(codex: CodexProgress, run: RunSnapshot | null): void {
    try {
      const data: SaveData = {
        version: SAVE_VERSION,
        codex: {
          blades: [...codex.blades],
          enemies: [...codex.enemies],
          bosses: [...codex.bosses],
          totalKills: codex.totalKills,
          bestLevel: codex.bestLevel,
          clashWins: codex.clashWins,
        },
        run,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // 存储满/隐私模式：静默失败
    }
  }

  static clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* 忽略 */
    }
  }
}

/** 版本迁移骨架（当前只有 v1） */
function migrate(data: SaveData): CodexProgress {
  return {
    blades: new Set(data.codex?.blades ?? []),
    enemies: new Set(data.codex?.enemies ?? []),
    bosses: new Set(data.codex?.bosses ?? []),
    totalKills: data.codex?.totalKills ?? 0,
    bestLevel: data.codex?.bestLevel ?? 1,
    clashWins: data.codex?.clashWins ?? 0,
  };
}

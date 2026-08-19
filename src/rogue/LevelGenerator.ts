/**
 * LevelGenerator —— Rogue 关卡生成（wiki/07-level/关卡设计总览.md §5）
 *
 * - 每关 6-12 房间：固定首房（start）→ 随机中间房 → 固定关底（boss）
 * - 房间类型概率 §5.2：战斗 60% / 宝箱 12% / 商店 8% / 精英 10% / 事件 6% / 休息 4%
 * - 种子驱动（RNG fork），同种子同布局（§5.5）
 * - 房间模板：程序生成障碍布局 + 刷怪点（替代文档 8-15 手写模板）
 */

import { RNG } from '../core/RNG';
import { LEVELS_BY_ID, ROOM_KIND_WEIGHTS, type RoomKind } from '../data/levels';

export interface RoomLayout {
  kind: RoomKind;
  /** 障碍（世界坐标 AABB） */
  obstacles: Array<{ x: number; y: number; w: number; h: number }>;
  /** 刷怪点（波次内分配） */
  spawnPoints: Array<{ x: number; y: number }>;
  /** 宝箱/商店商品/事件点 */
  poi: { x: number; y: number } | null;
}

export interface LevelPlan {
  level: number;
  name: string;
  /** 房间序列（首尾固定） */
  rooms: RoomLayout[];
}

/** 世界尺寸（M1 确认：2400×1350） */
const WORLD_W = 2400;
const WORLD_H = 1350;

export class LevelGenerator {
  constructor(private readonly rng: RNG) {}

  /** 生成一关的完整房间序列 */
  generate(level: number): LevelPlan {
    const cfg = LEVELS_BY_ID.get(level)!;
    const roomCount = this.rng.nextInt(cfg.rooms[0], cfg.rooms[1]);
    const rooms: RoomLayout[] = [];

    // 首房（无怪，安全区）
    rooms.push(this.makeRoom('start', level));

    // 中间房按权重随机（保证至少 1 商店、1 精英——若房间数足够）
    const kinds: RoomKind[] = [];
    for (let i = 0; i < roomCount - 2; i++) {
      kinds.push(this.rollKind());
    }
    // 双向补齐：缺失类型替换不含另一保底类型的位置（避免互相覆盖）
    if (roomCount >= 6 && !kinds.includes('shop')) {
      const idx = kinds.findIndex((k) => k !== 'elite');
      if (idx >= 0) kinds[idx] = 'shop';
      else kinds[kinds.length - 1] = 'shop';
    }
    if (roomCount >= 6 && !kinds.includes('elite')) {
      const idx = kinds.findIndex((k) => k !== 'shop');
      if (idx >= 0) kinds[idx] = 'elite';
      else kinds[kinds.length - 1] = 'elite';
    }
    for (const kind of kinds) {
      rooms.push(this.makeRoom(kind, level));
    }

    // 关底（M7：精英替代 Boss；M8 换 Boss 房）
    rooms.push(this.makeRoom('boss', level));

    return { level, name: cfg.name, rooms };
  }

  /** 按权重 roll 房间类型（§5.2） */
  private rollKind(): RoomKind {
    const entries = Object.entries(ROOM_KIND_WEIGHTS).filter(([, w]) => w > 0) as Array<
      [RoomKind, number]
    >;
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.rng.next() * total;
    for (const [kind, w] of entries) {
      roll -= w;
      if (roll <= 0) return kind;
    }
    return 'battle';
  }

  /** 程序生成单个房间布局 */
  private makeRoom(kind: RoomKind, level: number): RoomLayout {
    const obstacles: RoomLayout['obstacles'] = [];
    const spawnPoints: RoomLayout['spawnPoints'] = [];
    let poi: RoomLayout['poi'] = null;

    if (kind === 'start') {
      // 起始房：无障碍无怪，简洁
      poi = { x: WORLD_W / 2, y: WORLD_H / 2 };
    } else if (kind === 'battle') {
      // 战斗房：2-4 个随机障碍 + 6-10 刷怪点
      const obCount = this.rng.nextInt(2, 4);
      for (let i = 0; i < obCount; i++) {
        obstacles.push(this.randomObstacle());
      }
      const spawnCount = this.rng.nextInt(6, 10);
      for (let i = 0; i < spawnCount; i++) {
        spawnPoints.push(this.randomSpawn());
      }
    } else if (kind === 'elite') {
      obstacles.push(this.randomObstacle());
      // 精英房：精英 + 2-4 杂兵
      spawnPoints.push({ x: WORLD_W / 2, y: WORLD_H / 2 - 150 });
      for (let i = 0; i < this.rng.nextInt(2, 4); i++) {
        spawnPoints.push(this.randomSpawn());
      }
    } else if (kind === 'treasure') {
      poi = { x: WORLD_W / 2, y: WORLD_H / 2 };
      obstacles.push(this.randomObstacle());
    } else if (kind === 'shop') {
      // 商店房：POI 在中上，1-3 商品位（商店逻辑在 RunProgress/BattleState）
      poi = { x: WORLD_W / 2, y: WORLD_H / 2 };
    } else if (kind === 'event') {
      poi = { x: WORLD_W / 2, y: WORLD_H / 2 };
    } else if (kind === 'rest') {
      poi = { x: WORLD_W / 2, y: WORLD_H / 2 };
    } else if (kind === 'boss') {
      // 关底房：开阔（无中央障碍）
      obstacles.push({ x: 300, y: 300, w: 120, h: 90 });
      obstacles.push({ x: WORLD_W - 420, y: WORLD_H - 390, w: 120, h: 90 });
      spawnPoints.push({ x: WORLD_W / 2, y: 350 });
      spawnPoints.push({ x: WORLD_W / 2, y: 350 });
    }

    return { kind, obstacles, spawnPoints, poi };
  }

  /** 随机障碍（避开中央出生区：玩家出生点 (200, H/2) 与房间中心 POI 区） */
  private randomObstacle(): { x: number; y: number; w: number; h: number } {
    // 中央禁放区（世界中心 ±350×±250）
    const cx = WORLD_W / 2, cy = WORLD_H / 2;
    let x = 0, y = 0, tries = 0;
    do {
      x = this.rng.nextInt(150, WORLD_W - 400);
      y = this.rng.nextInt(120, WORLD_H - 300);
      tries++;
    } while (
      tries < 20 &&
      x + 240 > cx - 350 && x < cx + 350 &&
      y + 160 > cy - 250 && y < cy + 250
    );
    return {
      x,
      y,
      w: this.rng.nextInt(80, 240),
      h: this.rng.nextInt(60, 160),
    };
  }

  /** 随机刷怪点（世界边缘环形分布） */
  private randomSpawn(): { x: number; y: number } {
    const side = this.rng.nextInt(0, 3);
    const margin = 140;
    switch (side) {
      case 0: return { x: this.rng.nextInt(margin, WORLD_W - margin), y: this.rng.nextInt(120, 320) };
      case 1: return { x: this.rng.nextInt(WORLD_W - 320, WORLD_W - margin), y: this.rng.nextInt(margin, WORLD_H - margin) };
      case 2: return { x: this.rng.nextInt(margin, WORLD_W - margin), y: this.rng.nextInt(WORLD_H - 320, WORLD_H - margin) };
      default: return { x: this.rng.nextInt(margin, 320), y: this.rng.nextInt(margin, WORLD_H - margin) };
    }
  }
}

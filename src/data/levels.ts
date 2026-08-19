/**
 * levels.ts —— 关卡配置（权威：wiki/07-level/关卡设计总览.md §2/§3/§5）
 *
 * 房间模板与 Rogue 生成器在 M7（rogue/LevelGenerator）实现；
 * 本文件录入每关基础配置：刷怪池/精英/房间数/时长/奖励/槽位解锁。
 */

export type RoomKind =
  | 'start'
  | 'battle'
  | 'elite'
  | 'boss'
  | 'treasure'
  | 'shop'
  | 'event'
  | 'rest';

export interface LevelData {
  level: number;
  name: string;
  theme: string;
  scene: string;
  /** 主刷怪池（enemies.ts id，按出现权重顺序） */
  spawnPool: string[];
  /** 精英怪 id */
  elite: string | null;
  /** 房间数范围 */
  rooms: [number, number];
  /** 单房间时长估算（秒） */
  roomDuration: [number, number];
  /** 同时在场敌人上限（小怪图鉴 §6.1） */
  maxOnField: number;
  /** 本关解锁槽位 */
  unlockSlot?: 'accessory1' | 'tome' | 'accessory2';
  /** 新机制引入说明 */
  newMechanics: string[];
  /** Boss id（bosses.ts） */
  bossId: string;
  /** 关卡通关奖励（金币在 Boss 奖励之外，通关奖励为经验：100×关卡） */
  desc: string;
}

export const LEVELS: readonly LevelData[] = [
  {
    level: 1, name: '铁匠惊变', theme: '灭门与起刀',
    scene: '破败铁匠铺 → 山间小道 → 黑风山下营地',
    spawnPool: ['lackey', 'hound', 'raider'],
    elite: null,
    rooms: [6, 8],
    roomDuration: [15, 20],
    maxOnField: 12,
    newMechanics: ['转刀基础', '拼刀入门'],
    bossId: 'zhaoheng',
    desc: '起始房父亲遗骸拾取铁匠刀，灭门回忆 → 握刀起誓 → 首杀寨主。',
  },
  {
    level: 2, name: '黑风剿匪', theme: '山寨清剿',
    scene: '黑风寨（木栅栏、营帐、瞭望塔）',
    spawnPool: ['lackey', 'thug', 'dualbandit', 'archer'],
    elite: 'banditlord',
    rooms: [7, 9],
    roomDuration: [15, 20],
    maxOnField: 12,
    unlockSlot: 'accessory1',
    newMechanics: ['持刀小怪', '远程弓手', '饰品槽'],
    bossId: 'bloodmaster',
    desc: '商店房首次出现；寨中线索指向断魂谷邪教。',
  },
  {
    level: 3, name: '断魂险谷', theme: '邪教毒域',
    scene: '险峻山谷、毒雾弥漫、邪教祭坛',
    spawnPool: ['thug', 'cultist', 'bloodmonk', 'poisondart'],
    elite: 'bloodmonk',
    rooms: [8, 10],
    roomDuration: [18, 22],
    maxOnField: 18,
    unlockSlot: 'tome',
    newMechanics: ['毒域', '自爆', '秘籍槽', '场地机制'],
    bossId: 'ouyangye',
    desc: '毒雾区环境伤害；欧阳冶赠破镜重圆（剧情刀）。',
  },
  {
    level: 4, name: '铸剑山庄', theme: '故友与试炼',
    scene: '铸剑山庄（熔炉、剑库、演武场）',
    spawnPool: ['ghostblade', 'flyingknifer', 'ironguard'],
    elite: 'ironguard',
    rooms: [8, 10],
    roomDuration: [18, 22],
    maxOnField: 18,
    unlockSlot: 'accessory2',
    newMechanics: ['飞刀拦截', '精英护卫', '第二饰品'],
    bossId: 'simalie',
    desc: '飞刀拦截挑战房；司马烈与伪盟主勾结，揭露篡位阴谋。',
  },
  {
    level: 5, name: '神刀问道', theme: '名门挑战',
    scene: '神刀门（刀碑林、藏刀阁、论刀台）',
    spawnPool: ['disciple', 'flyingknifer', 'swordslave'],
    elite: 'swordslave',
    rooms: [9, 11],
    roomDuration: [20, 25],
    maxOnField: 24,
    newMechanics: ['剑奴', '禁刀域概念', '多刀成型'],
    bossId: 'lengwuque',
    desc: '多刀技能保底掉落；冷无缺即伪盟主，主角直面篡位者。',
  },
  {
    level: 6, name: '武林问鼎', theme: '终极对决',
    scene: '武林大会会场（高台、旗帜、观战席）',
    spawnPool: ['lackey', 'hound', 'raider', 'thug', 'dualbandit', 'archer', 'banditlord', 'cultist', 'bloodmonk', 'poisondart', 'ghostblade', 'flyingknifer', 'disciple', 'ironguard', 'swordslave'],
    elite: 'swordslave',
    rooms: [10, 12],
    roomDuration: [20, 25],
    maxOnField: 24,
    newMechanics: ['全机制综合', '终极Boss 4 阶段'],
    bossId: 'tianjue',
    desc: '决赛前商店最终补给；刀具二选一（屠龙刀/千叶流光刀）；问鼎盟主。',
  },
] as const;

export const LEVELS_BY_ID: ReadonlyMap<number, LevelData> = new Map(
  LEVELS.map((l) => [l.level, l]),
);

/** 房间类型出现概率（关卡设计 §5.2；生成器 M7 使用） */
export const ROOM_KIND_WEIGHTS: Readonly<Record<RoomKind, number>> = {
  start: 0, // 固定首房间，不参与随机
  battle: 0.6,
  elite: 0.1,
  boss: 0, // 固定末房间
  treasure: 0.12,
  shop: 0.08,
  event: 0.06,
  rest: 0.04,
};

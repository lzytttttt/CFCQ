/**
 * bosses.ts —— 全 Boss 数据（权威：wiki/06-balance/属性总表.md §6 + Boss设计.md §4）
 *
 * M4 裁决（用户确认）：只录基础属性 + 阶段定义（HP 阈值/行为描述/技能名），
 * 技能详细参数（伤害/前摇/CD/弹道）M8 实现时随机制设计一并结构化。
 */

export interface BossStage {
  /** 阶段序号（1 起） */
  index: number;
  /** HP 上界（%1.0 = 100%） */
  hpFrom: number;
  /** HP 下界（%0.0） */
  hpTo: number;
  /** 行为模式描述（M8 结构化为行为树/技能循环） */
  behavior: string;
  /** 涉及技能名（M8 结构化） */
  skills: string[];
  /** 阶段专属拼刀规则描述 */
  clashRule?: string;
}

export interface BossData {
  id: string;
  name: string;
  title: string;
  /** 所属关 */
  level: number;
  hp: number;
  speed: number;
  /** 接触/技能伤害（多值为不同技能，M8 结构化细分） */
  damages: number[];
  /** 刀长/刀宽/ω(rad/s)/Q */
  blade: { length: number; width: number; omega: number; quality: number };
  /** 双刀（司马烈；天绝老人阶段3 取第二把刀动量×1.5） */
  dual?: boolean;
  stages: BossStage[];
  /** 击杀奖励：掉落刀具 id（blades.ts） */
  rewardBlades: string[];
  /** 击杀奖励：金币 */
  rewardGold: number;
  /** 击杀奖励：金属碎片 */
  rewardScrap: number;
  /** 破刀抗性（Boss设计.md §3.2：部分 Boss 破刀触发率减半） */
  breakResist?: boolean;
  desc: string;
}

export const BOSSES: readonly BossData[] = [
  {
    id: 'zhaoheng', name: '赵横', title: '黑风寨主', level: 1,
    hp: 800, speed: 80, damages: [18, 28],
    blade: { length: 90, width: 7, omega: 3.14, quality: 1.15 },
    stages: [
      { index: 1, hpFrom: 1.0, hpTo: 0.6, behavior: '追踪玩家 + 周期横扫（前摇0.6s 扇形打击）', skills: ['sweep'] },
      { index: 2, hpFrom: 0.6, hpTo: 0.0, behavior: '增加冲锋（蓄力1s 直线冲撞，可被拼刀打断），移速+20%', skills: ['sweep', 'charge'], clashRule: '冲锋前摇为拼刀窗口（胜率+0.15）' },
    ],
    rewardBlades: ['jinggang'], rewardGold: 200, rewardScrap: 20,
    desc: '山匪头领，灭门仇人之一，主角首杀。',
  },
  {
    id: 'bloodmaster', name: '血禅师', title: '断魂谷邪教首领', level: 2,
    hp: 1200, speed: 70, damages: [16, 20, 24],
    blade: { length: 85, width: 6, omega: 3.49, quality: 1.3 },
    stages: [
      { index: 1, hpFrom: 1.0, hpTo: 0.55, behavior: '施毒（毒域减速+持续伤害）+ 挥刀', skills: ['poisonField', 'slash'] },
      { index: 2, hpFrom: 0.55, hpTo: 0.0, behavior: '召唤 2 只血刀僧 + 血刀斩（远程弧形刀光）', skills: ['summon', 'bloodSlash'], clashRule: '血刀斩弹道可被玩家刀体击碎（瞬时拼刀，胜率固定 70%）' },
    ],
    rewardBlades: ['yanling'], rewardGold: 300, rewardScrap: 30,
    desc: '邪教首领，掌控断魂谷。',
  },
  {
    id: 'ouyangye', name: '欧阳冶', title: '铸剑老人', level: 3,
    hp: 1800, speed: 65, damages: [24, 35],
    blade: { length: 110, width: 10, omega: 2.79, quality: 1.5 },
    stages: [
      { index: 1, hpFrom: 1.0, hpTo: 0.65, behavior: '场地两侧熔炉喷火（灼烧区域）+ 挥重刀', skills: ['forgeFire', 'heavySlash'] },
      { index: 2, hpFrom: 0.65, hpTo: 0.3, behavior: '重击（前摇1.2s 大范围震击+击退）', skills: ['heavyStrike'], clashRule: '重击前摇为拼刀窗口（胜率+0.2），成功拼刀可打断' },
      { index: 3, hpFrom: 0.3, hpTo: 0.0, behavior: '熔炉全面喷发（安全区缩小），狂暴移速+30%', skills: ['forgeFire', 'heavySlash', 'enrage'] },
    ],
    rewardBlades: ['xuantie', 'pojing'], rewardGold: 400, rewardScrap: 40,
    desc: '铸剑山庄庄主，主角父亲的故友，亦敌亦师。',
  },
  {
    id: 'simalie', name: '司马烈', title: '神刀门主', level: 4,
    hp: 2600, speed: 85, damages: [22, 30],
    blade: { length: 95, width: 7, omega: 3.84, quality: 1.5 },
    dual: true,
    stages: [
      { index: 1, hpFrom: 1.0, hpTo: 0.6, behavior: '双刀旋转追踪 + 间歇冲刺斩', skills: ['dashSlash'] },
      { index: 2, hpFrom: 0.6, hpTo: 0.25, behavior: '刀阵（6 把旋转飞刀环绕自身）', skills: ['bladeStorm'] },
      { index: 3, hpFrom: 0.25, hpTo: 0.0, behavior: '刀阵飞出（6 把飞刀射向玩家）+ 双刀加速', skills: ['bladeStormBurst'], clashRule: '刀阵飞刀可被拼刀击碎（每把独立判定）；本体正面拼刀劣势大' },
    ],
    rewardBlades: ['longlin'], rewardGold: 500, rewardScrap: 50,
    desc: '武林大派掌门，与伪盟主勾结。',
  },
  {
    id: 'lengwuque', name: '冷无缺', title: '伪盟主', level: 5,
    hp: 3600, speed: 90, damages: [26, 32],
    blade: { length: 100, width: 8, omega: 4.19, quality: 1.5 },
    stages: [
      { index: 1, hpFrom: 1.0, hpTo: 0.6, behavior: '高速斩击 + 瞬移背刺', skills: ['teleportStab'] },
      { index: 2, hpFrom: 0.6, hpTo: 0.3, behavior: '影分身（2 个，动量 50%，HP1 点）', skills: ['shadowClone'], clashRule: '影分身可被拼刀一击破（动量低）' },
      { index: 3, hpFrom: 0.3, hpTo: 0.0, behavior: '禁刀域（中央区域玩家刀体停转）+ 狂暴连斩', skills: ['bladeBanField', 'comboSlash'], clashRule: '禁刀域内无法拼刀；本体抓瞬移落地 0.5s 硬直拼刀' },
    ],
    rewardBlades: ['huxiao'], rewardGold: 800, rewardScrap: 60,
    desc: '篡位盟主，主角复仇关键目标。',
  },
  {
    id: 'tianjue', name: '天绝老人', title: '武林盟主（最终Boss）', level: 6,
    hp: 5000, speed: 85, damages: [30, 40, 35],
    blade: { length: 115, width: 9, omega: 4.01, quality: 1.8 },
    stages: [
      { index: 1, hpFrom: 1.0, hpTo: 0.7, behavior: '沉稳剑术：单刀挥击 + 气劲波（远程）', skills: ['swordWave'], clashRule: '气劲波可被拼刀抵消' },
      { index: 2, hpFrom: 0.7, hpTo: 0.4, behavior: '万刃风暴（高速旋转刀光风暴，范围大）', skills: ['stormBurst'], clashRule: '风暴期间 Boss 无敌，玩家只能走位' },
      { index: 3, hpFrom: 0.4, hpTo: 0.15, behavior: '双刀模式（第二把刀，动量×1.5）', skills: ['dualBlade'], clashRule: '双刀正面拼刀极劣势，抓交替间隙' },
      { index: 4, hpFrom: 0.15, hpTo: 0.0, behavior: '终式·天绝：全场刀光雨 + 瞬移斩', skills: ['bladeRain', 'teleportSlash'], clashRule: '刀光雨每波可拼刀击碎，连成3次触发破防（Boss 受伤+100%）' },
    ],
    rewardBlades: ['tulong', 'cangfeng'], rewardGold: 1000, rewardScrap: 100,
    desc: '武林盟主，全书最强，主角问鼎之路的终极对手。',
  },
] as const;

export const BOSSES_BY_ID: ReadonlyMap<string, BossData> = new Map(
  BOSSES.map((b) => [b.id, b]),
);

export const BOSSES_BY_LEVEL: ReadonlyMap<number, BossData> = new Map(
  BOSSES.map((b) => [b.level, b]),
);

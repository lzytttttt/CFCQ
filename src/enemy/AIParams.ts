/**
 * AIParams —— 小怪行为参数（M5 预读用户确认的补值套餐）
 *
 * 文档只给行为标签（小怪图鉴 §5），以下参数为确认值，已回写 WIKI。
 */

/** 恶犬冲刺 */
export const HOUND_DASH = {
  cooldown: 4,
  windup: 0.4,
  speed: 300,
  duration: 0.5,
} as const;

/** 邪教徒自爆 */
export const CULTIST_SUICIDE = {
  triggerDist: 60,
  fuse: 1.0, // 前摇（发光预警）
  damageMult: 3,
  blastRadius: 90,
} as const;

/** 流氓打手近身 AOE */
export const THUG_AOE = {
  windup: 0.6,
  range: 80, // 前摇结束时的打击半径（含玩家半径判定）
} as const;

/** 铁甲护卫冲撞 */
export const GUARD_DASH = {
  cooldown: 6,
  windup: 0.8,
  speed: 260,
  duration: 0.7,
} as const;

/** 剑奴冲刺 */
export const SLAVE_DASH = {
  cooldown: 5,
  windup: 0.5,
  speed: 320,
  duration: 0.5,
} as const;

/** 远程怪通用（弓箭手/毒镖手/飞刀客） */
export const RANGED = {
  range: 500, // 射程
  preferMin: 300, // 走位区间下限
  preferMax: 500, // 走位区间上限
  projectileSpeed: 350, // 弹速 px/s
  shootInterval: [2.5, 3.5] as const, // 攻击间隔随机区间
} as const;

/** 飞刀瞬时拼刀胜率（M5 确认：沿用血刀斩 70% 先例） */
export const KNIFE_CLASH_WIN_RATE = 0.7;

/** 蓄力视觉预警时长下限（低于此不显示，避免闪烁） */
export const WINDUP_WARN_MIN = 0.15;

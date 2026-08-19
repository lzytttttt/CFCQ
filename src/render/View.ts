/**
 * 视口与世界尺寸常量
 *
 * 已与产品确认的适配方案：
 * - 视口固定逻辑分辨率 1920x1080，窗口变化时等比缩放居中（letterbox）
 * - 世界尺寸 2400x1350（wiki/02-combat/碰撞引擎设计.md §3.1 的示例场景），
 *   相机视口 1920x1080 跟随玩家；具体尺寸由关卡配置传入，引擎不硬编码
 */

/** 视口宽（逻辑像素） */
export const VIEW_W = 1920;

/** 视口高（逻辑像素） */
export const VIEW_H = 1080;

/** 基准世界宽（碰撞引擎设计 §3.1 示例场景） */
export const DEFAULT_WORLD_W = 2400;

/** 基准世界高 */
export const DEFAULT_WORLD_H = 1350;

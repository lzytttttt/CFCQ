# CFCQ（藏锋出鞘）

版本：**0.2.2**

《藏锋出鞘》是一款 **Rogue 转刀动作游戏**（HTML5 Canvas 2D + TypeScript 自研轻量引擎）。玩家仅需 **WASD** 移动，角色手持刀具自动旋转攻敌，在走位中打出华丽旋转斩击。每次通关后从升级选项挑选强化，通过 **拼刀** 机制与携带刀具的敌人正面博弈，一路从铁匠铺战至武林大会问鼎盟主。

## 核心特性

- **操作极简**：只有 WASD 移动即战斗
- **双线成长**：刀法（技巧）与刀具（器刃）独立升级
- **拼刀博弈**：双方刀具相撞，凭体积与转速定胜负
- **装备 Build**：刀具图鉴、套装词条、多样化流派
- **Rogue 结构**：随机关卡、随机升级、每局皆不同

## 技术栈

| 项目 | 选型 |
| --- | --- |
| 引擎 | HTML5 Canvas 2D + TypeScript（无第三方游戏引擎，自研轻量框架） |
| 碰撞引擎 | 自研 2D 碰撞系统（旋转线段扫掠检测 + 空间分区） |
| 渲染 | Canvas 2D Context 分层渲染 |
| 游戏循环 | requestAnimationFrame + 固定时间步长物理更新 |
| 构建/测试 | Vite 7 + Vitest 3 + TypeScript 5.8（strict） |

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 生产构建（含类型检查）
npm run build

# 运行单元测试
npm test
```

### 固定随机种子（调试/测试）

启动游戏时可在 URL 添加 `?seed=<0..4294967295>`，例如 `http://localhost:5173/?seed=12345`，以复现相同的随机序列和关卡布局。省略参数时仍使用时间种子；非法或超范围的值也会安全回退到时间种子。此参数只控制使用共享 RNG 的随机过程（包括关卡生成），不保证不同版本或代码变更后的游戏过程完全一致。

### 浏览器冒烟与自动实玩

浏览器测试独立于 `npm test`，需要 Python Playwright 和 Chromium。先安装依赖并启动开发服务器：

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
npm run dev
```

在另一终端运行：

```bash
python3 tests/browser-smoke.py
python3 tests/browser-playtest.py
```

冒烟脚本用调试状态注入检查 Boss、死亡和胜利，不等于自然通关。自动实玩脚本在浏览器中发送按键并读取调试状态导航，默认并行运行五个种子，单局最多 150 秒，记录写入 `cfcq-playtest-results.json`；这不替代真人试玩。可通过环境变量 `CFCQ_URL` 指定服务器、`CFCQ_CHROMIUM` 指定浏览器可执行文件、`CFCQ_MAX_SECONDS` 设置时限、`CFCQ_PLAYTEST_OUTPUT` 指定记录文件。

本次测试结果见 [P1 浏览器实玩记录](wiki/11-report/P1-浏览器实玩记录-20261030.md)。

## 目录结构

```
.
├── index.html              # 入口页面
├── src/                    # 游戏源码（TypeScript）
│   ├── core/               # 游戏循环、上下文、事件总线
│   ├── combat/             # 转刀、碰撞、拼刀战斗逻辑
│   ├── physics/            # 2D 碰撞引擎
│   ├── entity/             # 实体基类
│   ├── player/             # 玩家转刀战斗闭环
│   ├── enemy/              # 敌人 AI 与弹道
│   ├── equipment/          # 装备/套装/词条
│   ├── upgrade/            # 升级系统
│   ├── rogue/              # 随机关卡生成
│   ├── states/             # 游戏状态机
│   ├── render/             # 渲染管线、粒子、动画
│   ├── ui/                 # DOM UI 面板
│   ├── input/              # 输入处理
│   ├── data/               # 全量数值配置（刀具/敌人/Boss/关卡/升级/词条）
│   ├── math/               # 数学工具
│   ├── debug/              # 调试工具
│   └── main.ts             # 启动入口
├── tests/                  # Vitest 单元测试
├── wiki/                   # 游戏设计、数值、技术文档（详见 wiki/README.md）
│   ├── 01-game-concept/    # 游戏概念
│   ├── 02-combat/          # 战斗与碰撞
│   ├── 03-equipment/       # 装备系统
│   ├── 04-upgrade/         # 升级系统
│   ├── 05-enemy/           # 敌人与 Boss
│   ├── 06-balance/         # 数值平衡
│   ├── 07-level/           # 关卡设计
│   ├── 08-story/           # 世界观与剧情
│   ├── 09-tech/            # 技术实现指南
│   ├── 10-art/             # 美术资源需求
│   └── 11-report/          # 开发里程碑报告
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── VERSION
```

项目完整的设计文档与文档目录树，详见 [`wiki/README.md`](wiki/README.md)。

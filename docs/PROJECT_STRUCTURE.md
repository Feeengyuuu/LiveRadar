# LiveRadar 项目结构说明

## 📁 最新项目架构 (2026-01-11 优化)

### 核心目录结构

```
src/
├── api/                      # API 层 - 平台接口
│   ├── platform-adapter.js   # 平台适配器
│   ├── platform-sniffers.js  # 平台嗅探器
│   └── proxy-manager.js      # 代理管理器
│
├── config/                   # 配置层
│   ├── constants.js          # 常量定义
│   ├── proxies.js            # 代理配置
│   ├── signer.js             # API 签名工具
│   └── ui-strings.js         # UI 字符串
│
├── core/                     # 核心层 - 应用引擎
│   ├── bootstrap.js          # 应用启动引导
│   ├── file-protocol-warning.js
│   ├── globals.js            # 全局函数暴露
│   ├── init.js               # 初始化逻辑
│   ├── refresh-manager.js    # 刷新管理
│   ├── renderer.js           # 渲染引擎
│   ├── state.js              # 状态管理
│   └── status-fetcher.js     # 状态获取
│
├── features/                 # 功能模块 (重组后) ✨
│   ├── core/                 # 核心功能（必需）
│   │   ├── index.js          # Barrel 导出
│   │   ├── auto-refresh.js   # 自动刷新
│   │   ├── import-export.js  # 导入导出
│   │   ├── notifications.js  # 通知系统
│   │   ├── room-management.js # 房间管理
│   │   └── status-ticker.js  # 状态滚动
│   │
│   ├── enhancements/         # 增强功能（可选）
│   │   ├── index.js          # Barrel 导出
│   │   ├── music-player.js   # 音乐播放器
│   │   ├── region-detector.js # 地区检测
│   │   └── snow-effect.js    # 雪花特效
│   │
│   └── audio/                # 音频模块
│       ├── audio-manager.js
│       └── notification-audio.js
│
├── styles/                   # 样式层
│   ├── components/           # 组件样式
│   ├── effects/              # 特效样式
│   ├── main.css              # 主入口
│   ├── responsive.css        # 响应式样式
│   └── mobile-optimized.css  # 移动端优化
│
├── types/                    # 类型定义
│   └── index.js
│
├── utils/                    # 工具层
│   ├── data-differ.js
│   ├── device-detector.js
│   ├── dom-cache.js
│   ├── error-handler.js
│   ├── event-manager.js
│   ├── helpers.js
│   ├── lazy-image.js
│   ├── logger.js
│   ├── performance-detector.js
│   ├── proxy-pool-manager.js
│   ├── resource-manager.js
│   └── safe-storage.js
│
└── main.js                   # 主入口文件
```

## 🔄 最近的架构优化

### 1. Features 目录重组 (2026-01-11)

**变更内容：**
- 将 `src/features/` 下的文件重组为 `core/` 和 `enhancements/` 两个子目录
- 核心功能（必需）移至 `features/core/`
- 增强功能（可选）移至 `features/enhancements/`

**优势：**
- ✅ 职责更清晰：核心功能与增强功能分离
- ✅ 代码分割：未来可按需加载增强功能
- ✅ 维护性：新功能容易归类

**Barrel 导出：**
每个子目录包含 `index.js` 用于统一导出：
```javascript
// features/core/index.js
export { initAutoRefresh } from './auto-refresh.js';
export { initNotifications } from './notifications.js';
// ...

// features/enhancements/index.js
export { initMusicPlayer } from './music-player.js';
export { initSnow } from './snow-effect.js';
// ...
```

### 2. 清理归档文件

删除了 `archive/` 目录，包含：
- 旧图片文件
- 过时的项目结构文档
- 临时导入资源

## 📊 模块职责说明

### Core Features (核心功能)
**位置：** `src/features/core/`

| 模块 | 职责 | 依赖 |
|------|------|------|
| auto-refresh.js | 自动刷新功能 | SafeStorage, DOM Cache |
| import-export.js | 房间数据导入导出 | State |
| notifications.js | 浏览器通知系统 | State, Device Detector |
| room-management.js | 房间增删改查 | SafeStorage, State |
| status-ticker.js | 状态滚动播报 | State, DOM Cache |

### Enhancement Features (增强功能)
**位置：** `src/features/enhancements/`

| 模块 | 职责 | 依赖 |
|------|------|------|
| music-player.js | 背景音乐播放器 | SafeStorage (26KB) |
| region-detector.js | 地区检测与切换 | SafeStorage, Config |
| snow-effect.js | 雪花特效 | SafeStorage, Resource Manager (14KB) |

**注意：** 增强功能体积较大（共40KB），未来可考虑按需加载以优化首屏性能。

## 🎨 样式文件说明

项目使用两个响应式样式文件：

1. **responsive.css** - 通用响应式设计
   - 移动端、平板、桌面的基础适配
   - 无障碍支持（减少动画、高对比度）
   - 深色模式支持

2. **mobile-optimized.css** - 专门的移动端优化
   - iPhone 优化设计
   - 触摸交互优化
   - 水平滚动控制栏
   - 极致紧凑布局

**为什么保留两个文件？**
- `responsive.css` 提供全平台基础适配
- `mobile-optimized.css` 在移动端提供更细致的体验优化
- 加载顺序确保移动端样式覆盖基础样式

## 🔧 导入路径规范

### 在 `features/core/` 或 `features/enhancements/` 中导入：

```javascript
// ✅ 正确 - 使用 ../../ 回到 src 目录
import { SafeStorage } from '../../utils/safe-storage.js';
import { getState } from '../../core/state.js';
import { APP_CONFIG } from '../../config/constants.js';

// ❌ 错误 - 少了一层
import { SafeStorage } from '../utils/safe-storage.js';
```

### 在其他模块中导入 features：

```javascript
// ✅ 推荐 - 使用 barrel 导出
import { initAutoRefresh, initNotifications } from '../features/core/index.js';
import { initSnow, initMusicPlayer } from '../features/enhancements/index.js';

// ✅ 也可以 - 直接导入
import { initAutoRefresh } from '../features/core/auto-refresh.js';
```

## 📈 未来优化建议

### 短期 (1-2周)
- [ ] 拆分 `renderer.js` (当前25KB，可拆分为多个子模块)
- [ ] 移除 `globals.js` 的全局命名空间污染（使用事件委托）
- [ ] 配置 Vite 代码分割（enhancements 可按需加载）

### 中期 (1个月)
- [ ] 实现增强功能的懒加载
- [ ] 添加单元测试框架 (Vitest)
- [ ] 优化静态资源大小（图标文件）

### 长期 (3-6个月)
- [ ] 考虑 TypeScript 迁移
- [ ] 评估轻量级框架（Lit / Alpine.js）
- [ ] 建立 CI/CD 流程

## 📚 相关文档

- [架构分析](./ARCHITECTURE_ANALYSIS.md)
- [部署清单](./DEPLOYMENT_CHECKLIST.md)
- [迁移状态](./MIGRATION_STATUS.md)

---

**最后更新：** 2026-01-11
**当前版本：** LiveRadar v3.1.1

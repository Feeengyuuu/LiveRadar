# LiveRadar 项目优化建议报告

生成日期：2026-04-18
基于对 `src/`、`vite.config.js`、`index.html`、`package.json`、`dist/` 的扫描，以下按优先级给出可操作的优化点。

---

## P0 —— 确定性收益，动手成本低

### 1. 移除未使用的 crypto-js 依赖（✅ 明确死代码）
- `package.json` 里有 `"crypto-js": "^4.2.0"`，`index.html` 里又通过 CDN `<script>` 加载一份 `crypto-js 4.1.1`。
- `src/` 里 `grep -i crypto` 零命中，`CryptoJS` 也零命中；`config/signer.js` 早已简化成只读 `did`。
- 结果：~60KB 的 CDN JS 被每个用户白下载一次，且 `vite.config.js` 还为它预留了 `vendor-crypto` chunk。
- **建议**：删掉 `index.html` 里的 `<script src="...crypto-js...">`、`package.json` 里的依赖、`vite.config.js` 里的 `vendor-crypto` 分块规则，以及 CSP 里不需要的 `cdnjs.cloudflare.com`（能顺手收紧 `script-src`）。

### 2. 内联 `onclick=` + 全局 window 函数
- `features/core/import-export.js` 里用 `window.doImport / window.closeImportDialog / onclick="..."` 构造对话框；`core/globals.js` 还挂了 `showToast / toggleFavorite` 到 window。
- 项目已经有 `event-manager.js` 事件委托体系，但这几处没用上，留了 XSS 面。
- **建议**：用 `event-manager` 委托 + `data-action` 属性替代；同时把对话框 HTML 拆成 template 片段，避免在 `innerHTML` 里拼业务字段。

### 3. 持久 snapshot 型状态的写入仍是同步的
`state.js` 已经给 `rooms / roomDataCache / proxyStats / previousLiveStatus` 上了防抖，但 `updateSearchHistory / updateNotificationsEnabled / updateAutoRefreshEnabled / updateKeepAliveEnabled / updateSnowEnabled / updateProxyStats` 依旧是直 `SafeStorage.setItem/JSON`。这些虽不高频，但可以统一走 `debouncedStorageWrite`，让 `flushPendingStorageWrites` 成为唯一的“强制落盘”入口，更一致。

---

## P1 —— 结构与可维护性

### 4. 超大单文件拆分
- `features/enhancements/music-player.js` 795 行、`snow-effect.js` 660 行、`utils/error-handler.js` 612 行、`utils/safe-storage.js` 578 行、`api/proxy-manager.js` 571 行、`core/state.js` 563 行。
- 尤其 `music-player.js`，播放核心、拖动交互、播放列表 UI、最小化动画全揉一块；建议拆成 `player-core / playlist-ui / drag-handlers / persistence`，和 `renderer/` 当初的拆法一致。
- `error-handler.js` 里 `AppError` 类族、重试、断路器三件套其实是独立模块，可按职责拆。

### 5. 测试覆盖极低
- `src/**/__tests__/` 只有 `helpers.test.js` 和 `image-handler.test.js`。
- 像 `proxy-manager`（多层降级策略）、`state.js`（防抖 + 订阅通知）、`data-differ`、`error-handler`（断路器/重试）这种纯逻辑模块最该有测试，ROI 最高。
- `package.json` 里 vitest/coverage 都已就绪，只差写。

### 6. `innerHTML` 集中化与安全
总共 11 处 `innerHTML =`，虽然大部分内容是受控的（图标 SVG、toast 文案），但 `notifications.js` 的按钮模板、`status-ticker.js`、`grid-manager.js:161`、`card-renderer.js:132` 都可以换成 `textContent` + `classList` 或 `<template>` clone，既更快也降低注入风险。

---

## P2 —— 性能细枝末节

### 7. Snow effect 在移动端仍创建 80 片雪花
`snow-effect.js:15` 默认 ENABLED=false 已经好；但开启后移动端 80 片 × `POSITION_UPDATE_INTERVAL=100ms` 的 rect 刷新在低端机上仍吃力。可以考虑根据 `navigator.hardwareConcurrency` 或 `performance-detector` 已有的结果再下调。

### 8. CSS 体积
`styles/mobile-optimized.css` 840 行、`responsive.css` 551 行、`components/music-player.css` 797 行。整站 CSS 最终打包 ~72KB（见 `dist/assets/index-*.css`）。建议：
- 启用 tailwind 的 JIT/purge（看 `tailwind.config.js` 是否扫到了所有模板），或干脆评估 tailwind 是否还被真实用到（如果只剩工具类可手写）。
- `responsive.css` 和 `mobile-optimized.css` 有高度可能重叠，可一次合并排查。

### 9. 日志清理策略
163 处 `console.*`。`vite.config.js` 的 `drop_console: true` 会删除生产构建里的 console，但**不会**删 `log.info/log.debug`（走 Logger 模块）。`logger.js` 在生产走的是 `LogLevel.WARN`，没问题；只是 `console.*` 直写的地方（尤其 `bootstrap.js`、`init.js`、`state.js`）在源码可读性上偏吵，建议统一迁到 `Logger.create()`。

### 10. 构建产出可继续压
目前主 chunk 只有 13KB、总 JS < 100KB，已经不错。下一步可以：
- 开启 `build.cssCodeSplit`（Vite 默认开启，确认是否被关掉）。
- 音频/封面资源看看是否能走 `hashed asset` + `preload`。

---

## 建议的动手顺序
1. 删 `crypto-js` 三处残留 + 收紧 CSP（5 分钟，立省 60KB）。
2. 补 `proxy-manager` / `state.js` / `error-handler` 的单测（最划算的健壮性投资）。
3. 拆 `music-player.js` 和 `snow-effect.js`（降低后续改动成本）。
4. 清理剩余的 `window.*` 全局和内联 `onclick=`（安全 + 一致性）。

# 安全策略文档

## Content Security Policy (CSP)

项目已配置 Content Security Policy 以防止 XSS 攻击和其他安全威胁。

### CSP 配置说明

```html
<meta http-equiv="Content-Security-Policy" content="..." />
```

### 指令详解

#### `default-src 'self'`
- **说明**: 默认情况下只允许加载同源资源
- **用途**: 作为所有未明确指定指令的后备策略

#### `script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com`
- **说明**: 允许脚本来源
  - `'self'`: 同源脚本（Vite 构建的 JS）
  - `'unsafe-inline'`: 内联脚本（favicon 动画、Vite 开发模式）
  - `https://cdnjs.cloudflare.com`: CryptoJS CDN
- **安全考虑**: `'unsafe-inline'` 降低了安全性，未来应考虑使用 nonce 或 hash

#### `style-src 'self' 'unsafe-inline'`
- **说明**: 允许样式来源
  - `'self'`: 同源样式（Tailwind CSS）
  - `'unsafe-inline'`: 内联样式（critical CSS，防止 FOUC）
- **优化方向**: 考虑提取 critical CSS 到独立文件

#### `img-src 'self' data: https: blob:`
- **说明**: 允许图片来源
  - `'self'`: 同源图片
  - `data:`: Data URLs（favicon）
  - `https:`: 所有 HTTPS 图片（直播封面、头像）
  - `blob:`: Blob URLs（可能用于图片处理）
- **为什么允许所有 HTTPS**: 直播平台的 CDN 地址可能变化，且数量众多

#### `media-src 'self' data: blob:`
- **说明**: 允许音视频来源
  - `'self'`: 同源音频（MP3 音乐文件）
  - `data:`: Base64 音频（keep-alive 静音音频）
  - `blob:`: Blob URLs（潜在的音频处理）

#### `connect-src 'self' https://www.douyu.com https://live.bilibili.com https://api.bilibili.com https://api.twitch.tv https://gql.twitch.tv https://kick.com`
- **说明**: 允许 AJAX/Fetch/WebSocket 连接
  - `'self'`: 同源 API
  - 各平台 API 域名（获取直播状态）
- **维护**: 添加新平台时需要更新此列表

#### `font-src 'self' data:`
- **说明**: 允许字体来源
  - `'self'`: 同源字体
  - `data:`: Data URL 字体（如果使用）

#### `object-src 'none'`
- **说明**: 禁止 `<object>`, `<embed>`, `<applet>` 标签
- **用途**: 防止 Flash 等插件漏洞

#### `base-uri 'self'`
- **说明**: 限制 `<base>` 标签只能使用同源 URL
- **用途**: 防止相对 URL 劫持攻击

#### `form-action 'self'`
- **说明**: 限制表单提交只能到同源
- **用途**: 防止表单劫持

#### `frame-ancestors 'none'`
- **说明**: 禁止被嵌入到 iframe 中
- **用途**: 防止点击劫持（Clickjacking）攻击
- **等同于**: `X-Frame-Options: DENY`

#### `upgrade-insecure-requests`
- **说明**: 自动将 HTTP 请求升级为 HTTPS
- **用途**: 强制使用 HTTPS，防止中间人攻击

## 常见问题

### Q: 为什么使用 `'unsafe-inline'`？

**A**: 目前项目使用了内联脚本（favicon 动画）和内联样式（critical CSS）。未来可以通过以下方式消除：

1. **脚本**:
   - 将 favicon 动画移到独立 JS 文件
   - 使用 nonce 或 hash 白名单特定内联脚本

2. **样式**:
   - 提取 critical CSS 到独立文件
   - 使用 Vite 插件自动注入 CSS

### Q: 如何添加新的 API 域名？

**A**: 编辑 `index.html` 中的 `connect-src` 指令：

```html
connect-src 'self'
            https://www.douyu.com
            https://new-platform.com;
```

### Q: 如何测试 CSP 是否生效？

**A**:

1. **浏览器开发者工具**: 打开 Console，查看 CSP 违规报告
2. **报告模式**: 临时改为 `Content-Security-Policy-Report-Only` 观察违规但不阻止
3. **在线工具**: 使用 [CSP Evaluator](https://csp-evaluator.withgoogle.com/) 评估策略

### Q: 遇到 CSP 错误怎么办？

**A**:

1. 检查浏览器 Console 的 CSP 违规报告
2. 识别被阻止的资源类型和来源
3. 根据需要调整对应的 CSP 指令
4. 原则：只添加真正需要的来源，保持最小权限

## 安全最佳实践

1. **定期审查 CSP**: 每次添加新功能后检查是否需要调整 CSP
2. **监控违规**: 考虑配置 CSP 报告端点收集违规日志
3. **逐步严格化**: 从宽松策略开始，逐步移除 `'unsafe-inline'` 和 `'unsafe-eval'`
4. **使用 nonce**: 为动态脚本使用 nonce 而不是 `'unsafe-inline'`
5. **子资源完整性 (SRI)**: 为 CDN 资源添加 `integrity` 属性

## 未来改进计划

- [ ] 消除 `script-src` 中的 `'unsafe-inline'`（使用 nonce/hash）
- [ ] 消除 `style-src` 中的 `'unsafe-inline'`（提取 critical CSS）
- [ ] 添加 CSP 报告端点 (`report-uri`, `report-to`)
- [ ] 为 CryptoJS CDN 添加 Subresource Integrity (SRI)
- [ ] 评估是否可以限制 `img-src` 为特定 CDN 域名

## 相关资源

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

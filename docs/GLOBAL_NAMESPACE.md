# 全局命名空间策略

## 概述

项目使用单一全局命名空间 `window.LR` 来组织所有全局函数和状态，减少全局命名空间污染。

## 当前架构

### LR 命名空间结构

```javascript
window.LR = {
  // 核心应用函数
  core: {
    renderAll: Function,    // 渲染所有卡片
    fetchStatus: Function,  // 获取房间状态
    refreshAll: Function,   // 刷新所有房间
  },

  // 工具函数
  utils: {
    showToast: Function,    // 显示提示消息
  },

  // 应用状态（推荐只读访问）
  state: {
    rooms: Array,                  // 房间列表
    roomDataCache: Object,         // 房间数据缓存
    previousLiveStatus: Object,    // 上一次直播状态
    notificationsEnabled: Object,  // 通知开关状态
  },

  // 房间管理
  rooms: {
    toggleFavorite: Function,  // 切换收藏状态
  },

  // 调试工具
  debug: {},

  // 版本信息
  version: '3.1.1',
  name: 'LiveRadar',
};
```

## 使用示例

### 推荐方式（使用 LR 命名空间）

```javascript
// 显示提示消息
LR.utils.showToast('操作成功', 'success');

// 刷新所有房间
LR.core.refreshAll();

// 访问状态
console.log('当前房间数:', LR.state.rooms.length);

// 切换收藏
LR.rooms.toggleFavorite('123456', 'douyu');
```

### 兼容方式（旧代码仍可使用）

```javascript
// ⚠️ 仍然有效，但不推荐
window.showToast('操作成功', 'success');
window.refreshAll();
console.log('当前房间数:', window.rooms.length);
```

## 迁移计划

### Phase 1: ✅ 组织命名空间（已完成）

- [x] 创建 `window.LR` 命名空间
- [x] 将所有全局函数组织到 LR 下
- [x] 保持向后兼容性（window.* 仍可用）
- [x] 添加 `getGlobal()` 工具函数

### Phase 2: ⏳ 更新引用（计划中）

逐步更新所有 `window.*` 引用为 `LR.*`：

**文件清单**:
- `src/api/platform-sniffers.js`
- `src/core/event-router.js`
- `src/core/file-protocol-warning.js`
- `src/core/init.js`

**迁移脚本**:
```bash
# 查找所有 window.renderAll 引用
grep -r "window\.renderAll" src/

# 替换为 LR.core.renderAll
sed -i 's/window\.renderAll/LR.core.renderAll/g' src/**/*.js
```

### Phase 3: ⏳ 移除兼容性垫片（未来）

当所有代码迁移到 LR 命名空间后：

```javascript
// 移除这些兼容性赋值
window.showToast = showToast;  // ❌ 删除
window.toggleFavorite = toggleFavorite;  // ❌ 删除
window.renderAll = renderAll;  // ❌ 删除
// ... 等等
```

### Phase 4: ⏳ 依赖注入重构（长期目标）

最终目标是完全消除全局变量，使用依赖注入：

```javascript
// 当前（全局访问）
function someFeature() {
  const rooms = window.rooms;  // ❌ 全局依赖
  window.renderAll();
}

// 目标（依赖注入）
function someFeature(deps) {
  const { rooms, renderAll } = deps;  // ✅ 显式依赖
  renderAll();
}

// 或使用事件总线
import { eventBus } from './core/event-bus.js';
eventBus.emit('rooms:refresh');
```

## 工具函数

### getGlobal(path)

安全访问 LR 命名空间中的值：

```javascript
import { getGlobal } from './core/globals.js';

// 获取函数
const renderAll = getGlobal('core.renderAll');
if (renderAll) renderAll();

// 获取状态
const rooms = getGlobal('state.rooms');
console.log('房间数:', rooms?.length || 0);
```

**优势**:
- 类型安全（避免 undefined 错误）
- 路径验证（打印警告）
- 未来兼容（即使 LR 结构改变）

## 最佳实践

### ✅ 推荐做法

1. **新代码使用 LR 命名空间**
   ```javascript
   LR.utils.showToast('成功', 'success');
   ```

2. **模块内部使用导入**
   ```javascript
   import { showToast } from './utils/helpers.js';
   showToast('成功', 'success');
   ```

3. **使用 getGlobal 安全访问**
   ```javascript
   const fn = getGlobal('core.renderAll');
   if (fn) fn();
   ```

4. **只读访问状态**
   ```javascript
   const roomCount = LR.state.rooms.length;  // ✅ 读取
   ```

### ❌ 避免做法

1. **不要直接修改 LR 命名空间**
   ```javascript
   LR.myCustomFunction = () => {};  // ❌ 污染命名空间
   ```

2. **不要修改 state 对象**
   ```javascript
   LR.state.rooms.push(newRoom);  // ❌ 应使用 API
   ```

3. **不要混用 window.* 和 LR.***
   ```javascript
   window.showToast('A');  // ❌ 不一致
   LR.utils.showToast('B');  // ✅ 统一使用
   ```

## 调试技巧

### 浏览器控制台

```javascript
// 查看 LR 命名空间
console.log(LR);

// 查看当前状态
console.log('Rooms:', LR.state.rooms);
console.log('Data Cache:', LR.state.roomDataCache);

// 手动触发刷新
LR.core.refreshAll();

// 测试 Toast
LR.utils.showToast('测试消息', 'info');
```

### 检查全局污染

```javascript
// 列出所有自定义全局变量
Object.keys(window).filter(key =>
  !key.startsWith('webkit') &&
  !key.startsWith('chrome') &&
  typeof window[key] !== 'function' ||
  key === 'LR' ||
  key.startsWith('show') ||
  key.startsWith('toggle')
);
```

## 性能考虑

### 命名空间开销

- **内存**: 单个 `LR` 对象，几乎无开销
- **访问速度**: `LR.utils.showToast` vs `window.showToast` 差异可忽略
- **压缩**: Terser 会优化属性访问

### 优化建议

1. **频繁调用的函数可缓存**
   ```javascript
   const { showToast } = LR.utils;
   showToast('A');
   showToast('B');  // 避免重复访问 LR.utils
   ```

2. **批量操作使用解构**
   ```javascript
   const { renderAll, fetchStatus } = LR.core;
   await fetchStatus();
   renderAll();
   ```

## 常见问题

### Q: 为什么不完全消除全局变量？

**A**: 完全消除需要大规模重构，风险高。当前方案是渐进式改进：
1. 先组织命名空间（降低污染）
2. 逐步迁移代码（降低风险）
3. 最终完全移除（长期目标）

### Q: 什么时候移除 window.* 兼容性？

**A**: 当所有以下条件满足：
- ✅ 所有 src/ 中的引用已迁移到 LR.*
- ✅ 测试全部通过
- ✅ 无第三方依赖使用 window.* 引用

### Q: 可以直接修改 LR 对象吗？

**A**: **不推荐**。LR 命名空间由 `globals.js` 管理，手动修改可能导致：
- 状态不一致
- 测试失败
- 难以追踪 bug

### Q: 如何添加新的全局函数？

**A**:
1. 编辑 `src/core/globals.js`
2. 添加到对应的 LR 子对象（core/utils/rooms 等）
3. 更新此文档

## 相关文件

- `src/core/globals.js` - 命名空间定义和导出
- `src/core/event-router.js` - 事件委托（减少全局函数）
- `src/core/bootstrap.js` - 初始化全局命名空间

## 参考资源

- [Why Global Variables Are Bad](https://wiki.c2.com/?GlobalVariablesAreBad)
- [JavaScript Namespacing Patterns](https://www.adequatelygood.com/JavaScript-Module-Pattern-In-Depth.html)
- [Dependency Injection in JavaScript](https://medium.com/@fleeboy/dependency-injection-in-javascript-9db9ea6e4288)

# 测试文档

## 概述

项目使用 [Vitest](https://vitest.dev/) 作为测试框架，配合 `happy-dom` 提供浏览器环境模拟。

## 运行测试

```bash
# 运行所有测试（监听模式）
npm run test

# 运行所有测试（单次运行）
npm run test:run

# 运行测试并生成覆盖率报告
npm run test:coverage

# 使用 UI 界面运行测试
npm run test:ui
```

## 测试文件组织

测试文件位于对应模块的 `__tests__` 目录中：

```
src/
├── core/
│   └── renderer/
│       ├── __tests__/
│       │   └── image-handler.test.js
│       ├── image-handler.js
│       └── ...
└── utils/
    ├── __tests__/
    │   └── helpers.test.js
    └── helpers.js
```

## 测试命名规范

- 测试文件：`*.test.js` 或 `*.spec.js`
- 测试描述：使用清晰的英文描述测试场景
- 测试分组：使用 `describe` 组织相关测试用例

## 编写测试示例

### 基础测试

```javascript
import { describe, it, expect } from 'vitest';
import { formatHeat } from '../helpers.js';

describe('formatHeat', () => {
  it('should format numbers under 1000 as-is', () => {
    expect(formatHeat(999)).toBe('999');
  });

  it('should format thousands with K suffix', () => {
    expect(formatHeat(1500)).toBe('1.5K');
  });
});
```

### Mock 时间

```javascript
import { vi } from 'vitest';

it('should use time-bucketed caching', () => {
  const mockTime = 1700000000000;
  vi.spyOn(Date, 'now').mockReturnValue(mockTime);

  const result = getSmartImageUrl(url, 'twitch', true);

  expect(result).toContain('t=');
  vi.restoreAllMocks();
});
```

### 测试异步函数

```javascript
it('should execute debounced function after delay', async () => {
  const fn = vi.fn();
  const debounced = debounce(fn, 50);

  debounced();
  expect(fn).not.toHaveBeenCalled();

  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(fn).toHaveBeenCalledTimes(1);
});
```

## 覆盖率目标

- 工具函数（utils）：>80%
- 核心模块（core）：>70%
- UI 组件：>60%

## 最佳实践

1. **独立性**：每个测试应该独立运行，不依赖其他测试的状态
2. **清理**：使用 `beforeEach` 和 `afterEach` 进行环境清理
3. **可读性**：测试描述应该清楚说明测试意图
4. **边界情况**：测试边界条件、错误输入、空值等
5. **Mock 时机**：只在必要时使用 mock，优先测试真实行为

## 持续集成

测试应在每次提交前运行：

```bash
npm run test:run && npm run build
```

可以配置 Git hooks 自动运行测试：

```json
// .husky/pre-commit
npm run test:run
```

## 参考资源

- [Vitest 官方文档](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

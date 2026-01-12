import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // 使用 happy-dom 模拟浏览器环境（比 jsdom 更快）
    environment: 'happy-dom',

    // 全局变量支持（可以直接使用 describe, it, expect 等）
    globals: true,

    // 代码覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        'archive/',
        '*.config.js',
        'src/config/constants.js', // 配置常量不需要测试
      ],
    },

    // 测试文件匹配模式
    include: ['**/*.{test,spec}.{js,mjs,cjs}'],

    // 设置测试超时时间（毫秒）
    testTimeout: 10000,

    // 钩子超时时间
    hookTimeout: 10000,

    // 隔离测试环境（每个测试文件独立运行）
    isolate: true,

    // 并发运行测试
    threads: true,
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@utils': resolve(__dirname, './src/utils'),
      '@features': resolve(__dirname, './src/features'),
      '@config': resolve(__dirname, './src/config'),
    },
  },
});

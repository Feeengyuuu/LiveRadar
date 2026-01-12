import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Support both root and subdirectory deployment
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // Disable for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
      format: {
        comments: false,
        // 确保正确处理 Unicode 字符（包括中文）
        ascii_only: false,
        ecma: 2020,
      },
    },
    rollupOptions: {
      output: {
        // 🔥 Advanced code splitting strategy
        manualChunks(id) {
          // Vendor dependencies (node_modules)
          if (id.includes('node_modules')) {
            // Separate crypto-js as it's only used for Bilibili
            if (id.includes('crypto-js')) {
              return 'vendor-crypto';
            }
            // All other vendor code in main vendor chunk
            return 'vendor';
          }

          // Feature-based splitting (src/features/)
          if (id.includes('/features/core/')) {
            return 'features-core'; // Core features: refresh, notifications, etc.
          }
          if (id.includes('/features/enhancements/')) {
            return 'features-enhancements'; // Enhancements: music, snow, region
          }

          // API modules (can be lazy loaded)
          if (id.includes('/api/')) {
            if (id.includes('/api/bilibili')) return 'api-bilibili';
            if (id.includes('/api/douyu')) return 'api-douyu';
            if (id.includes('/api/twitch')) return 'api-twitch';
            if (id.includes('/api/kick')) return 'api-kick';
            return 'api-common';
          }

          // Core renderer (already split into sub-modules)
          if (id.includes('/core/renderer/')) {
            return 'renderer';
          }

          // Utils (shared utilities)
          if (id.includes('/utils/')) {
            return 'utils';
          }

          // Everything else goes into main chunk
        },

        // Optimize chunk file names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1000, // Warn if chunk > 1MB
  },
  server: {
    port: 3000,
    open: true,
    cors: true, // Enable CORS for local development
  },
  preview: {
    port: 8080,
  },
});

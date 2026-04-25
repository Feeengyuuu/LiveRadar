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
          const normalizedId = id.replace(/\\/g, '/');

          // Vendor dependencies (node_modules)
          if (normalizedId.includes('node_modules')) {
            return 'vendor';
          }

          // Optional widgets must keep their own lazy chunks. If they are
          // grouped with the generic enhancements chunk, static imports such
          // as snow initialization can pull the music player into startup.
          if (normalizedId.includes('/features/enhancements/music-player.js')) {
            return 'music-player';
          }
          if (normalizedId.includes('/features/enhancements/snow-effect.js')) {
            return 'snow-effect';
          }

          // Feature-based splitting (src/features/)
          if (normalizedId.includes('/features/core/')) {
            return 'features-core'; // Core features: refresh, notifications, etc.
          }
          if (normalizedId.includes('/features/enhancements/')) {
            return 'features-enhancements'; // Enhancements: music, snow, region
          }

          // API modules (can be lazy loaded)
          if (normalizedId.includes('/api/')) {
            if (normalizedId.includes('/api/bilibili')) return 'api-bilibili';
            if (normalizedId.includes('/api/douyu')) return 'api-douyu';
            if (normalizedId.includes('/api/twitch')) return 'api-twitch';
            if (normalizedId.includes('/api/kick')) return 'api-kick';
            return 'api-common';
          }

          // Core renderer (already split into sub-modules)
          if (normalizedId.includes('/core/renderer/')) {
            return 'renderer';
          }

          // Utils (shared utilities)
          if (normalizedId.includes('/utils/')) {
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

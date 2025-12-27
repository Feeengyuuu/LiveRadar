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
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor code
          crypto: ['crypto-js'],
        },
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

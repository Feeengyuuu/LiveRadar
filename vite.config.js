import { defineConfig } from 'vite';
import { handleBatchStatusRequest, handleStatusRequest } from './functions/_shared/platform-status.js';

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createWebRequest(req) {
  const host = req.headers.host || '127.0.0.1:3000';
  const url = `http://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return { url, headers };
}

async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

async function handleDevStatusRequest(req, res, next) {
  const { url, headers } = createWebRequest(req);
  const pathname = new URL(url).pathname;
  const isStatus = pathname === '/api/status';
  const isBatch = pathname === '/api/status/batch';
  if (!isStatus && !isBatch) {
    next();
    return;
  }

  try {
    const body = isBatch ? await readRequestBody(req) : undefined;
    const request = new Request(url, {
      method: req.method,
      headers,
      body
    });
    const response = isBatch
      ? await handleBatchStatusRequest({ request, env: {} })
      : await handleStatusRequest({ request, env: {} });
    await sendWebResponse(res, response);
  } catch (error) {
    next(error);
  }
}

function devStatusApiPlugin() {
  return {
    name: 'liveradar-dev-status-api',
    configureServer(server) {
      server.middlewares.use(handleDevStatusRequest);
    },
  };
}

export default defineConfig({
  plugins: [devStatusApiPlugin()],
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

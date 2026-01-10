/**
 * ====================================================================
 * Application Bootstrap Module
 * ====================================================================
 *
 * Handles application initialization and startup sequence.
 * Coordinates module initialization and dependency injection.
 *
 * Initialization sequence:
 * 1. Initialize state
 * 2. Wire up module dependencies
 * 3. Initialize feature modules
 * 4. Run main init() function
 * 5. Hide loader
 * ==================================================================== */

import { debounce, formatHeat } from '../utils/helpers.js';
import { APP_CONFIG, MIN_LOADER_DISPLAY_TIME } from '../config/constants.js';
import { initDOMCache } from '../utils/dom-cache.js';

// Core modules
import { initState, getState, getRooms, getRoomDataCache, flushPendingStorageWrites } from './state.js';
import { initSniffers } from '../api/platform-sniffers.js';
import { initStatusFetcher } from './status-fetcher.js';
import { initRefreshManager } from './refresh-manager.js';
import { initRenderer, renderAll } from './renderer.js';
import { init, initAppDependencies } from './init.js';
import { fetchStatus } from './status-fetcher.js';

// Feature modules
import { initSnow } from '../features/snow-effect.js';
import { initAutoRefresh } from '../features/auto-refresh.js';
import { initNotifications, checkNotifications } from '../features/notifications.js';
import { initRegionDetection } from '../features/region-detector.js';
import { initStatusTicker, updateTicker } from '../features/status-ticker.js';
import { initNotificationAudio } from '../features/audio/notification-audio.js';
import { initAudioManager } from '../features/audio/audio-manager.js';
import { initMusicPlayer } from '../features/music-player.js';

// Globals exposure
import { exposeGlobals, exposeCoreDependencies } from './globals.js';

/**
 * Main application initialization function
 * @param {number} loaderStartTime - Timestamp when loader was shown
 * @returns {Promise<void>}
 */
export async function initializeApp(loaderStartTime) {
    console.log('[Bootstrap] Starting application initialization...');

    try {
        // === Step 1: Initialize State ===
        initState();
        const rooms = getRooms();
        const roomDataCache = getRoomDataCache();
        const state = getState();

        console.log('[Bootstrap] State initialized, rooms:', rooms.length);

        // === Step 1.5: Initialize DOM Cache (Performance Optimization) ===
        initDOMCache();
        console.log('[Bootstrap] DOM cache initialized');

        // === Step 2: Expose Global Functions (for HTML inline handlers) ===
        exposeGlobals();

        // Expose core dependencies (for features to access)
        exposeCoreDependencies({
            rooms,
            roomDataCache,
            previousLiveStatus: state.previousLiveStatus,
            renderAll,
            fetchStatus,
            notificationsEnabled: state.notificationsEnabled
        });

        // === Step 3: Wire Up Module Dependencies (Simplified) ===
        // Most dependencies now come directly from state.js

        // Initialize sniffers (no dependencies needed)
        initSniffers();

        // Initialize status fetcher (only notification callback needed)
        initStatusFetcher({
            checkAndNotify: (room, isLive, owner) => {
                checkNotifications(room, { isLive, owner });
            }
        });

        // Initialize refresh manager (only callbacks needed)
        initRefreshManager({
            detectStatusChanges: () => updateTicker(getRooms(), getRoomDataCache())
        });

        // Initialize renderer (no dependencies needed - uses state.js directly)
        initRenderer();

        console.log('[Bootstrap] All core modules initialized');

        // === Step 4: Initialize Feature Modules ===
        const notifyAudio = initNotificationAudio();
        initNotifications();
        initSnow();
        initStatusTicker();
        initMusicPlayer();
        initAudioManager();
        initAutoRefresh();
        initRegionDetection();

        // Pass notifyAudio to init dependencies (must be called after initNotificationAudio)
        initAppDependencies({
            rooms,
            roomDataCache,
            previousLiveStatus: state.previousLiveStatus
        });

        console.log('[Bootstrap] All features initialized');

        // === Step 5: Run Main Init ===
        // This handles:
        // - UI setup (buttons, placeholders, etc.)
        // - Cache cleanup
        // - Initial render (if cache exists)
        // - First refresh
        // - Auto-refresh setup
        // - Audio setup
        // - Network monitoring
        await init();

        // === Step 6: Setup Page Unload Protection ===
        // 优化：确保所有防抖的localStorage写入在页面关闭前完成
        window.addEventListener('beforeunload', () => {
            console.log('[Bootstrap] Page unloading, flushing pending storage writes...');
            flushPendingStorageWrites();
        });

        console.log('[Bootstrap] ✓ Initialization complete');

    } catch (error) {
        console.error('[Bootstrap] ✗ Initialization failed:', error);
        console.error('[Bootstrap] Error name:', error?.name);
        console.error('[Bootstrap] Error message:', error?.message);
        console.error('[Bootstrap] Error stack:', error?.stack);
        throw error;
    }
}

/**
 * Hide loader with minimum display time enforcement
 * Ensures loader is visible for at least MIN_LOADER_DISPLAY_TIME
 *
 * @param {number} loaderStartTime - Timestamp when loader was shown
 */
export function hideLoader(loaderStartTime) {
    const loader = document.getElementById('initial-loader');
    if (!loader) return;

    const elapsed = Date.now() - loaderStartTime;
    const remaining = Math.max(0, MIN_LOADER_DISPLAY_TIME - elapsed);

    console.log(`[Bootstrap] Hiding loader (elapsed: ${elapsed}ms, waiting: ${remaining}ms)`);

    setTimeout(() => {
        loader.style.opacity = '0';

        // 重要：移除 body 上的 loading class 以显示主内容
        document.body.classList.remove('loading');
        document.body.style.overflow = '';

        setTimeout(() => {
            loader.remove();
            console.log('[Bootstrap] ✓ Loader removed');
        }, 300); // Wait for fade-out transition
    }, remaining);
}

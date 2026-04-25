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

import { initDOMCache } from '../utils/dom-cache.js';

// Core modules
import { initState, getState, getRooms, getRoomDataCache, flushPendingStorageWrites } from './state.js';
import { initSniffers } from '../api/platform-sniffers.js';
import { initStatusFetcher } from './status-fetcher.js';
import { initRefreshManager } from './refresh-manager.js';
import { initRenderer } from './renderer.js';
import { init, initAppDependencies } from './init.js';
import { initVisibilityRecovery } from './renderer/image-handler.js';

// Feature modules
import { initSnow } from '../features/enhancements/snow-effect-loader.js';
import { scheduleMusicPlayerInit } from '../features/enhancements/music-player-loader.js';
import { initAutoRefresh } from '../features/core/auto-refresh.js';
import { initNotifications, checkNotifications } from '../features/core/notifications.js';
import { initStatusTicker, updateTicker } from '../features/core/status-ticker.js';
import { initNotificationAudio } from '../features/audio/notification-audio.js';
import { initAudioManager } from '../features/audio/audio-manager.js';

// Event delegation
import { initEventRouter } from './event-router.js';

let initialized = false;
let appDisposers = [];

/**
 * Main application initialization function
 * @returns {Promise<void>}
 */
export async function initializeApp() {
    if (initialized) return;
    initialized = true;

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

        // === Step 2: Initialize Event Delegation Router ===
        appDisposers.push(initEventRouter());

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
        appDisposers.push(initRefreshManager({
            detectStatusChanges: () => updateTicker(getRooms(), getRoomDataCache())
        }));

        // Initialize renderer (no dependencies needed - uses state.js directly)
        appDisposers.push(initRenderer());

        console.log('[Bootstrap] All core modules initialized');

        // === Step 4: Initialize Feature Modules ===
        initNotificationAudio();
        initNotifications();
        initStatusTicker();
        initAudioManager();
        appDisposers.push(initAutoRefresh());

        // Pass notifyAudio to init dependencies (must be called after initNotificationAudio)
        initAppDependencies({
            rooms,
            roomDataCache,
            previousLiveStatus: state.previousLiveStatus
        });

        console.log('[Bootstrap] All features initialized');

        // === Step 4.5: Initialize Page Visibility Recovery ===
        // Fixes black screen issues when switching tabs during image load
        initVisibilityRecovery();
        console.log('[Bootstrap] Page visibility recovery initialized');

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

        // Load non-critical UI widgets after the main monitoring flow is ready.
        void initSnow();
        scheduleMusicPlayerInit();

        // === Step 6: Setup Page Unload Protection ===
        // 优化：确保所有防抖的localStorage写入在页面关闭前完成
        const handleBeforeUnload = () => {
            console.log('[Bootstrap] Page unloading, flushing pending storage writes...');
            flushPendingStorageWrites();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        appDisposers.push(() => window.removeEventListener('beforeunload', handleBeforeUnload));

        // === Step 7: CSS Animation Pause on Tab Hidden ===
        // 标签页后台时给 <html> 打 .tab-hidden，CSS 用它暂停所有 infinite 动画。
        // 浏览器只会节流 rAF / 降帧率，不保证停 CSS 动画；这层兜底让风扇在后台也安静。
        const syncTabVisibility = () => {
            document.documentElement.classList.toggle('tab-hidden', document.hidden);
        };
        document.addEventListener('visibilitychange', syncTabVisibility);
        appDisposers.push(() => document.removeEventListener('visibilitychange', syncTabVisibility));
        syncTabVisibility();

        console.log('[Bootstrap] ✓ Initialization complete');

    } catch (error) {
        console.error('[Bootstrap] ✗ Initialization failed:', error);
        disposeApp();
        console.error('[Bootstrap] Error name:', error?.name);
        console.error('[Bootstrap] Error message:', error?.message);
        console.error('[Bootstrap] Error stack:', error?.stack);
        throw error;
    }
}

export function disposeApp() {
    for (let i = appDisposers.length - 1; i >= 0; i--) {
        const dispose = appDisposers[i];
        if (typeof dispose !== 'function') continue;
        try {
            dispose();
        } catch (error) {
            console.error('[Bootstrap] Cleanup failed:', error);
        }
    }
    appDisposers = [];
    initialized = false;
}

/**
 * Hide loader and show main content immediately.
 */
export function hideLoader() {
    const loader = document.getElementById('initial-loader');
    if (!loader) return;

    document.body.classList.remove('loading');
    document.body.style.overflow = '';
    loader.remove();
    console.log('[Bootstrap] ✓ Loader removed');
}

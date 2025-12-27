// ============================================================
// LiveRadar v3.1.1 - Main Entry Point
// ============================================================

// Import CSS (Vite will handle bundling)
import './styles/main.css';

// Import utilities
import { getRandomItem, showToast, debounce, formatHeat } from './utils/helpers.js';
import { SafeStorage } from './utils/safe-storage.js';
import { PerformanceDetector } from './utils/performance-detector.js';
import { DataDiffer } from './utils/data-differ.js';
import { ResourceManager } from './utils/resource-manager.js';

// Import configuration
import { LOADING_MESSAGES, MIN_LOADER_DISPLAY_TIME, APP_CONFIG } from './config/constants.js';
import { PROXY_CONFIG } from './config/proxies.js';
import './config/signer.js'; // Side-effect import for signers

// Import core modules
import { initState, getState, setState, getRooms, setRooms, getRoomDataCache, setRoomDataCache } from './core/state.js';
import { ProxyManager } from './api/proxy-manager.js';
import { sniffDouyuRoom, sniffBilibiliRoom, sniffTwitchStream, initSniffers } from './api/platform-sniffers.js';
import { fetchStatus, initStatusFetcher } from './core/status-fetcher.js';
import { refreshAll, initRefreshManager } from './core/refresh-manager.js';
import { renderAll, initRenderer } from './core/renderer.js';
import { init, initAppDependencies } from './core/init.js';
import { checkFileProtocolAndWarn } from './core/file-protocol-warning.js';

// Import feature modules
import { initSnow, toggleSnow } from './features/snow-effect.js';
import { toggleAutoRefresh, initAutoRefresh } from './features/auto-refresh.js';
import { exportRooms, importRooms } from './features/import-export.js';
import {
    toggleDropdown,
    closeDropdown,
    selectPlatform,
    showHistory,
    hideHistory,
    handleInput,
    handleAddInput,
    applyHistory,
    deleteHistory,
    removeRoom
} from './features/room-management.js';
import { toggleNotifications, initNotifications, checkNotifications } from './features/notifications.js';
import { initRegionDetection, toggleRegionMode } from './features/region-detector.js';
import { initStatusTicker, updateTicker, clearTickerState } from './features/status-ticker.js';
import { initNotificationAudio, playNotificationSound } from './features/audio/notification-audio.js';
import { initAudioManager, toggleKeepAlive, unlockAllAudio } from './features/audio/audio-manager.js';
import { dismissFileWarning, dismissFileWarningPermanently, showDeploymentGuide } from './features/warning-banner.js';

console.log('[LiveRadar] Starting application...');
console.log('[LiveRadar] APP_CONFIG loaded:', APP_CONFIG);

// ============================================================
// 1. Set Random Loader Text
// ============================================================
const loaderStartTime = Date.now();
const loaderTextEl = document.getElementById('loader-text');
if (loaderTextEl) {
    loaderTextEl.textContent = getRandomItem(LOADING_MESSAGES);
}

// ============================================================
// 2. Performance Detection (runs immediately)
// ============================================================
PerformanceDetector.detect();

// ============================================================
// 3. Expose Helper Functions Globally
// ============================================================
// Make showToast available globally for all modules
window.showToast = showToast;

// ============================================================
// 4. Expose All Functions to Window (for inline event handlers)
// ============================================================
// TODO: Remove after migrating to addEventListener

// Snow effect
window.toggleSnow = toggleSnow;

// Platform selector
window.toggleDropdown = toggleDropdown;
window.selectPlatform = selectPlatform;
window.closeDropdown = closeDropdown;

// Search & history
window.showHistory = showHistory;
window.hideHistory = hideHistory;
window.handleInput = handleInput;
window.handleAddInput = handleAddInput;
window.applyHistory = applyHistory;
window.deleteHistory = deleteHistory;

// Room management
window.removeRoom = removeRoom;

// Settings toggles
window.toggleNotifications = toggleNotifications;
window.toggleAutoRefresh = toggleAutoRefresh;
window.toggleKeepAlive = toggleKeepAlive;
window.toggleRegionMode = toggleRegionMode;

// Import/Export
window.exportRooms = () => exportRooms(getRooms());
window.importRooms = importRooms;

// Refresh
window.refreshAll = refreshAll;

// Warning banner
window.dismissFileWarning = dismissFileWarning;
window.dismissFileWarningPermanently = dismissFileWarningPermanently;
window.showDeploymentGuide = showDeploymentGuide;

// Audio
window.unlockAllAudio = unlockAllAudio;
window.playNotificationSound = playNotificationSound;

// ============================================================
// 5. Expose Core Functions for Features (Dependency Injection)
// ============================================================
// Make core functions and state available globally so features can use them
window.rooms = getRooms();
window.roomDataCache = getRoomDataCache();
window.previousLiveStatus = getState().previousLiveStatus;
window.renderAll = renderAll;
window.fetchStatus = fetchStatus;

// Set notifications enabled flag (for audio module)
window.notificationsEnabled = SafeStorage.getItem('pro_notify_enabled', 'false') === 'true';

// ============================================================
// 6. Initialize Application
// ============================================================
async function initializeApp() {
    console.log('[LiveRadar] Initializing...');

    try {
        // Step 1: Initialize state first
        initState();
        console.log('[LiveRadar] State initialized, rooms:', window.rooms.length);

        // Step 2: Wire up all module dependencies (dependency injection)
        const debouncedSaveCache = debounce(() => {
            SafeStorage.setJSON('pro_room_cache', window.roomDataCache || {});
        }, 800);

        // Initialize all modules with their dependencies
        initSniffers({
            imgTimestamp: Math.floor(Date.now() / APP_CONFIG.CACHE.IMAGE_TIMESTAMP_INTERVAL),
            roomDataCache: window.roomDataCache,
            debouncedSaveCache
        });

        initStatusFetcher({
            roomDataCache: window.roomDataCache,
            debouncedSaveCache,
            checkAndNotify: (room, isLive, owner) => {
                checkNotifications(room, { isLive, owner });
            },
            formatHeat
        });

        initRefreshManager({
            rooms: window.rooms,
            roomDataCache: window.roomDataCache,
            detectStatusChanges: () => updateTicker(window.rooms, window.roomDataCache),
            loaderStartTime
        });

        initRenderer({
            rooms: window.rooms,
            roomDataCache: window.roomDataCache
        });

        initAppDependencies({
            rooms: window.rooms,
            roomDataCache: window.roomDataCache,
            previousLiveStatus: window.previousLiveStatus,
            notificationsEnabled: window.notificationsEnabled,
            loaderStartTime
        });

        console.log('[LiveRadar] All modules initialized');

        // Step 3: Initialize feature modules (don't call init functions - let init.js handle it)
        initNotificationAudio();
        initNotifications();
        initSnow();
        initStatusTicker();

        console.log('[LiveRadar] Features initialized');

        // Step 4: Run main init() - this will handle:
        // - UI setup (buttons, placeholders, etc.)
        // - Cache cleanup
        // - Initial render (if cache exists)
        // - First refresh
        // - Auto-refresh setup
        // - Audio setup
        // - Network monitoring
        // - All other initialization
        await init();

        console.log('[LiveRadar] Initialization complete');
    } catch (error) {
        console.error('[LiveRadar] Initialization error:', error);
        window.showToast?.('应用初始化失败，请刷新页面重试', 'error');
    }
}

// ============================================================
// 7. Start Application
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM already loaded
    initializeApp();
}

// ============================================================
// 8. Development Hot Reload Support
// ============================================================
if (import.meta.hot) {
    import.meta.hot.accept();
}

console.log('[LiveRadar] main.js loaded');

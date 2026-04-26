/**
 * ====================================================================
 * Application Initialization - Bootstrap Sequence
 * ====================================================================
 *
 * Handles complete application initialization sequence:
 * - File protocol warning check
 * - UI state initialization
 * - Cache cleanup and data migration
 * - Audio system setup
 * - Network monitoring
 * - Event listeners attachment
 * - Initial data fetch
 *
 * @module core/init
 */

import { ResourceManager } from '../utils/resource-manager.js';
import { getDOMCache } from '../utils/dom-cache.js';
import { PLACEHOLDERS } from '../config/ui-strings.js';
import { PLATFORM_CONFIG } from '../config/constants.js';
import { updateRoomDataCache } from './state.js';
import { unlockAllAudio as unlockAllAudioManager } from '../features/audio/audio-manager.js';
import { playYahahaSound } from '../features/audio/sound-effects.js';
import { getRoomCacheKey, showToast } from '../utils/helpers.js';
import { emit, Events } from './event-bus.js';
import { updateSnowBtn } from '../features/enhancements/snow-effect-loader.js';

// External dependencies (injected)
let rooms = [];
let roomDataCache = {};
let previousLiveStatus = {};

/**
 * Initialize init module with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initAppDependencies(deps) {
    if (deps.rooms) rooms = deps.rooms;
    if (deps.roomDataCache) roomDataCache = deps.roomDataCache;
    if (deps.previousLiveStatus) previousLiveStatus = deps.previousLiveStatus;
}

// ====================================================================
// UI Initialization Functions
// ====================================================================

/**
 * Update platform input placeholder
 * 优化：使用DOM缓存
 */
function updatePlaceholder() {
    const cache = getDOMCache();
    const p = cache.platformSelect?.value;
    if (!cache.roomIdInput) return;

    cache.roomIdInput.placeholder = PLACEHOLDERS[p] || "输入 ID...";

    const platformColor = PLATFORM_CONFIG[p]?.color || '#ff5d23';
    cache.selectorTrigger?.style.setProperty('--selected-platform-color', platformColor);
    if (cache.currentPlatformLabel) {
        cache.currentPlatformLabel.style.color = platformColor;
    }
    if (cache.selectedIndicator) {
        cache.selectedIndicator.style.backgroundColor = platformColor;
        cache.selectedIndicator.style.boxShadow = `0 0 8px ${platformColor}`;
    }
}

// ====================================================================
// Network Monitoring
// ====================================================================

/**
 * Initialize network status monitoring
 */
function initNetworkMonitor() {
    let wasOffline = false;

    ResourceManager.addEventListener(window, 'online', () => {
        if (wasOffline) {
            showToast('网络已恢复，正在刷新...', 'info');
            emit(Events.REFRESH_REQUEST);
        }
        wasOffline = false;
    });

    ResourceManager.addEventListener(window, 'offline', () => {
        wasOffline = true;
        showToast('网络连接已断开', 'error');
    });

    console.log('[Network] Network monitor initialized');
}

// ====================================================================
// Back to Top Button
// ====================================================================

/**
 * Initialize back-to-top button with scroll tracking
 */
function initBackToTopButton() {
    const btn = getDOMCache().backToTop || document.getElementById('back-to-top');
    if (!btn) return;

    // Performance optimization: Use requestAnimationFrame to throttle scroll events
    let ticking = false;

    const handleScroll = () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                // Toggle hidden-btn class: remove when scrolled > 300px (show button)
                btn.classList.toggle('hidden-btn', window.scrollY <= 300);
                ticking = false;
            });
            ticking = true;
        }
    };

    ResourceManager.addEventListener(window, 'scroll', handleScroll, { passive: true });

    // Click handler
    ResourceManager.addEventListener(btn, 'click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    console.log('[UI] Back-to-top button initialized');
}

// ====================================================================
// Bilibili Cache Cleanup (Data Migration)
// ====================================================================

/**
 * Clean up Bilibili cache with missing avatars (force re-fetch)
 */
function cleanupBilibiliCache() {
    let cacheFixed = false;

    Object.keys(roomDataCache).forEach(key => {
        if (key.startsWith('bilibili-')) {
            const data = roomDataCache[key];
            const roomId = key.replace('bilibili-', '');

            // If no avatar or owner is still room ID, clear cache to force re-fetch
            if (!data.avatar || data.owner === roomId || data.owner === String(roomId)) {
                console.log(`[Cache Cleanup] Cleaning Bilibili cache: ${key}, owner=${data.owner}, avatar=${!!data.avatar}`);
                delete roomDataCache[key].avatar;
                delete roomDataCache[key].lastAvatarUpdate;
                // Don't delete owner, let logic know it needs updating
                cacheFixed = true;
            }
        }
    });

    if (cacheFixed) {
        updateRoomDataCache(roomDataCache, true);
        console.log('[Cache Cleanup] Bilibili cache cleaned, will re-fetch avatars');
    }
}

// ====================================================================
// Secret Audio Test Button Setup
// ====================================================================

/**
 * Setup secret audio test button
 */
function setupSecretAudioButton() {
    const secretButton = document.getElementById('secret-audio-button');
    if (!secretButton) return;

    ResourceManager.addEventListener(secretButton, 'click', (e) => {
        e.stopPropagation(); // Prevent event bubbling

        // Visual feedback stays in CSS so the logo hover transform remains intact.
        secretButton.classList.add('is-audio-pinging');
        const timerId = setTimeout(() => {
            secretButton.classList.remove('is-audio-pinging');
        }, 200);
        ResourceManager.addTimer(timerId);

        // If audio not unlocked, unlock first
        if (!window.audioContextUnlocked) {
            // Play immediately within user gesture, then unlock in background.
            playYahahaSound(true);
            Promise.resolve(unlockAllAudioManager({ silent: true }));
        } else {
            // Already unlocked, play directly
            playYahahaSound(true);
        }
        showToast('🎵 Yahaha~', 'info');

        console.log(`[Secret Button] 🔴 Yahaha sound triggered! Audio status: ${window.audioContextUnlocked ? 'Unlocked' : 'Locked'}`);
    });
}

// ====================================================================
// Initial Live Status Snapshot
// ====================================================================

/**
 * Initialize status snapshot to avoid false positives on first refresh
 */
function initializeStatusSnapshot() {
    rooms.forEach(room => {
        const key = getRoomCacheKey(room.platform, room.id);
        const cachedData = roomDataCache[key];
        if (cachedData && !cachedData.loading && !cachedData.isError) {
            previousLiveStatus[key] = cachedData.isLive === true;
        }
    });
}

// ====================================================================
// Main Initialization Function
// ====================================================================

/**
 * Main application initialization function
 */
export function init() {
    // Update UI states
    updatePlaceholder();

    updateSnowBtn();

    // Setup secret audio test button
    setupSecretAudioButton();

    // Clean up Bilibili cache with missing avatars, force re-fetch
    cleanupBilibiliCache();

    // Check if cache exists
    const hasCache = Object.keys(roomDataCache).length > 0;

    // Initialize status snapshot to avoid false status-change messages on first refresh
    initializeStatusSnapshot();

    // If cache exists, render immediately
    if (hasCache) {
        emit(Events.RENDER_REQUEST);
    }

    // Start initial refresh (silent if no cache)
    emit(Events.REFRESH_REQUEST, !hasCache);

    // Feature initialization runs during bootstrap before init()

    // Network status monitoring
    initNetworkMonitor();

    // Back to top button
    initBackToTopButton();

    console.log('[Init] Application initialization complete');
}

// ====================================================================
// Exports
// ====================================================================

export default init;

export {
    updatePlaceholder,
    initNetworkMonitor,
    initBackToTopButton
};

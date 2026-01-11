/**
 * ====================================================================
 * Application Initialization - Bootstrap Sequence
 * ====================================================================
 *
 * Handles complete application initialization sequence:
 * - File protocol warning check
 * - Region detection (handled during bootstrap)
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
import { updateRoomDataCache, isNotificationsEnabled } from './state.js';
import { unlockAllAudio as unlockAllAudioManager } from '../features/audio/audio-manager.js';
import { playNotificationSound as playNotificationSoundManager } from '../features/audio/notification-audio.js';

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
            if (window.showToast) window.showToast('网络已恢复，正在刷新...', 'info');
            if (window.refreshAll) window.refreshAll();
        }
        wasOffline = false;
    });

    ResourceManager.addEventListener(window, 'offline', () => {
        wasOffline = true;
        if (window.showToast) window.showToast('网络连接已断开', 'error');
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
    const btn = document.getElementById('back-to-top');
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
    btn.addEventListener('click', () => {
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

    secretButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling

        // Visual feedback: scale animation
        secretButton.style.transform = 'scale(1.5)';
        const timerId = setTimeout(() => {
            secretButton.style.transform = 'scale(1)';
        }, 200);
        ResourceManager.addTimer(timerId);

        // If audio not unlocked, unlock first
        if (!window.audioContextUnlocked) {
            // Play immediately within user gesture, then unlock in background
            playNotificationSoundManager(true, true); // force play and bypass unlock check
            Promise.resolve(unlockAllAudioManager({ silent: true }));
            if (window.showToast) window.showToast('🎵 Yahaha~', 'info');
        } else {
            // Already unlocked, play directly
            playNotificationSoundManager(true, true); // force play and bypass unlock check
            if (window.showToast) window.showToast('🎵 Yahaha~', 'info');
        }

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
        const key = `${room.platform}-${room.id}`;
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
    // Region detection is handled by initRegionDetection during bootstrap

    // Update UI states
    if (window.updatePlaceholder) window.updatePlaceholder();
    else updatePlaceholder();

    if (window.updateNotifyBtn) window.updateNotifyBtn();
    if (window.updateSnowBtn) window.updateSnowBtn();

    // Setup secret audio test button
    setupSecretAudioButton();

    // Clean up Bilibili cache with missing avatars, force re-fetch
    cleanupBilibiliCache();

    // Check if cache exists
    const hasCache = Object.keys(roomDataCache).length > 0;

    // Initialize status snapshot to avoid false notifications on first refresh
    initializeStatusSnapshot();

    // If cache exists, render immediately
    if (hasCache) {
        if (window.renderAll) window.renderAll();
    }

    // Start initial refresh (silent if no cache)
    if (window.refreshAll) window.refreshAll(!hasCache);

    // Note: initAutoRefresh(), initAudioManager(), and initRegionDetection()
    // are now called in main.js before init() to ensure proper initialization

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

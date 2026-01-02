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

import { APP_CONFIG } from '../config/constants.js';
import { SafeStorage } from '../utils/safe-storage.js';
import { ResourceManager } from '../utils/resource-manager.js';
import { checkFileProtocol } from './file-protocol-warning.js';
import { getDOMCache } from '../utils/dom-cache.js';

// External dependencies (injected)
let rooms = [];
let roomDataCache = {};
let previousLiveStatus = {};
let notificationsEnabled = false;
let notifyAudio = null;
let loaderStartTime = Date.now();

const MIN_LOADER_DISPLAY_TIME = 1500; // Minimum display 1.5 seconds

/**
 * Initialize init module with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initAppDependencies(deps) {
    if (deps.rooms) rooms = deps.rooms;
    if (deps.roomDataCache) roomDataCache = deps.roomDataCache;
    if (deps.previousLiveStatus) previousLiveStatus = deps.previousLiveStatus;
    if (deps.notificationsEnabled !== undefined) notificationsEnabled = deps.notificationsEnabled;
    if (deps.notifyAudio) notifyAudio = deps.notifyAudio;
    if (deps.loaderStartTime !== undefined) loaderStartTime = deps.loaderStartTime;
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

    const placeholders = {
        twitch: "输入 ID (如 xqc)...",
        douyu: "输入房间号...",
        bilibili: "输入房间号..."
    };
    cache.roomIdInput.placeholder = placeholders[p] || "输入 ID...";
}

/**
 * Update notification button state
 * 优化：使用DOM缓存
 */
function updateNotifyBtn() {
    const btn = getDOMCache().notifyBtn;
    if (!btn) return;

    if (notificationsEnabled) {
        btn.classList.remove('off');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg><span>推送: 开</span>`;
    } else {
        btn.classList.add('off');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg><span>推送: 关</span>`;
    }
}

/**
 * Update snow effect button state
 * 优化：使用DOM缓存
 */
function updateSnowBtn() {
    const cache = getDOMCache();
    if (!cache.snowToggleBtn) return;

    const snowEnabled = SafeStorage.getItem('pro_snow_enabled', 'false') === 'true';

    if (snowEnabled) {
        cache.snowToggleBtn.classList.add('active');
        cache.snowToggleBtn.innerHTML = '❄️ <span class="ml-1">雪花: 开</span>';
        if (cache.snowCanvas) cache.snowCanvas.style.display = 'block';
    } else {
        cache.snowToggleBtn.classList.remove('active');
        cache.snowToggleBtn.innerHTML = '❄️ <span class="ml-1">雪花: 关</span>';
        if (cache.snowCanvas) cache.snowCanvas.style.display = 'none';
    }
}

/**
 * Update region button state
 * 优化：使用DOM缓存
 */
function updateRegionButtonState() {
    const cache = getDOMCache();
    if (!cache.regionBtn || !cache.regionLabel) return;

    const manualMode = SafeStorage.getItem('manual_region_mode');
    const isMainland = APP_CONFIG.REGION.IS_MAINLAND_CHINA;

    if (manualMode === 'mainland') {
        cache.regionLabel.textContent = '🇨🇳 国内';
        cache.regionBtn.title = '当前: 国内模式 (手动)';
    } else if (manualMode === 'overseas') {
        cache.regionLabel.textContent = '🌍 海外';
        cache.regionBtn.title = '当前: 海外模式 (手动)';
    } else {
        // Auto mode
        if (isMainland) {
            cache.regionLabel.textContent = '🇨🇳 国内';
            cache.regionBtn.title = '当前: 国内模式 (自动检测)';
        } else {
            cache.regionLabel.textContent = '🌍 海外';
            cache.regionBtn.title = '当前: 海外模式 (自动检测)';
        }
    }
}

// ====================================================================
// Audio Initialization - DEPRECATED
// NOTE: These functions are deprecated and kept only for backward compatibility.
// Audio initialization is now handled by initAudioManager() in audio-manager.js
// ====================================================================

/**
 * Unlock all audio contexts (iOS compatibility)
 * @deprecated Use unlockAllAudio from audio-manager.js instead
 */
function unlockAllAudio() {
    if (window.audioContextUnlocked) return;

    const promises = [];

    // 1. Unlock notification audio
    if (notifyAudio) {
        const p1 = notifyAudio.play().then(() => {
            notifyAudio.pause();
            notifyAudio.currentTime = 0;
            console.log('[Audio] Notification audio unlocked');
        }).catch(() => {});
        promises.push(p1);
    }

    // 2. Unlock keep-alive audio (if exists)
    const keepAliveAudio = window.keepAliveAudio;
    if (keepAliveAudio) {
        const p2 = keepAliveAudio.play().then(() => {
            keepAliveAudio.pause();
            keepAliveAudio.currentTime = 0;
            console.log('[Audio] Keep-alive audio unlocked');
        }).catch(() => {});
        promises.push(p2);
    }

    Promise.all(promises).then(() => {
        window.audioContextUnlocked = true;
        console.log('[Audio] All audio contexts unlocked');
        // Audio unlocked silently - no toast notification
        // Only play sound when user explicitly enables notifications
    }).catch(err => {
        console.warn('[Audio] Audio unlock failed:', err);
    });
}

/**
 * Play notification sound
 * @param {boolean} isTest - Whether this is a test playback
 * @deprecated Kept for backward compatibility
 */
function playNotificationSound(isTest = false) {
    // Allow secret button to bypass notification switch
    const isSecretButtonTest = isTest === true;

    // Skip if notifications off, audio not initialized, or iOS device (unless secret button test)
    if ((!notificationsEnabled && !isSecretButtonTest) || !notifyAudio) {
        return;
    }

    try {
        notifyAudio.currentTime = 0;
        notifyAudio.volume = 0.6;
        notifyAudio.play().catch(err => {
            console.warn('[Audio] Playback failed:', err);
        });
    } catch (e) {
        console.warn('[Audio] Playback error:', e);
    }
}

/**
 * Initialize audio system
 * @deprecated This function is deprecated. Use initAudioManager() from audio-manager.js instead
 */
function initAudio() {
    console.warn('[Init] initAudio() is deprecated - initialization now handled by initAudioManager()');
}

// ====================================================================
// Auto-Refresh Initialization - DEPRECATED
// NOTE: This function is deprecated. Use initAutoRefresh() from auto-refresh.js instead
// ====================================================================

/**
 * Initialize auto-refresh system
 * @deprecated Use initAutoRefresh() from auto-refresh.js instead
 */
function initAutoRefresh() {
    console.warn('[Init] initAutoRefresh() is deprecated - initialization now handled by auto-refresh.js');
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
        SafeStorage.setJSON('pro_room_cache', roomDataCache);
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
        setTimeout(() => {
            secretButton.style.transform = 'scale(1)';
        }, 200);

        // If audio not unlocked, unlock first
        if (!window.audioContextUnlocked) {
            unlockAllAudio();
            // Wait for unlock then play
            setTimeout(() => {
                playNotificationSound(true); // true = force play
                if (window.showToast) window.showToast('🎵 Yahaha~', 'info');
            }, 100);
        } else {
            // Already unlocked, play directly
            playNotificationSound(true); // true = force play
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
    // File Protocol detection: Check if using file:// protocol and show warning
    checkFileProtocol();

    // Region detection is handled by initRegionDetection during bootstrap

    // Update UI states
    if (window.updatePlaceholder) window.updatePlaceholder();
    else updatePlaceholder();

    if (window.updateNotifyBtn) window.updateNotifyBtn();
    else updateNotifyBtn();

    if (window.updateSnowBtn) window.updateSnowBtn();
    else updateSnowBtn();

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

        // Ensure loader displays for at least 1.5 seconds before removal (even with cache)
        const l = document.getElementById('initial-loader');
        if (l) {
            const elapsedTime = Date.now() - loaderStartTime;
            const remainingTime = Math.max(0, MIN_LOADER_DISPLAY_TIME - elapsedTime);

            const timerId = setTimeout(() => {
                l.style.opacity = '0';
                // 恢复主内容的可见性 - 移除loading class
                document.body.classList.remove('loading');
                document.body.style.overflow = '';
                const fadeTimerId = setTimeout(() => l.remove(), APP_CONFIG.UI.LOADER_FADE_DURATION);
                ResourceManager.addTimer(fadeTimerId);
            }, remainingTime);
            ResourceManager.addTimer(timerId);
        }
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
    updateNotifyBtn,
    updateSnowBtn,
    updateRegionButtonState,
    unlockAllAudio,
    playNotificationSound,
    initAudio,
    initAutoRefresh,
    initNetworkMonitor,
    initBackToTopButton
};

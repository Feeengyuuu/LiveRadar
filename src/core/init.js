/**
 * ====================================================================
 * Application Initialization - Bootstrap Sequence
 * ====================================================================
 *
 * Handles complete application initialization sequence:
 * - File protocol warning check
 * - Region detection and Twitch availability
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
// Region Detection
// ====================================================================

/**
 * Detect user region (Mainland China vs Overseas)
 * @returns {Promise<boolean>} True if mainland China, false otherwise
 */
async function detectUserRegion() {
    if (!APP_CONFIG.REGION.AUTO_DETECT) {
        console.log('[Region Detection] Auto-detect disabled');
        return false;
    }

    console.log('[Region Detection] Starting IP geolocation detection...');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.REGION.DETECTION_TIMEOUT);

        const response = await fetch('https://ipapi.co/json/', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn('[Region Detection] API request failed:', response.status);
            return false;
        }

        const data = await response.json();
        console.log('[Region Detection] API response:', data);

        // Check if country code is CN (China)
        const isMainland = data.country_code === 'CN';
        APP_CONFIG.REGION.IS_MAINLAND_CHINA = isMainland;

        console.log(`[Region Detection] Result: ${isMainland ? 'Mainland China' : 'Overseas'}`);
        return isMainland;
    } catch (error) {
        console.warn('[Region Detection] Detection failed:', error.message);
        return false;
    }
}

// ====================================================================
// UI Initialization Functions
// ====================================================================

/**
 * Update platform input placeholder
 */
function updatePlaceholder() {
    const p = document.getElementById('platform-select')?.value;
    const i = document.getElementById('room-id-input');
    if (!i) return;

    const placeholders = {
        twitch: "输入 ID (如 xqc)...",
        douyu: "输入房间号...",
        bilibili: "输入房间号..."
    };
    i.placeholder = placeholders[p] || "输入 ID...";
}

/**
 * Update notification button state
 */
function updateNotifyBtn() {
    const btn = document.getElementById('notify-btn');
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
 */
function updateSnowBtn() {
    const btn = document.getElementById('snow-toggle-btn');
    const canvas = document.getElementById('snow-canvas');
    if (!btn) return;

    const snowEnabled = SafeStorage.getItem('snow_effect_enabled') === 'true';

    if (snowEnabled) {
        btn.classList.add('active');
        btn.innerHTML = '❄️ <span class="ml-1">雪花: 开</span>';
        if (canvas) canvas.style.display = 'block';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '❄️ <span class="ml-1">雪花: 关</span>';
        if (canvas) canvas.style.display = 'none';
    }
}

/**
 * Update region button state
 */
function updateRegionButtonState() {
    const btn = document.getElementById('region-btn');
    const label = document.getElementById('region-label');
    if (!btn || !label) return;

    const manualMode = SafeStorage.getItem('manual_region_mode');
    const isMainland = APP_CONFIG.REGION.IS_MAINLAND_CHINA;

    if (manualMode === 'mainland') {
        label.textContent = '🇨🇳 国内';
        btn.title = '当前: 国内模式 (手动)';
    } else if (manualMode === 'overseas') {
        label.textContent = '🌍 海外';
        btn.title = '当前: 海外模式 (手动)';
    } else {
        // Auto mode
        if (isMainland) {
            label.textContent = '🇨🇳 国内';
            btn.title = '当前: 国内模式 (自动检测)';
        } else {
            label.textContent = '🌍 海外';
            btn.title = '当前: 海外模式 (自动检测)';
        }
    }
}

// ====================================================================
// Audio Initialization
// ====================================================================

/**
 * Unlock all audio contexts (iOS compatibility)
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

        // Show toast notification (only once)
        if (!window.hasShownAudioUnlockToast) {
            window.hasShownAudioUnlockToast = true;
            if (window.showToast) {
                window.showToast('🔊 音频已激活', 'info');
            }
        }
    }).catch(err => {
        console.warn('[Audio] Audio unlock failed:', err);
    });
}

/**
 * Play notification sound
 * @param {boolean} isTest - Whether this is a test playback
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
 */
function initAudio() {
    // Update keep-alive button if exists
    if (window.updateKeepAliveBtn) window.updateKeepAliveBtn();

    // Add global one-time event listeners to unlock all audio
    document.addEventListener('click', unlockAllAudio, { once: true });
    document.addEventListener('touchstart', unlockAllAudio, { once: true });

    console.log('[Audio] Audio system initialized, waiting for user interaction to unlock');
}

// ====================================================================
// Auto-Refresh Initialization
// ====================================================================

/**
 * Initialize auto-refresh system
 */
function initAutoRefresh() {
    const autoRefreshEnabled = SafeStorage.getItem('pro_auto_refresh') === 'true';
    if (autoRefreshEnabled && window.startAutoRefreshTimer) {
        window.startAutoRefreshTimer();
    }
    if (window.updateAutoRefreshBtn) {
        window.updateAutoRefreshBtn();
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

    // Region detection: Priority detect user region (async, non-blocking)
    detectUserRegion().then(isMainland => {
        if (isMainland) {
            console.log('[Init] Mainland China user, Twitch features disabled');
        }
    }).catch(err => {
        console.warn('[Init] Region detection failed:', err.message);
    });

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

    // Initialize auto-refresh
    initAutoRefresh();

    // Initialize region button state
    updateRegionButtonState();

    // Initialize global audio manager
    initAudio();

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
    detectUserRegion,
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

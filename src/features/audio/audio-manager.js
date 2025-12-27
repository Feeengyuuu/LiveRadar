/**
 * Audio Manager Module
 * Keep-alive audio and global audio context unlock for iOS/Chrome
 */

import { SafeStorage } from '../../utils/safe-storage.js';
import { APP_CONFIG } from '../../config/constants.js';
import { getNotificationAudio } from './notification-audio.js';

// State
let keepAliveEnabled = SafeStorage.getItem('pro_keepalive_enabled', 'false') === 'true';
let keepAliveAudio = null;

// Global audio unlock state
window.audioContextUnlocked = false;
window.hasShownAudioUnlockToast = false;

/**
 * Unlock all audio contexts (iOS/Chrome requirement)
 * Must be triggered by user interaction (click/touch)
 */
export function unlockAllAudio() {
    if (window.audioContextUnlocked) return;

    const promises = [];

    // 1. Unlock notification audio
    const notifyAudio = getNotificationAudio();
    if (notifyAudio) {
        notifyAudio.volume = 0; // Must be muted for unlocking
        const notifyPromise = notifyAudio.play()
            .then(() => {
                notifyAudio.pause();
                notifyAudio.currentTime = 0;
                notifyAudio.volume = APP_CONFIG.AUDIO.NOTIFICATION_VOLUME;
                if (APP_CONFIG.DEBUG.LOG_AUDIO) {
                    console.log(`[Audio Manager] ✓ Notification audio unlocked, volume: ${(APP_CONFIG.AUDIO.NOTIFICATION_VOLUME * 100).toFixed(0)}%`);
                }
            })
            .catch(err => console.warn('[Audio Manager] Notification unlock failed:', err));
        promises.push(notifyPromise);
    }

    // 2. Unlock keep-alive audio
    if (!keepAliveAudio) {
        keepAliveAudio = document.getElementById('bg-keepalive');
    }
    if (keepAliveAudio) {
        keepAliveAudio.volume = 0;
        const keepAlivePromise = keepAliveAudio.play()
            .then(() => {
                keepAliveAudio.pause();
                keepAliveAudio.currentTime = 0;
            })
            .catch(err => console.warn('[Audio Manager] Keep-alive unlock failed:', err));
        promises.push(keepAlivePromise);
    }

    Promise.all(promises).then(() => {
        if (promises.length > 0) {
            window.audioContextUnlocked = true;
            console.log('[Audio Manager] Global audio context unlocked');
            window.showToast?.('音效已激活', 'info');

            // If keep-alive is enabled, start it immediately
            if (keepAliveEnabled) {
                startKeepAlive();
            }
        }
    });

    // Only try once, remove event listeners
    document.removeEventListener('click', unlockAllAudio);
    document.removeEventListener('touchstart', unlockAllAudio);
}

/**
 * Update keep-alive button UI
 */
function updateKeepAliveBtn() {
    const btn = document.getElementById('keepalive-btn');
    const label = document.getElementById('keepalive-label');
    if (!btn || !label) return;

    if (keepAliveEnabled) {
        btn.classList.remove('off');
        label.textContent = '防休眠: 开';
    } else {
        btn.classList.add('off');
        label.textContent = '防休眠: 关';
    }
}

/**
 * Toggle keep-alive mode
 */
export function toggleKeepAlive() {
    keepAliveEnabled = !keepAliveEnabled;
    SafeStorage.setItem('pro_keepalive_enabled', keepAliveEnabled);

    if (keepAliveEnabled) {
        startKeepAlive();
        window.showToast?.('防休眠模式已开启');
    } else {
        stopKeepAlive();
        window.showToast?.('防休眠模式已关闭');
    }
    updateKeepAliveBtn();
}

/**
 * Start keep-alive audio
 */
function startKeepAlive() {
    if (!keepAliveAudio) {
        keepAliveAudio = document.getElementById('bg-keepalive');
    }
    if (!keepAliveAudio) {
        console.error('[Audio Manager] Keep-alive audio element not found');
        return;
    }

    if (window.audioContextUnlocked) {
        keepAliveAudio.volume = 0.01; // Very low volume
        keepAliveAudio.play().catch(error => {
            console.warn('[Audio Manager] Keep-alive play failed:', error);
        });
        console.log('[Audio Manager] Keep-alive audio started');
    } else {
        console.log('[Audio Manager] Waiting for user interaction to unlock audio');
        if (!window.hasShownAudioUnlockToast) {
            window.showToast?.('请点击页面任意处以激活防休眠模式', 'info');
            window.hasShownAudioUnlockToast = true;
        }
    }
}

/**
 * Stop keep-alive audio
 */
function stopKeepAlive() {
    if (keepAliveAudio) {
        keepAliveAudio.pause();
        keepAliveAudio.currentTime = 0;
        console.log('[Audio Manager] Keep-alive audio stopped');
    }
}

/**
 * Initialize audio manager
 */
export function initAudioManager() {
    updateKeepAliveBtn();

    // Add global event listeners to unlock audio (once)
    document.addEventListener('click', unlockAllAudio, { once: true });
    document.addEventListener('touchstart', unlockAllAudio, { once: true });

    // If enabled and already unlocked, start keep-alive
    if (keepAliveEnabled && window.audioContextUnlocked) {
        startKeepAlive();
    }

    console.log('[Audio Manager] Initialized');
}

// Make globally accessible for onclick handlers
window.toggleKeepAlive = toggleKeepAlive;
window.unlockAllAudio = unlockAllAudio;

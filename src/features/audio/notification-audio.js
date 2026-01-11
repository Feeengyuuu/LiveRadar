/**
 * Notification Audio Module
 * Sound playback for live notifications with iOS compatibility
 */

import { APP_CONFIG } from '../../config/constants.js';
import { DeviceDetector } from '../../utils/device-detector.js';

// Notification sound file path
const NOTIFY_SOUND_PATH = '/yahaha.mp3';

// Audio instance
let notifyAudio = null;

/**
 * Initialize notification audio
 */
export function initNotificationAudio() {
    try {
        notifyAudio = new Audio(NOTIFY_SOUND_PATH);
        console.log('[Notification Audio] Audio initialized with yahaha.mp3');
    } catch (error) {
        console.error('[Notification Audio] Failed to initialize:', error);
    }

    return notifyAudio;
}

/**
 * Play notification sound
 * @param {boolean} forcePlay - Force play even if notifications disabled (for testing)
 */
export function playNotificationSound(forcePlay = false, bypassUnlock = false) {
    // Check if notification enabled (bypass if force play)
    const notificationsEnabled = window.notificationsEnabled || false;
    if (!notificationsEnabled && !forcePlay) {
        return;
    }

    // Check if audio initialized
    if (!notifyAudio) {
        console.warn('[Notification Audio] Audio not initialized');
        return;
    }

    // iOS audio restrictions (can be enabled in config)
    if (DeviceDetector.isiOS() && !APP_CONFIG.AUDIO.ENABLE_ON_IOS) {
        if (APP_CONFIG.DEBUG.LOG_AUDIO) {
            console.warn('[Notification Audio] iOS audio disabled (can be enabled in config)');
        }
        return;
    }

    // Check if audio context unlocked (iOS/Chrome requirement)
    if (!window.audioContextUnlocked && !bypassUnlock) {
        if (APP_CONFIG.DEBUG.LOG_AUDIO) {
            console.warn('[Notification Audio] Audio context not unlocked yet');
        }

        // Show hint to user (only once)
        if (!window.hasShownAudioUnlockToast) {
            window.showToast?.('💡 提示：请点击页面任意处以激活音效', 'info');
            window.hasShownAudioUnlockToast = true;
        }
        return;
    }

    // Play sound
    try {
        notifyAudio.currentTime = 0; // Reset to start
        notifyAudio.volume = APP_CONFIG.AUDIO.NOTIFICATION_VOLUME;
        const playPromise = notifyAudio.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => {
                window.audioContextUnlocked = true;
            }).catch(error => {
                if (APP_CONFIG.DEBUG.LOG_AUDIO) {
                    console.warn('[Notification Audio] Play failed:', error);
                }
            });
        }

        if (APP_CONFIG.DEBUG.LOG_AUDIO) {
            console.log(`[Notification Audio] Playing notification sound, volume: ${(notifyAudio.volume * 100).toFixed(0)}%`);
        }
    } catch (error) {
        console.error('[Notification Audio] Playback error:', error);
    }
}

/**
 * Get notification audio instance
 * @returns {Audio|null} Audio instance
 */
export function getNotificationAudio() {
    return notifyAudio;
}

// Make globally accessible for onclick handlers and testing
window.playNotificationSound = playNotificationSound;

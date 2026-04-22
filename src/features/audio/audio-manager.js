/**
 * Audio Manager Module
 * Coordinates one-time notification audio unlock for iOS/Chrome.
 */

import { APP_CONFIG } from '../../config/constants.js';
import { getNotificationAudio } from './notification-audio.js';
import { showToast } from '../../utils/helpers.js';

let unlockPromise = null;

// Global audio unlock state
window.audioContextUnlocked = false;
window.hasShownAudioUnlockToast = false;

/**
 * Unlock notification audio context.
 * Must be triggered by user interaction (click/touch).
 */
export function unlockAllAudio(options = {}) {
    if (window.audioContextUnlocked) return Promise.resolve(true);

    const silent = options?.silent === true;
    if (unlockPromise) return unlockPromise;

    const notifyAudio = getNotificationAudio();
    if (!notifyAudio) {
        return Promise.resolve(false);
    }

    notifyAudio.volume = 0;

    unlockPromise = notifyAudio.play()
        .then(() => {
            notifyAudio.pause();
            notifyAudio.currentTime = 0;
            notifyAudio.volume = APP_CONFIG.AUDIO.NOTIFICATION_VOLUME;
            window.audioContextUnlocked = true;

            if (APP_CONFIG.DEBUG.LOG_AUDIO) {
                console.log(`[Audio Manager] ✓ Notification audio unlocked, volume: ${(APP_CONFIG.AUDIO.NOTIFICATION_VOLUME * 100).toFixed(0)}%`);
            }

            if (!silent) {
                showToast('音效已激活', 'info');
            }

            return true;
        })
        .catch(error => {
            console.warn('[Audio Manager] Notification unlock failed:', error);
            return false;
        })
        .finally(() => {
            unlockPromise = null;
            document.removeEventListener('click', unlockAllAudio);
            document.removeEventListener('touchstart', unlockAllAudio);
        });

    return unlockPromise;
}

/**
 * Initialize audio manager
 */
export function initAudioManager() {
    document.addEventListener('click', unlockAllAudio, { once: true });
    document.addEventListener('touchstart', unlockAllAudio, { once: true });

    console.log('[Audio Manager] Initialized');
}

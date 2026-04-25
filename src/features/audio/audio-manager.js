/**
 * Audio Manager Module
 * Coordinates one-time sound-effect unlock for iOS/Chrome.
 */

import { APP_CONFIG } from '../../config/constants.js';
import { getYahahaAudio } from './sound-effects.js';
import { showToast } from '../../utils/helpers.js';

let unlockPromise = null;

// Global audio unlock state
window.audioContextUnlocked = false;
window.hasShownAudioUnlockToast = false;

/**
 * Unlock sound-effect audio context.
 * Must be triggered by user interaction (click/touch).
 */
export function unlockAllAudio(options = {}) {
    if (window.audioContextUnlocked) return Promise.resolve(true);

    const silent = options?.silent === true;
    if (unlockPromise) return unlockPromise;

    const yahahaAudio = getYahahaAudio();
    if (!yahahaAudio) {
        return Promise.resolve(false);
    }

    yahahaAudio.volume = 0;

    unlockPromise = yahahaAudio.play()
        .then(() => {
            yahahaAudio.pause();
            yahahaAudio.currentTime = 0;
            yahahaAudio.volume = APP_CONFIG.AUDIO.SOUND_EFFECT_VOLUME;
            window.audioContextUnlocked = true;

            if (APP_CONFIG.DEBUG.LOG_AUDIO) {
                console.log(`[Audio Manager] Sound effects unlocked, volume: ${(APP_CONFIG.AUDIO.SOUND_EFFECT_VOLUME * 100).toFixed(0)}%`);
            }

            if (!silent) {
                showToast('Audio enabled', 'info');
            }

            return true;
        })
        .catch(error => {
            console.warn('[Audio Manager] Sound-effect unlock failed:', error);
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

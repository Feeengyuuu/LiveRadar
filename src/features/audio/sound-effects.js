/**
 * Sound Effects Module
 * Shared sound playback with iOS compatibility
 */

import { APP_CONFIG } from '../../config/constants.js';
import { DeviceDetector } from '../../utils/device-detector.js';
import { showToast } from '../../utils/helpers.js';

const YAHAHA_SOUND_PATH = '/yahaha.mp3';

let yahahaAudio = null;

/**
 * Initialize shared sound effects
 */
export function initSoundEffects() {
    try {
        yahahaAudio = new Audio(YAHAHA_SOUND_PATH);
        console.log('[Sound Effects] Audio initialized with yahaha.mp3');
    } catch (error) {
        console.error('[Sound Effects] Failed to initialize:', error);
    }

    return yahahaAudio;
}

/**
 * Play the shared yahaha sound effect.
 * @param {boolean} bypassUnlock - Play within a trusted user gesture even before global audio unlock.
 */
export function playYahahaSound(bypassUnlock = false) {
    // Check if audio initialized
    if (!yahahaAudio) {
        console.warn('[Sound Effects] Audio not initialized');
        return;
    }

    // iOS audio restrictions (can be enabled in config)
    if (DeviceDetector.isiOS() && !APP_CONFIG.AUDIO.ENABLE_ON_IOS) {
        if (APP_CONFIG.DEBUG.LOG_AUDIO) {
            console.warn('[Sound Effects] iOS audio disabled (can be enabled in config)');
        }
        return;
    }

    // Check if audio context unlocked (iOS/Chrome requirement)
    if (!window.audioContextUnlocked && !bypassUnlock) {
        if (APP_CONFIG.DEBUG.LOG_AUDIO) {
            console.warn('[Sound Effects] Audio context not unlocked yet');
        }

        // Show hint to user (only once)
        if (!window.hasShownAudioUnlockToast) {
            showToast('💡 提示：请点击页面任意处以激活音效', 'info');
            window.hasShownAudioUnlockToast = true;
        }
        return;
    }

    // Play sound
    try {
        yahahaAudio.currentTime = 0; // Reset to start
        yahahaAudio.volume = APP_CONFIG.AUDIO.SOUND_EFFECT_VOLUME;
        const playPromise = yahahaAudio.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => {
                window.audioContextUnlocked = true;
            }).catch(error => {
                if (APP_CONFIG.DEBUG.LOG_AUDIO) {
                    console.warn('[Sound Effects] Play failed:', error);
                }
            });
        }

        if (APP_CONFIG.DEBUG.LOG_AUDIO) {
            console.log(`[Sound Effects] Playing yahaha sound, volume: ${(yahahaAudio.volume * 100).toFixed(0)}%`);
        }
    } catch (error) {
        console.error('[Sound Effects] Playback error:', error);
    }
}

/**
 * Get yahaha audio instance
 * @returns {Audio|null} Audio instance
 */
export function getYahahaAudio() {
    return yahahaAudio;
}

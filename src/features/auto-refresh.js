/**
 * Auto Refresh Module
 * Automatic room status refresh with countdown timer
 *
 * Uses ResourceManager for proper timer lifecycle management
 * to prevent memory leaks.
 */

import { SafeStorage } from '../utils/safe-storage.js';
import { APP_CONFIG } from '../config/constants.js';
import { getDOMCache } from '../utils/dom-cache.js';
import { ResourceManager } from '../utils/resource-manager.js';
import { updateAutoRefreshEnabled } from '../core/state.js';

// State
let autoRefreshEnabled = SafeStorage.getItem('pro_auto_refresh', 'false') === 'true';
let autoRefreshTimer = null;
let autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;

/**
 * Format countdown in MM:SS format
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
function formatCountdown(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update auto-refresh button UI
 */
function updateAutoRefreshBtn() {
    const cache = getDOMCache();
    const btn = cache.autoRefreshBtn || document.getElementById('auto-refresh-btn');
    const label = cache.autoRefreshLabel || document.getElementById('auto-refresh-label');
    if (!btn || !label) return;

    if (autoRefreshEnabled) {
        btn.classList.remove('off');
        label.textContent = `自动: ${formatCountdown(autoRefreshCountdown)}`;
    } else {
        btn.classList.add('off');
        label.textContent = '自动: 关';
    }
}

/**
 * Reset auto-refresh countdown (used by manual refresh)
 */
export function resetAutoRefreshCountdown() {
    autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
    updateAutoRefreshBtn();
}

/**
 * Start auto-refresh timer
 * Uses ResourceManager for proper lifecycle management
 */
export function startAutoRefresh() {
    // Clear existing timer if any (using ResourceManager)
    if (autoRefreshTimer) {
        ResourceManager.clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;

    const timerId = setInterval(() => {
        autoRefreshCountdown--;
        updateAutoRefreshBtn();

        if (autoRefreshCountdown <= 0) {
            console.log('[自动刷新] 触发刷新');
            autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
            window.refreshAll?.(false, true); // Second parameter indicates auto-refresh
        }
    }, 1000);

    // Track with ResourceManager for proper cleanup
    autoRefreshTimer = ResourceManager.addInterval(timerId);
}

/**
 * Stop auto-refresh timer
 * Properly removes timer from ResourceManager
 */
export function stopAutoRefresh() {
    if (autoRefreshTimer) {
        ResourceManager.clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    autoRefreshCountdown = APP_CONFIG.AUTO_REFRESH.INTERVAL;
}

/**
 * Toggle auto-refresh on/off
 */
export function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    updateAutoRefreshEnabled(autoRefreshEnabled);

    if (autoRefreshEnabled) {
        startAutoRefresh();
        window.showToast?.("自动刷新已开启 (每10分钟)");
    } else {
        stopAutoRefresh();
        window.showToast?.("自动刷新已关闭");
    }
    updateAutoRefreshBtn();
}

/**
 * Initialize auto-refresh on page load
 */
export function initAutoRefresh() {
    if (autoRefreshEnabled) {
        startAutoRefresh();
    }
    updateAutoRefreshBtn();
}

// Make globally accessible for cross-module usage
window.updateAutoRefreshBtn = updateAutoRefreshBtn;
window.resetAutoRefreshCountdown = resetAutoRefreshCountdown;

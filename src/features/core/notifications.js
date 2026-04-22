/**
 * Notifications Module
 * Browser notification system with permission management
 */

import { isNotificationsEnabled, updateNotificationsEnabled } from '../../core/state.js';
import { getElement } from '../../utils/dom-cache.js';
import { DeviceDetector } from '../../utils/device-detector.js';
import { playNotificationSound } from '../audio/notification-audio.js';
import { showToast } from '../../utils/helpers.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createNotifyIconPath(enabled) {
    const path = document.createElementNS(SVG_NS, 'path');
    if (enabled) {
        path.setAttribute('d', 'M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z');
        path.setAttribute('fill', 'currentColor');
    } else {
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('d', 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9');
    }
    return path;
}

function ensureNotifyButtonParts(btn) {
    let icon = btn.querySelector('svg');
    if (!icon) {
        icon = document.createElementNS(SVG_NS, 'svg');
        icon.setAttribute('xmlns', SVG_NS);
        icon.setAttribute('class', 'h-4 w-4');
        btn.prepend(icon);
    }

    let label = btn.querySelector('span');
    if (!label) {
        label = document.createElement('span');
        btn.appendChild(label);
    }

    return { icon, label };
}

/**
 * Update notification button UI
 */
export function updateNotifyBtn() {
    const btn = getElement('notify-btn');
    if (!btn) return;

    const enabled = isNotificationsEnabled();
    const { icon, label } = ensureNotifyButtonParts(btn);

    if (enabled) {
        btn.classList.remove('off');
        icon.setAttribute('viewBox', '0 0 20 20');
        icon.setAttribute('fill', 'currentColor');
        icon.removeAttribute('stroke');
    } else {
        btn.classList.add('off');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
    }

    icon.replaceChildren(createNotifyIconPath(enabled));
    label.textContent = enabled ? '推送: 开' : '推送: 关';
}

/**
 * Toggle notifications on/off (with iOS compatibility)
 */
export function toggleNotifications() {
    // iOS Safari doesn't support Notification API
    if (!("Notification" in window) || DeviceDetector.isiOS()) {
        showToast(DeviceDetector.isiOS() ? "iOS暂不支持通知功能" : "浏览器不支持通知", "error");
        return;
    }

    // Toggle state
    if (isNotificationsEnabled()) {
        updateNotificationsEnabled(false);
        updateNotifyBtn();
        showToast("推送通知已关闭");
    } else {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                updateNotificationsEnabled(true);
                updateNotifyBtn();

                // Skip audio on iOS (strict audio restrictions)
                if (!DeviceDetector.isiOS()) {
                    playNotificationSound();
                }

                showToast("推送通知已开启");
                new Notification("LiveRadar", { body: "系统通知已连接" });
            } else {
                showToast("请允许通知权限", "error");
            }
        }).catch(error => {
            console.error("[通知] 请求失败", error);
            showToast("通知权限请求失败", "error");
        });
    }
}

/**
 * Request notification permission (without toggling)
 */
export function requestNotificationPermission() {
    if (!("Notification" in window) || DeviceDetector.isiOS()) {
        return Promise.resolve('denied');
    }

    return Notification.requestPermission();
}

/**
 * Check if notifications should be sent
 * @param {Object} room - Room object
 * @param {Object} data - Room data
 * @returns {boolean} Whether to send notification
 */
export function checkNotifications(room, data) {
    // Check if notifications are enabled
    if (!isNotificationsEnabled() || !data || !data.isLive) {
        return false;
    }

    if (!("Notification" in window) || Notification.permission !== "granted") {
        return false;
    }

    // Check if state changed from offline to online
    const cacheKey = `${room.platform}-${room.id}_notify_state`;
    const lastState = sessionStorage.getItem(cacheKey);
    const shouldNotify = lastState !== 'true' && data.isLive;

    // Update state
    sessionStorage.setItem(cacheKey, data.isLive ? 'true' : 'false');

    if (shouldNotify) {
        // Play notification sound ONLY for favorite streamers
        // 只有收藏的主播上线时才播放音效
        if (room.isFav && !DeviceDetector.isiOS()) {
            playNotificationSound();
        }

        // Send notification
        const ownerName = data.owner || room.id;
        new Notification(`🔴 ${ownerName} 开播了!`, {
            body: `关注的主播正在直播中`,
            icon: 'https://cdn-icons-png.flaticon.com/512/1162/1162232.png'
        });

        return true;
    }

    return false;
}

/**
 * Initialize notifications module
 */
export function initNotifications() {
    updateNotifyBtn();

    return {
        enabled: isNotificationsEnabled(),
        supported: "Notification" in window && !DeviceDetector.isiOS()
    };
}

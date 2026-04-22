// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const appState = {
        notificationsEnabled: false
    };

    return {
        appState,
        getElement: vi.fn((id) => document.getElementById(id)),
        updateNotificationsEnabled: vi.fn((enabled) => {
            appState.notificationsEnabled = enabled;
        }),
        isIOS: vi.fn(() => false),
        playNotificationSound: vi.fn(),
        showToast: vi.fn()
    };
});

vi.mock('../../../core/state.js', () => ({
    isNotificationsEnabled: () => mocks.appState.notificationsEnabled,
    updateNotificationsEnabled: mocks.updateNotificationsEnabled
}));

vi.mock('../../../utils/dom-cache.js', () => ({
    getElement: mocks.getElement
}));

vi.mock('../../../utils/device-detector.js', () => ({
    DeviceDetector: {
        isiOS: mocks.isIOS
    }
}));

vi.mock('../../audio/notification-audio.js', () => ({
    playNotificationSound: mocks.playNotificationSound
}));

vi.mock('../../../utils/helpers.js', () => ({
    showToast: mocks.showToast
}));

const { toggleNotifications, updateNotifyBtn } = await import('../notifications.js');

describe('notifications', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="notify-btn" class="notify-btn off"><span>推送: 关</span></button>';
        mocks.appState.notificationsEnabled = false;
        mocks.isIOS.mockReturnValue(false);
        mocks.playNotificationSound.mockReset();
        mocks.showToast.mockReset();
        mocks.updateNotificationsEnabled.mockClear();

        const NotificationMock = vi.fn();
        NotificationMock.requestPermission = vi.fn();
        NotificationMock.permission = 'granted';
        globalThis.Notification = NotificationMock;
    });

    it('reuses the existing button node while updating icon and label', () => {
        updateNotifyBtn();
        const initialIcon = document.querySelector('#notify-btn svg');

        mocks.appState.notificationsEnabled = true;
        updateNotifyBtn();

        expect(document.querySelector('#notify-btn svg')).toBe(initialIcon);
        expect(document.getElementById('notify-btn').classList.contains('off')).toBe(false);
        expect(document.getElementById('notify-btn').textContent).toContain('推送: 开');
    });

    it('enables notifications when permission is granted', async () => {
        globalThis.Notification.requestPermission.mockResolvedValue('granted');

        await toggleNotifications();
        await Promise.resolve();

        expect(mocks.updateNotificationsEnabled).toHaveBeenCalledWith(true);
        expect(mocks.playNotificationSound).toHaveBeenCalledTimes(1);
        expect(mocks.showToast).toHaveBeenCalledWith('推送通知已开启');
        expect(globalThis.Notification).toHaveBeenCalledWith('LiveRadar', { body: '系统通知已连接' });
    });

    it('shows an error toast when permission is denied', async () => {
        globalThis.Notification.requestPermission.mockResolvedValue('denied');

        await toggleNotifications();
        await Promise.resolve();

        expect(mocks.updateNotificationsEnabled).not.toHaveBeenCalled();
        expect(mocks.showToast).toHaveBeenCalledWith('请允许通知权限', 'error');
    });

    it('disables notifications immediately when already enabled', () => {
        mocks.appState.notificationsEnabled = true;

        toggleNotifications();

        expect(mocks.updateNotificationsEnabled).toHaveBeenCalledWith(false);
        expect(mocks.showToast).toHaveBeenCalledWith('推送通知已关闭');
        expect(document.getElementById('notify-btn').textContent).toContain('推送: 关');
    });
});

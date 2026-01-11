/**
 * Device Detection Utility
 * Provides unified device detection across the application
 * Prevents code duplication and ensures consistent behavior
 */

/**
 * Device detector singleton
 * @type {Object}
 */
export const DeviceDetector = {
    /**
     * Check if device is mobile
     * @returns {boolean}
     */
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    /**
     * Check if device is iOS
     * @returns {boolean}
     */
    isiOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    },

    /**
     * Check if device is Android
     * @returns {boolean}
     */
    isAndroid() {
        return /Android/i.test(navigator.userAgent);
    },

    /**
     * Check if device is tablet (iPad or Android tablet)
     * @returns {boolean}
     */
    isTablet() {
        const ua = navigator.userAgent;
        return /iPad/.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    },

    /**
     * Check if device is desktop
     * @returns {boolean}
     */
    isDesktop() {
        return !this.isMobile();
    },

    /**
     * Get device type string
     * @returns {'mobile'|'tablet'|'desktop'}
     */
    getDeviceType() {
        if (this.isTablet()) return 'tablet';
        if (this.isMobile()) return 'mobile';
        return 'desktop';
    },

    /**
     * Check if browser supports touch events
     * @returns {boolean}
     */
    hasTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
};

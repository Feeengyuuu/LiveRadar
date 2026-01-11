/**
 * Region Detector Module
 * IP-based geolocation detection for mainland China vs international users
 */

import { SafeStorage } from '../../utils/safe-storage.js';
import { APP_CONFIG } from '../../config/constants.js';

/**
 * Detect user's region based on IP address
 * Uses multiple free IP geolocation APIs with fallback
 * @returns {Promise<boolean>} True if mainland China, false otherwise
 */
export async function detectRegion() {
    if (!APP_CONFIG.REGION.AUTO_DETECT) {
        console.log('[地区检测] 自动检测已禁用');
        return false;
    }

    // Try multiple free IP APIs (ordered by reliability)
    const ipAPIs = [
        {
            name: 'ipapi.co',
            url: 'https://ipapi.co/json/',
            parse: (data) => data.country_code === 'CN'
        },
        {
            name: 'ip-api.com',
            url: 'https://ip-api.com/json/?fields=countryCode',
            parse: (data) => data.countryCode === 'CN'
        },
        {
            name: 'ipinfo.io',
            url: 'https://ipinfo.io/json',
            parse: (data) => data.country === 'CN'
        }
    ];

    for (const api of ipAPIs) {
        try {
            console.log(`[地区检测] 尝试使用 ${api.name}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.REGION.DETECTION_TIMEOUT);

            const response = await fetch(api.url, {
                signal: controller.signal,
                cache: 'no-cache'
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const isMainland = api.parse(data);

            APP_CONFIG.REGION.IS_MAINLAND_CHINA = isMainland;
            SafeStorage.setItem('user_region', isMainland ? 'CN' : 'INTL');
            SafeStorage.setItem('user_region_timestamp', Date.now().toString());

            console.log(`[地区检测] 检测成功 (${api.name}): ${isMainland ? '中国大陆' : '海外地区'}`);
            return isMainland;

        } catch (error) {
            console.warn(`[地区检测] ${api.name} 失败:`, error.message);
            continue; // Try next API
        }
    }

    // All APIs failed, check cache (with expiration validation)
    const cachedRegion = SafeStorage.getItem('user_region');
    const cachedTime = SafeStorage.getItem('user_region_timestamp');
    const CACHE_VALID_DAYS = 7; // Cache valid for 7 days
    const cacheAge = cachedTime ? (Date.now() - parseInt(cachedTime)) : Infinity;
    const isCacheValid = cacheAge < (CACHE_VALID_DAYS * 24 * 60 * 60 * 1000);

    if (cachedRegion && isCacheValid) {
        const isMainland = cachedRegion === 'CN';
        APP_CONFIG.REGION.IS_MAINLAND_CHINA = isMainland;
        const ageInDays = Math.floor(cacheAge / (24 * 60 * 60 * 1000));
        console.log(`[地区检测] 使用缓存 (${ageInDays}天前): ${isMainland ? '中国大陆' : '海外地区'}`);
        return isMainland;
    } else if (cachedRegion && !isCacheValid) {
        console.warn('[地区检测] 缓存已过期，清除旧数据');
        SafeStorage.removeItem('user_region');
        SafeStorage.removeItem('user_region_timestamp');
    }

    // Complete failure, default to international (conservative strategy, allow trying all platforms)
    console.warn('[地区检测] 所有检测失败且无有效缓存，默认为海外模式');
    APP_CONFIG.REGION.IS_MAINLAND_CHINA = false;
    return false;
}

/**
 * Toggle region mode manually
 * Allows user to override automatic detection
 */
export function toggleRegionMode() {
    const currentRegion = APP_CONFIG.REGION.IS_MAINLAND_CHINA;
    const newRegion = !currentRegion;

    APP_CONFIG.REGION.IS_MAINLAND_CHINA = newRegion;
    SafeStorage.setItem('user_region', newRegion ? 'CN' : 'INTL');
    SafeStorage.setItem('user_region_timestamp', Date.now().toString());

    updateRegionBtn();

    const regionText = newRegion ? '中国大陆' : '海外地区';
    window.showToast?.(`地区模式已切换: ${regionText}`);
    console.log(`[地区模式] 手动切换到: ${regionText}`);
}

/**
 * Update region button UI
 */
function updateRegionBtn() {
    const btn = document.getElementById('region-btn');
    const label = document.getElementById('region-label');
    if (!btn) return;

    const isMainland = APP_CONFIG.REGION.IS_MAINLAND_CHINA;

    if (isMainland) {
        btn.classList.add('mainland');
        btn.classList.remove('overseas');
        if (label) label.textContent = '地区: 国内';
    } else {
        btn.classList.add('overseas');
        btn.classList.remove('mainland');
        if (label) label.textContent = '地区: 海外';
    }
}

/**
 * Initialize region detection
 * Runs detection on page load if enabled
 */
export async function initRegionDetection() {
    // Check if we have a valid cached region first
    const cachedRegion = SafeStorage.getItem('user_region');
    const cachedTime = SafeStorage.getItem('user_region_timestamp');
    const CACHE_VALID_DAYS = 7;
    const cacheAge = cachedTime ? (Date.now() - parseInt(cachedTime)) : Infinity;
    const isCacheValid = cacheAge < (CACHE_VALID_DAYS * 24 * 60 * 60 * 1000);

    if (cachedRegion && isCacheValid) {
        APP_CONFIG.REGION.IS_MAINLAND_CHINA = cachedRegion === 'CN';
        console.log(`[地区检测] 使用缓存: ${APP_CONFIG.REGION.IS_MAINLAND_CHINA ? '中国大陆' : '海外地区'}`);
    } else {
        // Run detection
        await detectRegion();
    }

    updateRegionBtn();

    // Note: Global function exposure is handled by globals.js
    return APP_CONFIG.REGION.IS_MAINLAND_CHINA;
}

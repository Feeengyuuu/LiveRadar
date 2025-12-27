/**
 * ====================================================================
 * Platform Sniffers - API Integration for Streaming Platforms
 * ====================================================================
 *
 * Implements API integration for:
 * - Douyu (斗鱼): ratestream API + betard fallback
 * - Bilibili (哔哩哔哩): Room info + Master API for user data
 * - Twitch: DecAPI integration for status and metadata
 *
 * Features:
 * - Multi-tier API fallback strategies
 * - Parallel request optimization
 * - Live duration tracking
 * - Avatar and metadata fetching
 *
 * @module api/platform-sniffers
 */

import { APP_CONFIG } from '../config/constants.js';
import { fetchWithProxy, fetchQuick } from './proxy-manager.js';

// Global state - will be injected from outside
let imgTimestamp = Math.floor(Date.now() / APP_CONFIG.CACHE.IMAGE_TIMESTAMP_INTERVAL);
let roomDataCache = {};
let debouncedSaveCache = null;

/**
 * Initialize sniffer module with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initSniffers(deps) {
    if (deps.imgTimestamp !== undefined) imgTimestamp = deps.imgTimestamp;
    if (deps.roomDataCache) roomDataCache = deps.roomDataCache;
    if (deps.debouncedSaveCache) debouncedSaveCache = deps.debouncedSaveCache;
}

/**
 * Update image timestamp (called externally on refresh)
 * @param {number} timestamp - New timestamp value
 */
export function updateImgTimestamp(timestamp) {
    imgTimestamp = timestamp;
}

// ====================================================================
// Douyu (斗鱼) Sniffer
// ====================================================================

/**
 * Fetch Douyu room status
 * Priority: ratestream API (fastest/most stable) → betard API (fallback)
 * @param {string} id - Room ID
 * @param {boolean} fetchAvatar - Whether to fetch avatar
 * @param {Object} prevData - Previous cached data
 * @returns {Promise<Object>} Room status object
 */
export async function getDouyuStatus(id, fetchAvatar, prevData) {
    let res = {
        isLive: false,
        isReplay: false,
        title: prevData?.title || "信号波动",
        owner: prevData?.owner || id,
        cover: prevData?.cover || "",
        avatar: prevData?.avatar || "",
        heatValue: 0,
        isError: false,
        startTime: null
    };

    // Priority strategy: Try fastest API first
    const rateData = await fetchWithProxy(`https://m.douyu.com/api/room/ratestream?rid=${id}`, false, 8000);

    if (rateData?.data) {
        const d = rateData.data;
        const roomInfo = d.roomInfo || {};
        const bizAll = d.room_biz_all || {};

        res.isReplay = roomInfo.videoLoop === 1 || bizAll.videoLoop === 1;
        res.isLive = res.isReplay ? false : (roomInfo.show_status === 1 || bizAll.show_status === 1);
        res.title = bizAll.room_name || roomInfo.room_name || res.title;
        res.owner = bizAll.nickname || roomInfo.nickname || res.owner;
        res.heatValue = parseInt(bizAll.online || roomInfo.online || 0);

        const baseCover = bizAll.room_pic || roomInfo.room_pic;
        res.cover = res.isLive && baseCover ? `${baseCover}?t=${imgTimestamp}` : baseCover || res.cover;
        res.avatar = bizAll.owner_avatar || roomInfo.avatar || res.avatar;

        // Get live start time
        const showTime = bizAll.show_time || roomInfo.show_time;
        if (showTime && res.isLive) {
            res.startTime = showTime * 1000; // Convert to milliseconds timestamp
        }

        return res;
    }

    // Fallback: Try betard API
    const betardData = await fetchQuick(`https://www.douyu.com/betard/${id}`);
    if (betardData?.room) {
        const d = betardData.room;
        res.isReplay = d.videoLoop === 1;
        res.isLive = res.isReplay ? false : d.show_status === 1;
        res.title = d.room_name || res.title;
        res.owner = d.nickname || res.owner;
        res.heatValue = parseInt(d.online || 0);
        res.cover = res.isLive && d.room_pic ? `${d.room_pic}?t=${imgTimestamp}` : d.room_pic || res.cover;
        res.avatar = d.owner_avatar || res.avatar;

        // Get live start time
        if (d.show_time && res.isLive) {
            res.startTime = d.show_time * 1000;
        }

        return res;
    }

    res.isError = true;
    return res;
}

// ====================================================================
// Bilibili (哔哩哔哩) Sniffer
// ====================================================================

/**
 * Fetch Bilibili room status
 * Uses parallel requests for room info and user initialization
 * @param {string} id - Room ID
 * @param {boolean} fetchAvatar - Whether to fetch avatar
 * @param {Object} prevData - Previous cached data
 * @returns {Promise<Object|null>} Room status object or null on failure
 */
export async function getBilibiliStatus(id, fetchAvatar, prevData) {
    let res = {
        isLive: false,
        isReplay: false,
        title: prevData?.title || "信号波动",
        owner: prevData?.owner || id,
        cover: prevData?.cover || "",
        avatar: prevData?.avatar || "",
        heatValue: 0,
        isError: false,
        startTime: null
    };

    // Parallel requests: Room info + User initialization info
    const [infoRes, initRes] = await Promise.allSettled([
        fetchWithProxy(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${id}`, false, 8000),
        fetchWithProxy(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${id}`, false, 6000)
    ]);

    const info = infoRes.status === 'fulfilled' ? infoRes.value : null;
    const init = initRes.status === 'fulfilled' ? initRes.value : null;

    console.log(`[Bilibili] room=${id}, info=${info?.code}, init=${init?.code}`);

    // Try to get UID from both sources
    let uid = null;
    if (init?.data?.uid) uid = init.data.uid;
    else if (info?.data?.uid) uid = info.data.uid;

    if (info?.code === 0) {
        const d = info.data;
        res.isLive = d.live_status === 1;
        res.isReplay = d.live_status === 2;
        res.heatValue = d.online || 0;

        // Get live start time
        if (d.live_time && res.isLive) {
            // Bilibili returns "2024-01-01 12:00:00" format
            const liveTime = new Date(d.live_time.replace(' ', 'T') + '+08:00');
            if (!isNaN(liveTime.getTime())) {
                res.startTime = liveTime.getTime();
            }
        }

        if (res.isLive || res.isReplay) {
            res.title = d.title;
            res.cover = d.keyframe || d.user_cover;
            if (res.isLive) res.cover += `?t=${imgTimestamp}`;
        } else {
            res.title = prevData?.title || d.title;
            res.cover = prevData?.cover || d.user_cover;
        }
    }

    // Get user avatar and name
    // Only fetch if we don't have valid owner data
    const hasValidOwner = prevData?.owner && prevData.owner !== id && prevData.owner !== String(id);
    const needUserInfo = !prevData?.avatar || !hasValidOwner;

    console.log(`[Bilibili] uid=${uid}, needUserInfo=${needUserInfo}, hasAvatar=${!!prevData?.avatar}, owner=${prevData?.owner}`);

    if (uid && needUserInfo) {
        console.log(`[Bilibili] Starting to fetch user info: uid=${uid}`);

        // Use Bilibili Live API instead of main site API (main site has CORS restrictions)
        const masterInfo = await fetchWithProxy(`https://api.live.bilibili.com/live_user/v1/Master/info?uid=${uid}`, false, 8000);
        console.log(`[Bilibili] Master API response:`, masterInfo?.code, masterInfo?.data?.info?.uname);

        if (masterInfo?.code === 0 && masterInfo?.data?.info) {
            res.avatar = masterInfo.data.info.face || res.avatar;
            res.owner = masterInfo.data.info.uname || res.owner;
            console.log(`[Bilibili] ✓ Fetch successful: ${res.owner}, Avatar: ${res.avatar ? 'yes' : 'no'}`);
        } else {
            // Fallback: Try main site API
            console.log(`[Bilibili] Master API failed, trying main site API...`);
            const userInfo = await fetchWithProxy(`https://api.bilibili.com/x/space/acc/info?mid=${uid}`, false, 8000);
            if (userInfo?.code === 0 && userInfo?.data) {
                res.avatar = userInfo.data.face || res.avatar;
                res.owner = userInfo.data.name || res.owner;
                console.log(`[Bilibili] ✓ Main site API fetch successful: ${res.owner}`);
            } else {
                console.log(`[Bilibili] ✗ All APIs failed`);
            }
        }
    }

    // Keep previous avatar and name (if not fetched this time)
    if (!res.avatar && prevData?.avatar) res.avatar = prevData.avatar;
    if ((!res.owner || res.owner === id || res.owner === String(id)) && hasValidOwner) {
        res.owner = prevData.owner;
    }

    if (!info || info.code !== 0) return null;
    return res;
}

// ====================================================================
// Twitch Sniffer
// ====================================================================

/**
 * Parse Twitch uptime string to milliseconds
 * Format: "2 hours, 30 minutes, 15 seconds" or "30 minutes, 15 seconds"
 * @param {string} uptime - Uptime string from DecAPI
 * @returns {number} Duration in milliseconds
 */
function parseUptimeToMs(uptime) {
    if (!uptime) return 0;
    let totalMs = 0;

    // Match hours
    const hours = uptime.match(/(\d+)\s*hour/i);
    if (hours) totalMs += parseInt(hours[1]) * 60 * 60 * 1000;

    // Match minutes
    const minutes = uptime.match(/(\d+)\s*minute/i);
    if (minutes) totalMs += parseInt(minutes[1]) * 60 * 1000;

    // Match seconds
    const seconds = uptime.match(/(\d+)\s*second/i);
    if (seconds) totalMs += parseInt(seconds[1]) * 1000;

    return totalMs;
}

/**
 * Async fetch Twitch avatar and update cache
 * @param {string} id - Channel ID
 */
async function fetchTwitchAvatarAsync(id) {
    try {
        const av = await fetch(`https://decapi.me/twitch/avatar/${id}`).then(r => r.text());
        if (!av.includes("No user")) {
            const cacheKey = `twitch-${id}`;
            if (roomDataCache[cacheKey]) {
                roomDataCache[cacheKey].avatar = av;
                if (debouncedSaveCache) debouncedSaveCache();
                if (window.renderAll) window.renderAll();
            }
        }
    } catch(e) {}
}

/**
 * Fetch Twitch channel status
 * Uses DecAPI for uptime, title, viewers
 * @param {string} id - Channel ID
 * @param {boolean} fetchAvatar - Whether to fetch avatar
 * @param {Object} prevData - Previous cached data
 * @returns {Promise<Object|null>} Channel status object or null on failure
 */
export async function getTwitchStatus(id, fetchAvatar, prevData) {
    // Remove region restriction - all users try to fetch data
    // On failure, return null, caller will mark isError, renderer shows "Connection Error"
    let res = {
        isLive: false,
        isReplay: false,
        title: "",
        owner: prevData?.owner || id,
        cover: prevData?.cover || "",
        avatar: prevData?.avatar || "",
        heatValue: 0,
        isError: false,
        startTime: null
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.NETWORK.PROXY_TIMEOUT_TWITCH);

        const uptime = await fetch(`https://decapi.me/twitch/uptime/${id}`, { signal: controller.signal }).then(r => r.text());
        clearTimeout(timeoutId);

        const isOffline = uptime.toLowerCase().includes("offline") || uptime.toLowerCase().includes("not found") || uptime.toLowerCase().includes("error");
        res.isLive = !isOffline;

        // Fetch title regardless of online/offline status (if connection works)
        const titlePromise = fetch(`https://decapi.me/twitch/title/${id}`).then(r => r.text()).catch(() => "");

        if (res.isLive) {
            // Parse uptime to calculate stream start time
            // uptime format: "2 hours, 30 minutes, 15 seconds" or "30 minutes, 15 seconds"
            const uptimeMs = parseUptimeToMs(uptime);
            if (uptimeMs > 0) {
                res.startTime = Date.now() - uptimeMs;
            }

            // Parallel fetch title and viewers
            const [t, v] = await Promise.all([
                titlePromise,
                fetch(`https://decapi.me/twitch/viewers/${id}`).then(r => r.text()).catch(() => "0")
            ]);
            res.title = t || ""; // Use actual fetched title, empty if none

            // Validate viewers data validity, exclude 404 errors
            const cleanV = v.replace(/,/g, '').trim();
            if (cleanV && !isNaN(parseInt(cleanV)) && parseInt(cleanV) >= 0 && !/error|not found|404/i.test(v)) {
                res.heatValue = parseInt(cleanV);
            }
            res.cover = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${id}-640x360.jpg?t=${imgTimestamp}`;
        } else {
            // Also fetch title when offline
            res.title = await titlePromise || "";
        }

        // Async avatar fetch
        if (fetchAvatar && !res.avatar) {
            fetchTwitchAvatarAsync(id);
        }

        return res;
    } catch(e) {
        return null;
    }
}

// ====================================================================
// Exports
// ====================================================================

// Export individual sniffer functions
export {
    getDouyuStatus as sniffDouyu,
    getBilibiliStatus as sniffBilibili,
    getTwitchStatus as sniffTwitch,
    // Aliases for main.js compatibility
    getDouyuStatus as sniffDouyuRoom,
    getBilibiliStatus as sniffBilibiliRoom,
    getTwitchStatus as sniffTwitchStream
};

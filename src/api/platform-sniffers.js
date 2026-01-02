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
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Initialize sniffer module (no longer needs dependencies)
 * Kept for backward compatibility
 */
export function initSniffers(deps) {
    // No longer needs dependency injection
    console.log('[Sniffers] Initialized (no dependencies required)');
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
    const res = {
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
        // 优化：直播中使用实时时间戳（每次刷新都更新），离线不添加时间戳（长缓存）
        res.cover = res.isLive && baseCover ? `${baseCover}?t=${Date.now()}` : baseCover || res.cover;
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
        // 优化：直播中使用实时时间戳（每次刷新都更新），离线不添加时间戳（长缓存）
        res.cover = res.isLive && d.room_pic ? `${d.room_pic}?t=${Date.now()}` : d.room_pic || res.cover;
        res.avatar = d.owner_avatar || res.avatar;

        // Get live start time
        if (d.show_time && res.isLive) {
            res.startTime = d.show_time * 1000;
        }

        return res;
    }

    // Return null on failure to maintain consistency with other platforms
    return null;
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
    const res = {
        isLive: false,
        isReplay: false,
        title: prevData?.title || "",
        owner: prevData?.owner || id,
        cover: prevData?.cover || "",
        avatar: prevData?.avatar || "",
        heatValue: 0,
        isError: false,
        startTime: null
    };

    // Step 1: Use room_init to determine live status first
    const init = await fetchWithProxy(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${id}`, false, 6000);
    console.log(`[Bilibili] room=${id}, init=${init?.code}`);

    if (!init) {
        console.error(`[Bilibili] ✗ Network error for room ${id} - will retry`);
        return null;
    }

    if (init.code !== 0) {
        console.warn(`[Bilibili] ⚠ API error code ${init.code} for room ${id}, message: ${init.message || 'N/A'} - treating as offline`);
        res.isError = false;
        res.isLive = false;
        res.isReplay = false;
        res.title = prevData?.title || "房间信息异常";
        return res;
    }

    const liveStatus = init?.data?.live_status;
    res.isLive = liveStatus === 1;
    res.isReplay = liveStatus === 2;

    // Try to get UID from init first
    const uid = init?.data?.uid || null;

    // Offline: reuse cached info but allow basic profile fetch below
    if (!res.isLive && !res.isReplay) {
        if (prevData) {
            if (!res.title) res.title = prevData.title;
            if (!res.owner) res.owner = prevData.owner;
            if (!res.cover) res.cover = prevData.cover;
            if (!res.avatar) res.avatar = prevData.avatar;
        }
        if (!res.title || res.title === "信号波动") {
            res.title = (prevData?.title && prevData.title !== "信号波动") ? prevData.title : "";
        }
    }

    // Fetch detailed info when live or replay
    if (res.isLive || res.isReplay) {
        const info = await fetchWithProxy(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${id}`, false, 8000);
        if (info?.code === 0) {
            const d = info.data;
            res.heatValue = d.online || 0;

            // Get live start time (only for live streams)
            if (res.isLive && d.live_time) {
                // Bilibili returns "2024-01-01 12:00:00" format
                const liveTime = new Date(d.live_time.replace(' ', 'T') + '+08:00');
                if (!isNaN(liveTime.getTime())) {
                    res.startTime = liveTime.getTime();
                }
            }

            res.title = d.title;

            // 优化：直播中使用实时截图（keyframe）+ 时间戳，录播使用固定封面（user_cover）不加时间戳
            if (res.isLive) {
                res.cover = d.keyframe || d.user_cover;
                if (res.cover) res.cover += `?t=${Date.now()}`;
            } else if (res.isReplay) {
                // 录播使用固定封面，不添加时间戳（避免缓存失效）
                res.cover = d.user_cover || d.keyframe || prevData?.cover;
            }
        } else if (info) {
            console.warn(`[Bilibili] ⚠ get_info error code ${info.code} for room ${id}, message: ${info.message || 'N/A'} - using cached data`);
        } else {
            console.warn(`[Bilibili] ⚠ get_info failed for room ${id} - using cached data`);
        }
        if (!res.title) res.title = prevData?.title || "信号波动";
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

const TWITCH_OFFLINE_TITLE_REFRESH_MS = 30 * 60 * 1000;

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
    } catch(e) {
        ErrorHandler.silent(e, 'Twitch Avatar');
    }
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
    const res = {
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
        const now = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.NETWORK.PROXY_TIMEOUT_TWITCH);

        const uptime = await fetch(`https://decapi.me/twitch/uptime/${id}`, { signal: controller.signal }).then(r => r.text());
        clearTimeout(timeoutId);

        const isOffline = uptime.toLowerCase().includes("offline") || uptime.toLowerCase().includes("not found") || uptime.toLowerCase().includes("error");
        res.isLive = !isOffline;

        if (res.isLive) {
            // Fetch title and viewers only when live
            const titlePromise = fetch(`https://decapi.me/twitch/title/${id}`).then(r => r.text()).catch(() => "");
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
            res.title = t || prevData?.title || ""; // Use actual fetched title, empty if none
            res.lastTitleUpdate = now;

            // Validate viewers data validity, exclude 404 errors
            const cleanV = v.replace(/,/g, '').trim();
            if (cleanV && !isNaN(parseInt(cleanV)) && parseInt(cleanV) >= 0 && !/error|not found|404/i.test(v)) {
                res.heatValue = parseInt(cleanV);
            }
            // 优化：直播中使用实时时间戳（每次刷新都更新）
            res.cover = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${id}-640x360.jpg?t=${Date.now()}`;
        } else {
            // Offline: reuse cached title and refresh at low frequency
            const cachedTitle = prevData?.title || "";
            const lastTitleUpdate = prevData?.lastTitleUpdate || 0;
            const shouldRefreshTitle = !cachedTitle || (now - lastTitleUpdate > TWITCH_OFFLINE_TITLE_REFRESH_MS);

            if (shouldRefreshTitle) {
                try {
                    const t = await fetch(`https://decapi.me/twitch/title/${id}`).then(r => r.text());
                    res.title = t || cachedTitle;
                    res.lastTitleUpdate = now;
                } catch (e) {
                    res.title = cachedTitle;
                    res.lastTitleUpdate = lastTitleUpdate;
                }
            } else {
                res.title = cachedTitle;
                res.lastTitleUpdate = lastTitleUpdate;
            }
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
// Kick Sniffer
// ====================================================================

/**
 * Fetch Kick channel status
 * Uses Kick API v2 for live stream data
 * @param {string} id - Channel username
 * @param {boolean} fetchAvatar - Whether to fetch avatar
 * @param {Object} prevData - Previous cached data
 * @returns {Promise<Object|null>} Channel status object or null on failure
 */
export async function getKickStatus(id, fetchAvatar, prevData) {
    const res = {
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
        // Kick API v2 - try direct connection first (public API since March 2025)
        const apiUrl = `https://kick.com/api/v2/channels/${id}`;
        let data = null;

        // Try direct fetch first
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                data = await response.json();
                console.log(`[Kick] ✓ Direct connection successful for ${id}`);
            }
        } catch (directError) {
            console.log(`[Kick] Direct connection failed for ${id}, trying proxy...`, directError.message);
            // Fallback to proxy
            data = await fetchWithProxy(apiUrl, false, 8000);
        }

        if (!data || !data.user) {
            return null;
        }

        const livestream = data.livestream;
        const user = data.user;

        // Check if channel is live
        res.isLive = livestream?.is_live === true;
        res.owner = user.username || id;
        res.avatar = user.profile_pic || res.avatar;

        if (res.isLive && livestream) {
            // Live stream data
            res.title = livestream.session_title || "";
            res.heatValue = livestream.viewer_count || 0;

            // Get live start time
            if (livestream.created_at) {
                res.startTime = new Date(livestream.created_at).getTime();
            }

            // Get thumbnail URL with cache busting
            // Try multiple thumbnail sources
            const thumbnailUrl = livestream.thumbnail?.url ||
                                 livestream.thumbnail?.src ||
                                 livestream.thumbnail;

            if (thumbnailUrl) {
                // 优化：直播中使用实时时间戳（每次刷新都更新）
                res.cover = typeof thumbnailUrl === 'string'
                    ? `${thumbnailUrl}?t=${Date.now()}`
                    : res.cover;
                console.log(`[Kick] Thumbnail URL for ${id}:`, res.cover);
            } else {
                console.warn(`[Kick] No thumbnail found for ${id}, using profile pic`);
                res.cover = user.profile_pic || res.cover;
            }
        } else {
            // Offline - use cached title or profile picture
            res.title = prevData?.title || "";
            res.cover = user.profile_pic || res.cover;
        }

        return res;
    } catch(e) {
        console.error(`[Kick] Error fetching ${id}:`, e.message);
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
    getKickStatus as sniffKick,
    // Aliases for main.js compatibility
    getDouyuStatus as sniffDouyuRoom,
    getBilibiliStatus as sniffBilibiliRoom,
    getTwitchStatus as sniffTwitchStream,
    getKickStatus as sniffKickChannel
};

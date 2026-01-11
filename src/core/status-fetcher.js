/**
 * ====================================================================
 * Status Fetcher - Main Dispatcher for Room Status Fetching
 * ====================================================================
 *
 * Main entry point for fetching streaming room status across platforms.
 * Handles:
 * - Platform-specific API routing
 * - Avatar update throttling
 * - Data caching and updates
 * - Heat value persistence
 * - Change detection
 *
 * @module core/status-fetcher
 */

import { APP_CONFIG } from '../config/constants.js';
import { registerDefaultAdapters, fetchPlatformStatus } from '../api/platform-adapter.js';
import { fetchQuick } from '../api/proxy-manager.js';
import { DataDiffer } from '../utils/data-differ.js';
import { getRoomDataCache, updateRoomCache } from './state.js';
import { formatHeat, getRoomCacheKey } from '../utils/helpers.js';

// ====================================================================
// Cover Timestamp Helpers
// ====================================================================

function stripTimestampParam(url) {
    if (!url) return '';
    return url
        .replace(/([?&])t=\d+(&)?/, (match, sep, trailing) => {
            if (sep === '?' && trailing) return '?';
            if (sep === '&' && trailing) return '&';
            return '';
        })
        .replace(/[?&]$/, '');
}

function applyTimestampParam(url, timestamp) {
    if (!url) return '';
    if (/([?&])t=\d+/.test(url)) {
        return url.replace(/([?&])t=\d+/, `$1t=${timestamp}`);
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${timestamp}`;
}

// External dependencies (only notification check needs injection)
let checkAndNotify = null;

/**
 * Initialize status fetcher with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initStatusFetcher(deps) {
    if (deps.checkAndNotify) checkAndNotify = deps.checkAndNotify;
    registerDefaultAdapters();
}

/**
 * Fetch room status for a single room
 * @param {Object} room - Room object { id, platform, isFav }
 * @param {number} jitter - Random delay in milliseconds (for load distribution)
 * @returns {Promise<void>}
 */
export async function fetchRoomStatus(room, jitter = 0) {
    if (jitter > 0) await new Promise(r => setTimeout(r, jitter));

    const cacheKey = getRoomCacheKey(room.platform, room.id);
    const roomDataCache = getRoomDataCache();
    const prevData = roomDataCache[cacheKey];
    const now = Date.now();
    const ownerNeedsRefresh = (room.platform === 'douyu' || room.platform === 'bilibili')
        && prevData?.owner
        && (prevData.owner === room.id || prevData.owner === String(room.id));
    const needProfileUpdate = !prevData?.avatar
        || !prevData?.lastAvatarUpdate
        || (now - prevData.lastAvatarUpdate > APP_CONFIG.CACHE.AVATAR_UPDATE_INTERVAL)
        || ownerNeedsRefresh;

    let result = null;

    try {
        result = await fetchPlatformStatus(
            room.platform,
            room.id,
            { fetchAvatar: needProfileUpdate },
            prevData
        );
    } catch (error) {
        console.error(`[fetchStatus] ${room.platform}-${room.id} fetch failed:`, error.message);
        result = null;
    }

    if (result) {
        const finalIsLive = result.isLive && !result.isReplay;
        let heatValue = result.heatValue || 0;

        // Persist previous heat value if current is 0
        if (heatValue <= 0 && prevData && prevData.heatValue > 0) {
            heatValue = prevData.heatValue;
        }

        let viewers = "离线";
        if (finalIsLive) {
            // Priority: Display heat value, add "人" suffix for Twitch
            if (heatValue > 0) {
                viewers = "在线 " + (formatHeat ? formatHeat(heatValue) : heatValue);
                if (room.platform === 'twitch' || room.platform === 'kick') viewers += "人";
            } else {
                // Display online status when no heat data
                viewers = "在线";
            }
        }

        // Preserve previous data when offline
        if (!finalIsLive && !result.isReplay && prevData) {
            if (!result.title) result.title = prevData.title;
            if (!result.owner) result.owner = prevData.owner;
            if (prevData.cover) result.cover = prevData.cover;
            if (!result.avatar) result.avatar = prevData.avatar;
        }

        // Douyu avatar fallback fetch
        if (room.platform === 'douyu' && !result.avatar && !result.isError && needProfileUpdate) {
            fetchQuick(`https://open.douyucdn.cn/api/RoomApi/room/${room.id}`)
                .then(o => {
                    const cache = getRoomDataCache();
                    if (o?.data?.avatar && cache[cacheKey]) {
                        cache[cacheKey].avatar = o.data.avatar;
                        updateRoomCache(cacheKey, cache[cacheKey], true);
                        if (window.renderAll) window.renderAll();
                    }
                });
        }

        // Trigger notification check
        if (checkAndNotify) {
            checkAndNotify(room, finalIsLive, result.owner || room.id);
        }

        const prevCover = prevData?.cover || '';
        const prevCoverBase = stripTimestampParam(prevCover);
        const nextCoverBase = stripTimestampParam(result.cover || '');
        const lastCoverUpdate = prevData?.lastCoverUpdate || 0;
        const coverRefreshDue = now - lastCoverUpdate > APP_CONFIG.CACHE.IMAGE_TIMESTAMP_INTERVAL;
        const coverBaseChanged = !!nextCoverBase && !!prevCoverBase && nextCoverBase !== prevCoverBase;

        let finalCover = result.cover || '';
        if (finalIsLive) {
            if (!nextCoverBase) {
                finalCover = prevCover;
            } else if (!coverBaseChanged && !coverRefreshDue) {
                finalCover = prevCover;
            } else {
                finalCover = applyTimestampParam(nextCoverBase, now);
            }
        } else if (!result.isReplay && prevCover) {
            finalCover = prevCover;
        }

        const shouldUpdateCoverTimestamp = finalIsLive
            && nextCoverBase
            && (coverBaseChanged || coverRefreshDue || !lastCoverUpdate);

        const updateData = {
            ...result,
            isLive: finalIsLive,
            viewers,
            avatar: result.avatar || prevData?.avatar || "",
            cover: finalCover,
            platform: room.platform,
            id: room.id,
            loading: false,
            heatValue,
            isError: false,
            _stale: false
        };

        if (!needProfileUpdate) {
            if (prevData?.avatar) updateData.avatar = prevData.avatar;
            if (prevData?.owner) updateData.owner = prevData.owner;
        }

        // Handle profile update timestamp (avatar + owner)
        const profileFetched = result._profileFetched === true;
        delete updateData._profileFetched;
        const avatarChanged = updateData.avatar && updateData.avatar !== prevData?.avatar;
        const ownerChanged = updateData.owner && updateData.owner !== prevData?.owner;
        const shouldUpdateProfileTimestamp = profileFetched || avatarChanged || ownerChanged;
        if (shouldUpdateProfileTimestamp) {
            updateData.lastAvatarUpdate = now;
        } else {
            updateData.lastAvatarUpdate = prevData?.lastAvatarUpdate || 0;
        }

        updateData.lastCoverUpdate = shouldUpdateCoverTimestamp ? now : (prevData?.lastCoverUpdate || 0);

        // Incremental update: Compare old and new data, detect changes
        const diffResult = DataDiffer.compare(prevData, updateData);
        updateData._hasChanges = diffResult.changed;
        updateData._changes = diffResult.changes;

        // Debug logging: Record changes
        if (APP_CONFIG.INCREMENTAL.LOG_CHANGES && diffResult.changed) {
            const summary = DataDiffer.summarize(prevData, updateData, diffResult.changes);
            console.log(`[Incremental Update] ${room.platform}-${room.id}: ${summary}`);
        }

        // Update cache with debounced write (handled by state.js)
        updateRoomCache(cacheKey, updateData, false);
    } else {
        // Update failed but have previous data
        const errorData = prevData
            ? { ...prevData, isError: false, loading: false, _stale: true }
            : { loading: false, isError: true };
        updateRoomCache(cacheKey, errorData, false);
    }
}

// Alias for main.js compatibility
export { fetchRoomStatus as fetchStatus };

// Default export for convenience
export default fetchRoomStatus;

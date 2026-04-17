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
import { emit, Events } from './event-bus.js';

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

// In-flight fetch dedup: multiple callers requesting the same cacheKey share a single promise
const inFlightFetches = new Map();
// Pending Douyu avatar fallbacks keyed by cacheKey, so cancelPendingFetches can drop them
const pendingAvatarFetches = new Map();

/**
 * Initialize status fetcher with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initStatusFetcher(deps) {
    if (deps.checkAndNotify) checkAndNotify = deps.checkAndNotify;
    registerDefaultAdapters();
}

/**
 * Drop any pending work for a room (called when rooms are removed).
 * In-flight fetches already running cannot truly be aborted without wiring an
 * AbortController all the way through, but we can at least stop stale writes
 * from landing in the cache — callers should re-check presence before writing.
 */
export function cancelPendingFetches(cacheKey) {
    pendingAvatarFetches.delete(cacheKey);
}

/**
 * Douyu sometimes returns no avatar from the main API. Fire a fallback call
 * to the open API. Only runs when we know we need a profile update.
 * Tracked in pendingAvatarFetches so stale writes can be filtered out.
 */
function ensureDouyuAvatar(room, cacheKey) {
    const token = Symbol('douyu-avatar');
    pendingAvatarFetches.set(cacheKey, token);

    fetchQuick(`https://open.douyucdn.cn/api/RoomApi/room/${room.id}`)
        .then(o => {
            if (pendingAvatarFetches.get(cacheKey) !== token) return; // room removed or superseded
            const cache = getRoomDataCache();
            if (o?.data?.avatar && cache[cacheKey]) {
                cache[cacheKey].avatar = o.data.avatar;
                updateRoomCache(cacheKey, cache[cacheKey], true);
                emit(Events.RENDER_REQUEST);
            }
        })
        .catch(() => { /* fallback is best-effort */ })
        .finally(() => {
            if (pendingAvatarFetches.get(cacheKey) === token) {
                pendingAvatarFetches.delete(cacheKey);
            }
        });
}

/**
 * Fetch room status for a single room (with in-flight dedup)
 * @param {Object} room - Room object { id, platform, isFav }
 * @param {number} jitter - Random delay in milliseconds (for load distribution)
 * @returns {Promise<void>}
 */
export function fetchRoomStatus(room, jitter = 0) {
    const cacheKey = getRoomCacheKey(room.platform, room.id);
    const existing = inFlightFetches.get(cacheKey);
    if (existing) return existing;

    const promise = fetchRoomStatusInner(room, jitter, cacheKey).finally(() => {
        if (inFlightFetches.get(cacheKey) === promise) {
            inFlightFetches.delete(cacheKey);
        }
    });
    inFlightFetches.set(cacheKey, promise);
    return promise;
}

async function fetchRoomStatusInner(room, jitter, cacheKey) {
    if (jitter > 0) await new Promise(r => setTimeout(r, jitter));

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

        if (room.platform === 'douyu' && !result.avatar && !result.isError && needProfileUpdate) {
            ensureDouyuAvatar(room, cacheKey);
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

        // 🔥 优化：检测从错误/陈旧状态恢复的情况，强制标记为已变更
        const wasStaleOrError = prevData?._stale === true || prevData?.isError === true;
        const isNowValid = !updateData.isError && !updateData._stale;
        const recoveredFromError = wasStaleOrError && isNowValid;

        updateData._hasChanges = diffResult.changed || recoveredFromError;
        updateData._changes = recoveredFromError
            ? [...(diffResult.changes || []), '从错误状态恢复']
            : diffResult.changes;

        // Debug logging: Record changes
        if (APP_CONFIG.INCREMENTAL.LOG_CHANGES && diffResult.changed) {
            const summary = DataDiffer.summarize(prevData, updateData, diffResult.changes);
            console.log(`[Incremental Update] ${room.platform}-${room.id}: ${summary}`);
        }

        // Update cache with debounced write (handled by state.js)
        updateRoomCache(cacheKey, updateData, false);
    } else {
        // Update failed but have previous data
        // 🔥 BUG FIX: 清除 _hasChanges 标志，确保下次渲染时强制更新
        // 原因：继承旧数据的 _hasChanges: false 会导致增量更新跳过渲染
        const errorData = prevData
            ? (() => {
                const { _hasChanges, _changes, ...rest } = prevData;
                return {
                    ...rest,
                    isError: false,
                    loading: false,
                    _stale: true,
                    _hasChanges: undefined  // 强制下次更新（双重保险）
                };
              })()
            : { loading: false, isError: true };
        updateRoomCache(cacheKey, errorData, false);
    }
}

// Alias for main.js compatibility
export { fetchRoomStatus as fetchStatus };

// Default export for convenience
export default fetchRoomStatus;

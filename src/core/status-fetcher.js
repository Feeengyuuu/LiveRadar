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
import { registerDefaultAdapters, fetchPlatformStatus, fetchPlatformStatusesBatch } from '../api/platform-adapter.js';
import { fetchQuick } from '../api/proxy-manager.js';
import { DataDiffer } from '../utils/data-differ.js';
import { getRoomDataCache, getRooms, updateRoomCache } from './state.js';
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

function getTimestampParam(url) {
    const match = String(url || '').match(/[?&]t=(\d+)/);
    return match ? match[1] : '';
}

function applyTimestampParam(url, timestamp) {
    if (!url) return '';
    if (/([?&])t=\d+/.test(url)) {
        return url.replace(/([?&])t=\d+/, `$1t=${timestamp}`);
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${timestamp}`;
}

function getLiveCoverRefreshInterval(platform) {
    const intervals = APP_CONFIG.CACHE.LIVE_IMAGE_REFRESH_INTERVALS;
    return FAST_LIVE_COVER_PLATFORMS.has(platform)
        ? intervals.INTERNATIONAL
        : intervals.DOMESTIC;
}

function getLiveCoverTimestampBucket(platform, timestamp) {
    return Math.floor(timestamp / getLiveCoverRefreshInterval(platform));
}

// In-flight fetch dedup: multiple callers requesting the same cacheKey share a single promise
const inFlightFetches = new Map();
// Pending Douyu avatar fallbacks keyed by cacheKey, so cancelPendingFetches can drop them
const pendingAvatarFetches = new Map();
const FAST_LIVE_COVER_PLATFORMS = new Set(['twitch', 'kick', 'picarto', 'soop']);
const VIEWER_COUNT_PLATFORMS = new Set(['twitch', 'kick', 'picarto']);

function isRoomStillTracked(room) {
    const rooms = getRooms();
    return rooms.some(item => item.platform === room.platform && String(item.id) === String(room.id));
}

/**
 * Initialize status fetcher with external dependencies
 */
export function initStatusFetcher() {
    registerDefaultAdapters();
}

/**
 * Drop any pending work for a room (called when rooms are removed).
 * Keep the in-flight status request registered until it settles so callers
 * still dedupe against it if the room is re-added before completion.
 * Only best-effort avatar fallback work can be cancelled immediately here.
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

    const context = createRoomFetchContext(room, cacheKey);
    let result = null;

    try {
        result = await fetchPlatformStatus(
            room.platform,
            room.id,
            { fetchAvatar: context.needProfileUpdate },
            context.prevData
        );
    } catch (error) {
        console.error(`[fetchStatus] ${room.platform}-${room.id} fetch failed:`, error.message);
        result = null;
    }

    if (!isRoomStillTracked(room)) {
        cancelPendingFetches(cacheKey);
        return;
    }

    applyRoomStatusResult(room, cacheKey, result, context);
}

function createRoomFetchContext(room, cacheKey) {
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

    return {
        prevData,
        now,
        needProfileUpdate
    };
}

/**
 * Fetch multiple room statuses through the server batch API when available.
 * Falls back per-room for missed or unavailable batch results.
 *
 * @param {Array} rooms
 * @param {Object} [options]
 * @param {(finished:number,total:number)=>void} [options.onProgress]
 * @returns {Promise<void>}
 */
export function fetchRoomsStatusBatch(rooms, options = {}) {
    if (!Array.isArray(rooms) || rooms.length === 0) return Promise.resolve();

    const existingPromises = [];
    const entries = [];

    rooms.forEach(room => {
        const cacheKey = getRoomCacheKey(room.platform, room.id);
        const existing = inFlightFetches.get(cacheKey);
        if (existing) {
            existingPromises.push(existing);
            return;
        }

        entries.push({
            room,
            cacheKey,
            context: createRoomFetchContext(room, cacheKey)
        });
    });

    if (entries.length === 0) {
        return Promise.allSettled(existingPromises).then(() => undefined);
    }

    const batchPromise = fetchRoomsStatusBatchInner(entries, options).finally(() => {
        entries.forEach(entry => {
            if (inFlightFetches.get(entry.cacheKey) === batchPromise) {
                inFlightFetches.delete(entry.cacheKey);
            }
        });
    });

    entries.forEach(entry => {
        inFlightFetches.set(entry.cacheKey, batchPromise);
    });

    return Promise.allSettled([...existingPromises, batchPromise]).then(() => undefined);
}

async function fetchRoomsStatusBatchInner(entries, options = {}) {
    const total = entries.length;
    let finished = 0;
    const notifyProgress = () => {
        finished += 1;
        if (options.onProgress) options.onProgress(finished, total);
    };
    const fallbackConcurrency = Math.max(1, Math.floor(options.fallbackConcurrency || 4));

    const requests = entries.map(entry => ({
        platform: entry.room.platform,
        id: entry.room.id,
        options: { fetchAvatar: entry.context.needProfileUpdate },
        prevData: entry.context.prevData
    }));

    const batchResults = await fetchPlatformStatusesBatch(requests);

    if (!Array.isArray(batchResults)) {
        await mapWithConcurrency(entries, fallbackConcurrency, entry => fetchAndApplyEntry(entry, null), notifyProgress);
        return;
    }

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        await fetchAndApplyEntry(entry, batchResults[index]);
        notifyProgress();
    }
}

async function fetchAndApplyEntry(entry, initialResult) {
    let result = initialResult;

    if (!result) {
        try {
            result = await fetchPlatformStatus(
                entry.room.platform,
                entry.room.id,
                { fetchAvatar: entry.context.needProfileUpdate },
                entry.context.prevData
            );
        } catch (error) {
            console.error(`[fetchStatus] ${entry.room.platform}-${entry.room.id} fetch failed:`, error.message);
            result = null;
        }
    }

    if (!isRoomStillTracked(entry.room)) {
        cancelPendingFetches(entry.cacheKey);
        return;
    }

    applyRoomStatusResult(entry.room, entry.cacheKey, result, entry.context);
}

async function mapWithConcurrency(items, limit, worker, onProgress) {
    const pool = new Set();

    for (const item of items) {
        if (pool.size >= limit) await Promise.race(pool);

        const task = Promise.resolve(worker(item))
            .catch(error => {
                console.error('[fetchStatusBatch] Task execution failed:', error);
            })
            .finally(() => {
                pool.delete(task);
                if (onProgress) onProgress();
            });
        pool.add(task);
    }

    await Promise.allSettled(pool);
}

function applyRoomStatusResult(room, cacheKey, result, context) {
    const { prevData, now, needProfileUpdate } = context;

    if (result) {
        const finalIsLive = result.isLive && !result.isReplay;
        let heatValue = result.heatValue || 0;

        // Persist previous heat value if current is 0
        if (heatValue <= 0 && prevData && prevData.heatValue > 0) {
            heatValue = prevData.heatValue;
        }

        let viewers = "离线";
        if (finalIsLive) {
            // Priority: display viewer/popularity value. Real viewer-count platforms get "人".
            if (heatValue > 0) {
                viewers = "在线 " + (formatHeat ? formatHeat(heatValue) : heatValue);
                if (VIEWER_COUNT_PLATFORMS.has(room.platform)) viewers += "人";
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

        const prevCover = prevData?.cover || '';
        const prevCoverBase = stripTimestampParam(prevCover);
        const nextCoverBase = stripTimestampParam(result.cover || '');
        const nextCoverTimestamp = String(getLiveCoverTimestampBucket(room.platform, now));
        const prevCoverTimestamp = getTimestampParam(prevCover);
        const coverBaseChanged = !!nextCoverBase && nextCoverBase !== prevCoverBase;
        const coverRefreshDue = !!nextCoverBase && prevCoverTimestamp !== nextCoverTimestamp;

        let finalCover = result.cover || '';
        if (finalIsLive) {
            if (!nextCoverBase) {
                finalCover = prevCover;
            } else if (coverBaseChanged || coverRefreshDue) {
                finalCover = applyTimestampParam(nextCoverBase, nextCoverTimestamp);
            } else {
                finalCover = prevCover;
            }
        } else if (!result.isReplay && prevCover) {
            finalCover = prevCover;
        }

        const shouldUpdateCoverTimestamp = finalIsLive
            && nextCoverBase
            && (coverBaseChanged || coverRefreshDue);

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
                const rest = { ...prevData };
                delete rest._hasChanges;
                delete rest._changes;
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

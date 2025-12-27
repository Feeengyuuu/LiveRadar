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
import { sniffDouyu, sniffBilibili, sniffTwitch } from '../api/platform-sniffers.js';
import { fetchQuick } from '../api/proxy-manager.js';
import { DataDiffer } from '../utils/data-differ.js';

// External dependencies (injected)
let roomDataCache = {};
let debouncedSaveCache = null;
let checkAndNotify = null;
let formatHeat = null;

/**
 * Initialize status fetcher with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initStatusFetcher(deps) {
    if (deps.roomDataCache) roomDataCache = deps.roomDataCache;
    if (deps.debouncedSaveCache) debouncedSaveCache = deps.debouncedSaveCache;
    if (deps.checkAndNotify) checkAndNotify = deps.checkAndNotify;
    if (deps.formatHeat) formatHeat = deps.formatHeat;
}

/**
 * Fetch room status for a single room
 * @param {Object} room - Room object { id, platform, isFav }
 * @param {number} jitter - Random delay in milliseconds (for load distribution)
 * @returns {Promise<void>}
 */
export async function fetchRoomStatus(room, jitter = 0) {
    if (jitter > 0) await new Promise(r => setTimeout(r, jitter));

    const cacheKey = `${room.platform}-${room.id}`;
    const prevData = roomDataCache[cacheKey];
    const now = Date.now();
    const needAvatarUpdate = !prevData?.avatar || !prevData?.lastAvatarUpdate || (now - prevData.lastAvatarUpdate > APP_CONFIG.CACHE.AVATAR_UPDATE_INTERVAL);

    let result = null;

    try {
        if (room.platform === 'douyu') {
            result = await sniffDouyu(room.id, needAvatarUpdate, prevData);
        } else if (room.platform === 'bilibili') {
            result = await sniffBilibili(room.id, needAvatarUpdate, prevData);
        } else if (room.platform === 'twitch') {
            result = await sniffTwitch(room.id, needAvatarUpdate, prevData);
        }
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
                if (room.platform === 'twitch') viewers += "人";
            } else {
                // Display online status when no heat data
                viewers = "在线";
            }
        }

        // Preserve previous data when offline
        if (!finalIsLive && !result.isReplay && prevData) {
            if (!result.title) result.title = prevData.title;
            if (!result.owner) result.owner = prevData.owner;
            if (!result.cover) result.cover = prevData.cover;
            if (!result.avatar) result.avatar = prevData.avatar;
        }

        // Douyu avatar fallback fetch
        if (room.platform === 'douyu' && !result.avatar && !result.isError) {
            fetchQuick(`https://open.douyucdn.cn/api/RoomApi/room/${room.id}`)
                .then(o => {
                    if (o?.data?.avatar && roomDataCache[cacheKey]) {
                        roomDataCache[cacheKey].avatar = o.data.avatar;
                        if (window.renderAll) window.renderAll();
                    }
                });
        }

        // Trigger notification check
        if (checkAndNotify) {
            checkAndNotify(room, finalIsLive, result.owner || room.id);
        }

        const updateData = {
            ...result,
            isLive: finalIsLive,
            viewers,
            avatar: result.avatar || prevData?.avatar || "",
            cover: result.cover,
            platform: room.platform,
            id: room.id,
            loading: false,
            heatValue,
            isError: false,
            _stale: false
        };

        // Handle avatar update timestamp
        if (result.avatar && result.avatar !== prevData?.avatar) {
            updateData.lastAvatarUpdate = now;
        } else {
            updateData.avatar = prevData?.avatar || "";
            updateData.lastAvatarUpdate = prevData?.lastAvatarUpdate || 0;
        }

        // Incremental update: Compare old and new data, detect changes
        const diffResult = DataDiffer.compare(prevData, updateData);
        updateData._hasChanges = diffResult.changed;
        updateData._changes = diffResult.changes;

        // Debug logging: Record changes
        if (APP_CONFIG.INCREMENTAL.LOG_CHANGES && diffResult.changed) {
            const summary = DataDiffer.summarize(prevData, updateData, diffResult.changes);
            console.log(`[Incremental Update] ${room.platform}-${room.id}: ${summary}`);
        }

        roomDataCache[cacheKey] = updateData;
    } else {
        // Update failed but have previous data
        if (prevData) {
            roomDataCache[cacheKey] = { ...prevData, isError: false, loading: false, _stale: true };
        } else {
            roomDataCache[cacheKey] = { loading: false, isError: true };
        }
    }

    // Use debounced save to reduce localStorage write frequency
    if (debouncedSaveCache) {
        debouncedSaveCache();
    }
}

// Alias for main.js compatibility
export { fetchRoomStatus as fetchStatus };

// Default export for convenience
export default fetchRoomStatus;

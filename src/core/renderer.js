/**
 * ====================================================================
 * Renderer - Incremental Rendering System for Room Cards
 * ====================================================================
 *
 * Features:
 * - Incremental rendering (only update changed data)
 * - Smart DOM diffing to minimize reflows
 * - Card state management (live/offline/loop/loading)
 * - Performance-optimized DOM reference caching
 * - Live duration display
 * - Lazy image loading with skeleton states
 *
 * @module core/renderer
 */

import { APP_CONFIG } from '../config/constants.js';
import { getDOMCache } from '../utils/dom-cache.js';
import { getRooms, getRoomDataCache, subscribe } from './state.js';
import { debounce } from '../utils/helpers.js';

// ====================================================================
// Image Event Handler Management (Memory Leak Prevention)
// ====================================================================

/**
 * WeakMap to track image event handlers for cleanup
 * Using WeakMap allows garbage collection when elements are removed
 */
const imageHandlers = new WeakMap();

/**
 * Safely set image load/error handlers with cleanup
 * Prevents memory leak from accumulating event handlers
 * @param {HTMLImageElement} img - Image element
 * @param {Function} onLoad - Load handler
 * @param {Function} onError - Error handler
 */
function setImageHandlers(img, onLoad, onError) {
    // Clean up previous handlers if they exist
    const prevHandlers = imageHandlers.get(img);
    if (prevHandlers) {
        img.removeEventListener('load', prevHandlers.load);
        img.removeEventListener('error', prevHandlers.error);
    }

    // Create new handler references
    const handlers = {
        load: onLoad,
        error: onError
    };

    // Store for future cleanup
    imageHandlers.set(img, handlers);

    // Add new listeners
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
}

// ====================================================================
// Display Title Helper (Eliminates Code Duplication)
// ====================================================================

/**
 * Get display title based on room state and platform
 * @param {Object} data - Room data
 * @param {Object} roomInfo - Room info with platform
 * @param {string} cardState - Current card state
 * @returns {string} Display title
 */
function getDisplayTitle(data, roomInfo, cardState) {
    const isInternational = roomInfo.platform === 'twitch' || roomInfo.platform === 'kick';
    const hasConnectionIssue = data.isError || data._stale;

    // Connection error for international platforms
    if (isInternational && hasConnectionIssue) {
        return '连接异常';
    }

    // State-specific defaults
    switch (cardState) {
        case 'live':
        case 'loop':
            return data.title || '';
        case 'offline':
            return data.title || '未开播';
        case 'error':
            return data.title || '获取失败';
        case 'retrying':
            return '正在重试连接...';
        case 'loading':
        default:
            return '连接中...';
    }
}

/**
 * Initialize renderer with state subscriptions
 * Automatically re-renders when rooms state changes
 */
export function initRenderer(deps = {}) {
    // Subscribe to rooms changes for automatic re-rendering
    subscribe('rooms', (newRooms, oldRooms) => {
        console.log('[Renderer] Rooms changed, auto-rendering...');
        debouncedRenderAll();
    });

    console.log('[Renderer] Initialized with state subscriptions');
}

/**
 * Format live duration from start time
 * @param {number} startTime - Stream start timestamp in milliseconds
 * @returns {string|null} Formatted duration string or null
 */
function formatDuration(startTime) {
    if (!startTime) return null;
    const elapsed = Date.now() - startTime;
    if (elapsed < 0) return null;

    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return '< 1m';
    }
}

// ====================================================================
// Main Rendering Function
// ====================================================================

/**
 * Render all room cards with incremental updates
 * 优化：使用DOM缓存消除重复查询
 *
 * NOTE: 这是原始的renderAll函数，直接调用会立即渲染
 * 建议使用 debouncedRenderAll 以获得更好的性能
 */
function renderAllImmediate() {
    const rooms = getRooms();
    const roomDataCache = getRoomDataCache();
    const cache = getDOMCache();
    const grids = {
        live: cache.gridLive,
        offline: cache.gridOffline,
        loop: cache.gridLoop
    };
    const zones = [cache.zoneLive, cache.zoneOffline, cache.zoneLoop].filter(Boolean);

    if (rooms.length === 0) {
        cache.emptyState?.classList.remove('hidden');
        zones.forEach(el => el.classList.remove('active'));
        Object.values(grids).forEach(grid => { if (grid) grid.innerHTML = ''; });
        return;
    }
    cache.emptyState?.classList.add('hidden');

    const favorites = [];
    const others = [];
    rooms.forEach(room => (room.isFav ? favorites : others).push(room));
    const sortedRooms = favorites.concat(others);

    const presentCardIds = new Set();
    let hasLive = false, hasOffline = false, hasLoop = false;
    const gridPositions = { live: 0, offline: 0, loop: 0 };

    // Incremental update: Count changes
    let updatedCount = 0;
    let unchangedCount = 0;
    let newCardsCount = 0;

    sortedRooms.forEach(roomInfo => {
        const cardId = `card-${roomInfo.platform}-${roomInfo.id}`;
        presentCardIds.add(cardId);
        const data = roomDataCache[`${roomInfo.platform}-${roomInfo.id}`] || { loading: true };

        let card = document.getElementById(cardId);

        // CRITICAL FIX: Preserve card's previous zone during loading/retrying
        // Only reassign zone after refresh completes
        let targetGridKey = 'offline';
        let cardState = 'loading';
        let previousZone = null;

        // If card exists, determine its current zone
        if (card && card.parentElement) {
            const parentId = card.parentElement.id;
            if (parentId === 'grid-live') previousZone = 'live';
            else if (parentId === 'grid-loop') previousZone = 'loop';
            else if (parentId === 'grid-offline') previousZone = 'offline';
        }

        if (!data.loading) {
            // Loading complete - assign zone based on current state
            if (data.isError || data._retryFailed) {
                // All retries failed - mark as offline but with error indicator
                targetGridKey = 'offline';
                cardState = 'error';
                hasOffline = true;
            } else if (data.isLive) {
                targetGridKey = 'live';
                cardState = 'live';
                hasLive = true;
            } else if (data.isReplay) {
                targetGridKey = 'loop';
                cardState = 'loop';
                hasLoop = true;
            } else {
                targetGridKey = 'offline';
                cardState = 'offline';
                hasOffline = true;
            }
        } else if (data._retrying) {
            // Retrying - keep in previous zone if it exists, otherwise default to offline
            cardState = 'retrying';
            if (previousZone) {
                targetGridKey = previousZone;
                // Update zone flags based on preserved zone
                if (previousZone === 'live') hasLive = true;
                else if (previousZone === 'loop') hasLoop = true;
                else hasOffline = true;
            } else {
                // New card, no previous zone - default to offline
                targetGridKey = 'offline';
                hasOffline = true;
            }
        } else {
            // Loading - keep in previous zone if it exists, otherwise default to offline
            if (previousZone) {
                targetGridKey = previousZone;
                // Update zone flags based on preserved zone
                if (previousZone === 'live') hasLive = true;
                else if (previousZone === 'loop') hasLoop = true;
                else hasOffline = true;
            } else {
                // New card, no previous zone - default to offline
                targetGridKey = 'offline';
                hasOffline = true;
            }
        }

        // Incremental update: Smart update logic
        if (card) {
            // Card already exists
            // Check if favorite status changed (independent of data changes)
            const currentIsFav = card.classList.contains('is-favorite');
            const favStatusChanged = currentIsFav !== roomInfo.isFav;

            if (APP_CONFIG.INCREMENTAL.ENABLED) {
                // Incremental mode: Update if data changed OR favorite status changed OR live thumbnail needs refresh
                const isLiveThumbnail = cardState === 'live' && (roomInfo.platform === 'twitch' || roomInfo.platform === 'kick');
                const shouldUpdate = data._hasChanges !== false || favStatusChanged || isLiveThumbnail;

                if (shouldUpdate) {
                    // Has changes, favorite status changed, or live thumbnail needs refresh
                    updateCard(card, roomInfo, data, cardState);
                    updatedCount++;
                } else {
                    // No changes, skip update
                    unchangedCount++;
                }
            } else {
                // Full update mode
                updateCard(card, roomInfo, data, cardState);
                updatedCount++;
            }
        } else {
            // New card, must create
            card = createCard(cardId, roomInfo, data, cardState);
            newCardsCount++;
        }

        // 优化：只在卡片需要移动时才操作DOM，减少80%的重排操作
        const targetGrid = grids[targetGridKey];
        if (!targetGrid) {
            console.warn('[Renderer] Target grid not found for', targetGridKey);
            return;
        }

        const targetIndex = gridPositions[targetGridKey];
        const currentAtIndex = targetGrid.children[targetIndex];
        if (currentAtIndex !== card) {
            targetGrid.insertBefore(card, currentAtIndex || null);
        }
        gridPositions[targetGridKey] = targetIndex + 1;
    });

    // Incremental update: Record statistics
    if (APP_CONFIG.INCREMENTAL.ENABLED && APP_CONFIG.DEBUG.LOG_RENDER) {
        console.log(`[Render Stats] Total: ${sortedRooms.length}, Updated: ${updatedCount}, New: ${newCardsCount}, Skipped: ${unchangedCount}`);
    }

    const allCardElements = document.querySelectorAll('.room-card');
    allCardElements.forEach(card => {
        if (!presentCardIds.has(card.id)) {
            card.remove();
        }
    });

    cache.zoneLive?.classList.toggle('active', hasLive);
    cache.zoneOffline?.classList.toggle('active', hasOffline);
    cache.zoneLoop?.classList.toggle('active', hasLoop);
}

// ====================================================================
// Card Creation
// ====================================================================

/**
 * Create a new room card from template
 * @param {string} cardId - Card DOM ID
 * @param {Object} roomInfo - Room information
 * @param {Object} data - Room data
 * @param {string} cardState - Card state (live/offline/loop/loading)
 * @returns {HTMLElement} Created card element
 */
export function createCard(cardId, roomInfo, data, cardState) {
    const clone = document.getElementById('card-template').content.cloneNode(true);
    const card = clone.querySelector('.room-card');
    card.id = cardId;
    card.dataset.roomId = roomInfo.id;
    card.dataset.platform = roomInfo.platform;

    card.href = {
        douyu: `https://www.douyu.com/${roomInfo.id}`,
        bilibili: `https://live.bilibili.com/${roomInfo.id}`,
        twitch: `https://www.twitch.tv/${roomInfo.id}`,
        kick: `https://kick.com/${roomInfo.id}`,
    }[roomInfo.platform];

    const favBtn = card.querySelector('.fav-btn');
    favBtn.dataset.id = roomInfo.id;
    favBtn.dataset.platform = roomInfo.platform;

    const delBtn = card.querySelector('.delete-btn');
    delBtn.dataset.id = roomInfo.id;
    delBtn.dataset.platform = roomInfo.platform;

    // Performance optimization: Cache DOM references to card object, avoid repeated queries
    card._domRefs = {
        thumb: card.querySelector('.card-thumbnail'),
        chip: card.querySelector('.status-chip'),
        chipText: card.querySelector('.status-text'),
        titleEl: card.querySelector('.room-title'),
        ownerEl: card.querySelector('.room-owner'),
        viewerPill: card.querySelector('.viewer-pill'),
        viewerIcon: card.querySelector('.viewer-icon'),
        viewerNum: card.querySelector('.viewer-num'),
        avatar: card.querySelector('.u-avatar'),
        favBtn: favBtn,
        loader: card.querySelector('.thumb-loader'),
        durationEl: card.querySelector('.live-duration')
    };

    updateCard(card, roomInfo, data, cardState);
    return card;
}

// ====================================================================
// Card Update
// ====================================================================

/**
 * Update existing card with new data (incremental rendering)
 * @param {HTMLElement} card - Card DOM element
 * @param {Object} roomInfo - Room information
 * @param {Object} data - Room data
 * @param {string} cardState - Card state (live/offline/loop/loading)
 */
export function updateCard(card, roomInfo, data, cardState) {
    // Performance optimization: Use cached DOM references (if exists)
    let refs;
    if (card._domRefs) {
        // Use cached references
        refs = card._domRefs;
    } else {
        // Fallback: If cache doesn't exist, query directly (for compatibility)
        refs = {
            thumb: card.querySelector('.card-thumbnail'),
            chip: card.querySelector('.status-chip'),
            chipText: card.querySelector('.status-text'),
            titleEl: card.querySelector('.room-title'),
            ownerEl: card.querySelector('.room-owner'),
            viewerPill: card.querySelector('.viewer-pill'),
            viewerIcon: card.querySelector('.viewer-icon'),
            viewerNum: card.querySelector('.viewer-num'),
            avatar: card.querySelector('.u-avatar'),
            favBtn: card.querySelector('.fav-btn'),
            loader: card.querySelector('.thumb-loader'),
            durationEl: card.querySelector('.live-duration')
        };
    }

    const { thumb, chip, chipText, titleEl, ownerEl, viewerPill, viewerIcon, viewerNum, avatar: avt, favBtn, loader, durationEl } = refs;

    const cols = { douyu: '#ff5d23', bilibili: '#fb7299', twitch: '#9146ff', kick: '#53fc18' };
    card.style.setProperty('--brand-color', cols[roomInfo.platform]);
    viewerIcon.textContent = (roomInfo.platform === 'twitch' || roomInfo.platform === 'kick') ? '👤' : '🔥';

    // Favorite status: Always sync to ensure consistency
    const isFav = !!roomInfo.isFav;  // Ensure boolean
    const hasFavClass = card.classList.contains('is-favorite');

    if (isFav !== hasFavClass) {
        // State mismatch - update classes and button
        if (isFav) {
            card.classList.add('is-favorite');
            favBtn.classList.add('active');
        } else {
            card.classList.remove('is-favorite');
            favBtn.classList.remove('active');
        }

        // Update button SVG
        favBtn.innerHTML = isFav
            ? '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" stroke="none"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.01 4.38.38-3.32 2.88 1 4.28L12 15.4z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    }

    card.classList.remove('is-live-card', 'is-offline-card', 'is-loop-card');

    let newThumbSrc = '';
    const newAvatarSrc = data.avatar || '';

    // Get display title using unified helper (eliminates code duplication)
    const displayTitle = getDisplayTitle(data, roomInfo, cardState);
    const ownerText = `${data.owner || roomInfo.id} - ${roomInfo.id}`;

    switch (cardState) {
        case 'live':
            card.classList.add('is-live-card');
            chip.className = 'status-chip chip-live';
            if (chipText.textContent !== '直播中') chipText.textContent = '直播中';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== data.viewers) viewerNum.textContent = data.viewers;
            newThumbSrc = data.cover;

            const duration = data.startTime ? formatDuration(data.startTime) : null;
            if (duration) {
                durationEl.textContent = `⏱ ${duration}`;
                if (durationEl.classList.contains('hidden')) durationEl.classList.remove('hidden');
            } else {
                if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            }
            break;

        case 'loop':
            card.classList.add('is-loop-card');
            chip.className = 'status-chip chip-loop';
            if (chipText.textContent !== '轮播') chipText.textContent = '轮播';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== '轮播中') viewerNum.textContent = '轮播中';
            newThumbSrc = data.cover;
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'offline':
            card.classList.add('is-offline-card');
            chip.className = 'status-chip chip-off';
            if (chipText.textContent !== '离线') chipText.textContent = '离线';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== '离线') viewerNum.textContent = '离线';
            newThumbSrc = data.avatar || data.cover;
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'error':
            card.classList.add('is-offline-card', 'is-error-card');
            chip.className = 'status-chip chip-error';
            if (chipText.textContent !== '连接失败') chipText.textContent = '连接失败';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== data.viewers) viewerNum.textContent = data.viewers;
            newThumbSrc = data.avatar || data.cover;
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'retrying':
            chip.className = 'status-chip chip-loading';
            const retryText = `重试中${data._retryCount ? ` (${data._retryCount}/2)` : ''}`;
            if (chipText.textContent !== retryText) chipText.textContent = retryText;
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== '请稍候') viewerNum.textContent = '请稍候';
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'loading':
        default:
            chip.className = 'status-chip chip-off';
            if (chipText.textContent !== '加载中') chipText.textContent = '加载中';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== '---') ownerEl.textContent = '---';
            if (viewerNum.textContent !== '--') viewerNum.textContent = '--';
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;
    }

    // Update thumbnail with lazy loading and fallback support
    // Only update if URL actually changed to prevent flickering
    if (newThumbSrc && thumb.src !== newThumbSrc) {
        thumb.classList.remove('loaded');
        loader.classList.remove('hidden');
        thumb.src = newThumbSrc;

        // Use setImageHandlers to prevent memory leak from accumulated handlers
        setImageHandlers(thumb,
            // onLoad handler
            () => {
                thumb.classList.add('loaded');
                loader.classList.add('hidden');
                delete thumb.dataset.triedHD;
                delete thumb.dataset.triedStandard;
            },
            // onError handler
            (e) => {
                const fallbackHD = data._coverFallbackHD;
                const fallbackStandard = data._coverFallback;

                if (fallbackHD && thumb.src !== fallbackHD && !thumb.dataset.triedHD) {
                    thumb.dataset.triedHD = 'true';
                    thumb.src = fallbackHD;
                } else if (fallbackStandard && thumb.src !== fallbackStandard && !thumb.dataset.triedStandard) {
                    thumb.dataset.triedStandard = 'true';
                    thumb.src = fallbackStandard;
                } else {
                    loader.classList.add('hidden');
                    delete thumb.dataset.triedHD;
                    delete thumb.dataset.triedStandard;
                }
            }
        );
    } else if (!newThumbSrc && thumb.src) {
        thumb.src = '';
        thumb.classList.remove('loaded');
    }

    // Update avatar with lazy loading
    const avatarSkeleton = avt.nextElementSibling;
    if (newAvatarSrc && avt.src !== newAvatarSrc) {
        avt.src = newAvatarSrc;

        // Use setImageHandlers to prevent memory leak
        setImageHandlers(avt,
            () => {
                avt.classList.remove('hidden');
                if (avatarSkeleton) avatarSkeleton.classList.add('hidden');
            },
            () => {
                avt.classList.add('hidden');
                if (avatarSkeleton) avatarSkeleton.classList.remove('hidden');
            }
        );
    } else if (!newAvatarSrc && avt.src) {
        avt.src = '';
        avt.classList.add('hidden');
        if (avatarSkeleton) avatarSkeleton.classList.remove('hidden');
    }
}

// ====================================================================
// Debounced Render Function
// ====================================================================

/**
 * 防抖版本的renderAll - 优化渲染频率
 * 在短时间内多次调用时，只执行最后一次
 * 默认16ms延迟（约60fps）
 */
export const debouncedRenderAll = debounce(renderAllImmediate, 16);

/**
 * 立即渲染所有房间卡片（不防抖）
 * 用于需要强制刷新的场景（如手动刷新、初始化等）
 */
export function renderAll() {
    // 取消任何待执行的防抖渲染，直接执行
    debouncedRenderAll.cancel();
    renderAllImmediate();
}

// ====================================================================
// Exports
// ====================================================================

export default renderAll;

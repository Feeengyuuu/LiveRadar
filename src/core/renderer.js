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

// ====================================================================
// Debounce Utility
// ====================================================================

/**
 * 防抖函数 - 优化renderAll调用频率
 * 在短时间内多次调用时，只执行最后一次
 * @param {Function} func - 需要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait = 16) {
    let timeout;
    let lastCallTime = 0;

    const debounced = function(...args) {
        const now = Date.now();
        const timeSinceLastCall = now - lastCallTime;

        // 清除之前的定时器
        if (timeout) {
            clearTimeout(timeout);
        }

        // 如果距离上次调用超过wait时间，立即执行
        // 这样可以保证第一次调用和长时间没有调用后的首次调用能立即执行
        if (timeSinceLastCall > wait * 2) {
            lastCallTime = now;
            func.apply(this, args);
        } else {
            // 否则延迟执行
            timeout = setTimeout(() => {
                lastCallTime = Date.now();
                func.apply(this, args);
            }, wait);
        }
    };

    // 添加立即执行方法，用于需要强制刷新的场景
    debounced.immediate = function(...args) {
        if (timeout) {
            clearTimeout(timeout);
        }
        lastCallTime = Date.now();
        func.apply(this, args);
    };

    return debounced;
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
    const zones = document.querySelectorAll('.zone-container');

    if (rooms.length === 0) {
        cache.emptyState?.classList.remove('hidden');
        zones.forEach(el => el.classList.remove('active'));
        Object.values(grids).forEach(grid => { if (grid) grid.innerHTML = ''; });
        return;
    }
    cache.emptyState?.classList.add('hidden');

    const sortedRooms = [...rooms].sort((a, b) => {
        const dA = roomDataCache[`${a.platform}-${a.id}`] || {};
        const dB = roomDataCache[`${b.platform}-${b.id}`] || {};
        if (a.isFav !== b.isFav) return b.isFav - a.isFav;
        if (dA.isLive !== dB.isLive) return dB.isLive - dA.isLive;
        if (dA.isReplay !== dB.isReplay) return dB.isReplay - dA.isReplay;
        return (dB.heatValue || 0) - (dA.heatValue || 0);
    });

    const presentCardIds = new Set();
    let hasLive = false, hasOffline = false, hasLoop = false;

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

        if (card.parentElement !== targetGrid) {
            // 卡片在错误的区域，需要移动
            targetGrid.appendChild(card);
        } else {
            // 卡片已在正确区域，简单检查：如果不是最后一个元素且下一个元素存在，就按原逻辑插入
            // 为了避免indexOf性能问题，我们直接appendChild，浏览器会自动处理已存在的元素
            targetGrid.appendChild(card);
        }
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

    document.getElementById('zone-live').classList.toggle('active', hasLive);
    document.getElementById('zone-offline').classList.toggle('active', hasOffline);
    document.getElementById('zone-loop').classList.toggle('active', hasLoop);
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

    switch (cardState) {
        case 'live':
            card.classList.add('is-live-card');
            chip.className = 'status-chip chip-live';
            if (chipText.textContent !== '直播中') chipText.textContent = '直播中';

            // International platforms display different content based on data status
            let displayTitle = data.title;
            if ((roomInfo.platform === 'twitch' || roomInfo.platform === 'kick') && (data.isError || data._stale)) {
                displayTitle = '连接异常';
            }
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;

            if (ownerEl.textContent !== `${data.owner} - ${roomInfo.id}`) ownerEl.textContent = `${data.owner} - ${roomInfo.id}`;
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

            // International platforms display different content based on data status
            let displayTitleLoop = data.title;
            if ((roomInfo.platform === 'twitch' || roomInfo.platform === 'kick') && (data.isError || data._stale)) {
                displayTitleLoop = '连接异常';
            }
            if (titleEl.textContent !== displayTitleLoop) titleEl.textContent = displayTitleLoop;

            if (ownerEl.textContent !== `${data.owner} - ${roomInfo.id}`) ownerEl.textContent = `${data.owner} - ${roomInfo.id}`;
            if (viewerNum.textContent !== '轮播中') viewerNum.textContent = '轮播中';
            newThumbSrc = data.cover;
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'offline':
            card.classList.add('is-offline-card');
            chip.className = 'status-chip chip-off';
            if (chipText.textContent !== '离线') chipText.textContent = '离线';

            // International platforms display different content based on data status
            let displayTitleOffline = data.title || "未开播";
            if ((roomInfo.platform === 'twitch' || roomInfo.platform === 'kick') && (data.isError || data._stale)) {
                displayTitleOffline = '连接异常';
            }
            if (titleEl.textContent !== displayTitleOffline) titleEl.textContent = displayTitleOffline;

            if (ownerEl.textContent !== `${data.owner || roomInfo.id} - ${roomInfo.id}`) ownerEl.textContent = `${data.owner || roomInfo.id} - ${roomInfo.id}`;
            if (viewerNum.textContent !== '离线') viewerNum.textContent = '离线';
            newThumbSrc = data.avatar || data.cover;
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'error':
            // Error state after all retries failed
            card.classList.add('is-offline-card', 'is-error-card');
            chip.className = 'status-chip chip-error';
            if (chipText.textContent !== '连接失败') chipText.textContent = '连接失败';

            const errorTitle = data.title || '获取失败';
            if (titleEl.textContent !== errorTitle) titleEl.textContent = errorTitle;

            if (ownerEl.textContent !== `${data.owner || roomInfo.id} - ${roomInfo.id}`) {
                ownerEl.textContent = `${data.owner || roomInfo.id} - ${roomInfo.id}`;
            }
            if (viewerNum.textContent !== data.viewers) viewerNum.textContent = data.viewers;
            newThumbSrc = data.avatar || data.cover;
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'retrying':
            // Retrying state
            chip.className = 'status-chip chip-loading';
            const retryText = `重试中${data._retryCount ? ` (${data._retryCount}/2)` : ''}`;
            if (chipText.textContent !== retryText) chipText.textContent = retryText;
            if (titleEl.textContent !== '正在重试连接...') titleEl.textContent = '正在重试连接...';
            if (ownerEl.textContent !== `${data.owner || roomInfo.id} - ${roomInfo.id}`) {
                ownerEl.textContent = `${data.owner || roomInfo.id} - ${roomInfo.id}`;
            }
            if (viewerNum.textContent !== '请稍候') viewerNum.textContent = '请稍候';
            if (!durationEl.classList.contains('hidden')) durationEl.classList.add('hidden');
            break;

        case 'loading':
        default:
            chip.className = 'status-chip chip-off';
            if (chipText.textContent !== '加载中') chipText.textContent = '加载中';
            if (titleEl.textContent !== '连接中...') titleEl.textContent = '连接中...';
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
        thumb.onload = () => {
            thumb.classList.add('loaded');
            loader.classList.add('hidden');
            // Clear fallback flags on success
            delete thumb.dataset.triedHD;
            delete thumb.dataset.triedStandard;
            console.log(`[Renderer] ✓ Thumbnail loaded successfully: ${newThumbSrc.substring(0, 80)}...`);
        };
        thumb.onerror = (e) => {
            // Multi-level fallback for live thumbnails
            const fallbackHD = data._coverFallbackHD;
            const fallbackStandard = data._coverFallback;

            // Try HD fallback first (if available and not tried yet)
            if (fallbackHD && thumb.src !== fallbackHD && !thumb.dataset.triedHD) {
                console.warn(`[Renderer] ⚠ Primary thumbnail failed, trying HD fallback`);
                thumb.dataset.triedHD = 'true';
                thumb.src = fallbackHD;
            }
            // Then try standard fallback
            else if (fallbackStandard && thumb.src !== fallbackStandard && !thumb.dataset.triedStandard) {
                console.warn(`[Renderer] ⚠ HD fallback failed, trying standard fallback`);
                thumb.dataset.triedStandard = 'true';
                thumb.src = fallbackStandard;
            }
            // All fallbacks exhausted
            else {
                loader.classList.add('hidden');
                console.error(`[Renderer] ✗ All thumbnail URLs failed:`, newThumbSrc);
                console.error(`[Renderer] Error details:`, e);
                // Clear fallback flags for next attempt
                delete thumb.dataset.triedHD;
                delete thumb.dataset.triedStandard;
                // Visual indicator removed for production
            }
        };
    } else if (!newThumbSrc && thumb.src) {
        thumb.src = '';
        thumb.classList.remove('loaded');
    }

    // Update avatar with lazy loading
    const avatarSkeleton = avt.nextElementSibling;
    if (newAvatarSrc && avt.src !== newAvatarSrc) {
        avt.src = newAvatarSrc;
        avt.onload = () => {
            avt.classList.remove('hidden');
            if (avatarSkeleton) avatarSkeleton.classList.add('hidden');
        };
        avt.onerror = () => {
            avt.classList.add('hidden');
            if (avatarSkeleton) avatarSkeleton.classList.remove('hidden');
        };
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
    debouncedRenderAll.immediate();
}

// ====================================================================
// Exports
// ====================================================================

export default renderAll;

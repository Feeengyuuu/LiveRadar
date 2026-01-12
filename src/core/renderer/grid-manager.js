/**
 * ====================================================================
 * Grid Manager - Main Rendering Engine
 * ====================================================================
 *
 * Handles:
 * - Orchestrating the complete render cycle
 * - Grid management (live/offline/loop)
 * - Card positioning and movement between grids
 * - Batch DOM operations with DocumentFragment
 * - Card tracking for efficient removal
 * - Debounced render function
 *
 * @module core/renderer/grid-manager
 */

import { APP_CONFIG } from '../../config/constants.js';
import { getDOMCache } from '../../utils/dom-cache.js';
import { getRooms, getRoomDataCache, subscribeToState } from '../state.js';
import { debounce, getRoomCacheKey, getCardId } from '../../utils/helpers.js';
import { viewportTracker } from '../../utils/viewport-tracker.js';
import { createCard } from './card-factory.js';
import { updateCard } from './card-renderer.js';

// ====================================================================
// Card Tracking (Performance Optimization)
// ====================================================================

/**
 * Track known card IDs to optimize removal operations
 * Avoids expensive querySelectorAll on every render
 */
const knownCardIds = new Set();

// ====================================================================
// Initialization
// ====================================================================

/**
 * Initialize renderer with state subscriptions
 * Automatically re-renders when rooms state changes
 */
export function initRenderer(deps = {}) {
    // Subscribe to rooms changes for automatic re-rendering
    subscribeToState('rooms', (newRooms, oldRooms) => {
        console.log('[Renderer] Rooms changed, auto-rendering...');
        debouncedRenderAll();
    });

    console.log('[Renderer] Initialized with state subscriptions');
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
        if (cache.liveCount) {
            cache.liveCount.textContent = '0';
        }
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
    let liveCount = 0;
    const gridPositions = { live: 0, offline: 0, loop: 0 };

    // Incremental update: Count changes
    let updatedCount = 0;
    let unchangedCount = 0;
    let newCardsCount = 0;

    // 🔥 Performance: DocumentFragment for batch DOM insertion
    // Collect new cards in fragments, insert once at end
    // Reduces reflows from N to 3 (one per grid)
    const newCardsByGrid = {
        live: [],
        offline: [],
        loop: []
    };

    sortedRooms.forEach(roomInfo => {
        const cardId = getCardId(roomInfo.platform, roomInfo.id);
        presentCardIds.add(cardId);
        const data = roomDataCache[getRoomCacheKey(roomInfo.platform, roomInfo.id)] || { loading: true };

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
                liveCount++;
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
            card = createCard(cardId, roomInfo, data, cardState, updateCard);
            newCardsCount++;

            // 🔥 Performance: Collect new cards for batch insertion
            newCardsByGrid[targetGridKey].push({
                card,
                position: gridPositions[targetGridKey]
            });
            gridPositions[targetGridKey]++;
            return; // Skip insertion logic for new cards
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

    // 🔥 Performance: Batch insert all new cards using DocumentFragment
    // Single reflow per grid instead of one per card
    Object.keys(newCardsByGrid).forEach(gridKey => {
        const newCards = newCardsByGrid[gridKey];
        if (newCards.length === 0) return;

        const targetGrid = grids[gridKey];
        if (!targetGrid) return;

        const fragment = document.createDocumentFragment();
        newCards.forEach(({ card }) => {
            fragment.appendChild(card);
        });

        // Insert all new cards at once
        targetGrid.appendChild(fragment);

        if (APP_CONFIG.DEBUG.LOG_RENDER) {
            console.log(`[Render] Batch inserted ${newCards.length} new cards into ${gridKey} grid`);
        }
    });

    // Incremental update: Record statistics
    if (APP_CONFIG.INCREMENTAL.ENABLED && APP_CONFIG.DEBUG.LOG_RENDER) {
        console.log(`[Render Stats] Total: ${sortedRooms.length}, Updated: ${updatedCount}, New: ${newCardsCount}, Skipped: ${unchangedCount}`);
    }

    // Optimized: Only remove cards that were previously known but are no longer needed
    // Avoids expensive querySelectorAll on every render (60-80% reduction in DOM queries)
    knownCardIds.forEach(cardId => {
        if (!presentCardIds.has(cardId)) {
            const card = document.getElementById(cardId);
            if (card) {
                // 🔥 Performance: Unregister from viewport tracker
                viewportTracker.unobserve(card);
                card.remove();
            }
            knownCardIds.delete(cardId);
        }
    });

    // Update known cards set
    presentCardIds.forEach(cardId => knownCardIds.add(cardId));

    if (cache.liveCount) {
        const nextCount = String(liveCount);
        if (cache.liveCount.textContent !== nextCount) {
            cache.liveCount.textContent = nextCount;
        }
    }

    cache.zoneLive?.classList.toggle('active', hasLive);
    cache.zoneOffline?.classList.toggle('active', hasOffline);
    cache.zoneLoop?.classList.toggle('active', hasLoop);
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
export const renderAll = renderAllImmediate;

/**
 * Grid Manager - Main Rendering Engine
 *
 * Orchestrates the render cycle: zone assignment, incremental updates,
 * batch DOM insertion, and orphan pruning.
 */

import { APP_CONFIG } from '../../config/constants.js';
import { getDOMCache } from '../../utils/dom-cache.js';
import { getRooms, getRoomDataCache, subscribeToState } from '../state.js';
import { debounce, getRoomCacheKey, getCardId } from '../../utils/helpers.js';
import { viewportTracker } from '../../utils/viewport-tracker.js';
import { on, Events } from '../event-bus.js';
import { createCard } from './card-factory.js';
import { updateCard } from './card-renderer.js';

// Tracks all card IDs currently in the DOM so prune() can remove stale ones
// without a querySelectorAll on every render.
const knownCardIds = new Set();
let disposeRenderer = null;

export function initRenderer() {
    if (disposeRenderer) return disposeRenderer;

    const unsubscribeRooms = subscribeToState('rooms', () => {
        console.log('[Renderer] Rooms changed, auto-rendering...');
        debouncedRenderAll();
    });

    const unsubscribeRenderRequest = on(Events.RENDER_REQUEST, () => renderAllImmediate());

    disposeRenderer = () => {
        unsubscribeRooms();
        unsubscribeRenderRequest();
        debouncedRenderAll.cancel?.();
        disposeRenderer = null;
    };

    console.log('[Renderer] Initialized with state subscriptions');
    return disposeRenderer;
}

// ====================================================================
// Zone assignment
// ====================================================================

/**
 * Read a card's current zone by looking at its parent grid element.
 * Returns null for new cards.
 */
function getPreviousZone(card) {
    if (!card || !card.parentElement) return null;
    const parentId = card.parentElement.id;
    if (parentId === 'grid-live') return 'live';
    if (parentId === 'grid-loop') return 'loop';
    if (parentId === 'grid-offline') return 'offline';
    return null;
}

/**
 * Decide which grid a card belongs in and its visual state.
 *
 * State machine:
 *   LOADED    → live / loop / offline / offline(error)
 *   RETRYING  → stay in previousZone (avoid visual jumping)
 *   LOADING   → stay in previousZone if exists, else offline
 *
 * Mutates `flags` to record which zones have any cards, and returns
 * the target grid key plus the state passed to updateCard.
 */
function assignCardZone(data, previousZone, flags) {
    if (!data.loading) {
        if (data.isError || data._retryFailed) {
            flags.hasOffline = true;
            flags.offlineCount++;
            return { targetGridKey: 'offline', cardState: 'error' };
        }
        if (data.isLive) {
            flags.hasLive = true;
            flags.liveCount++;
            return { targetGridKey: 'live', cardState: 'live' };
        }
        if (data.isReplay) {
            flags.hasLoop = true;
            flags.loopCount++;
            return { targetGridKey: 'loop', cardState: 'loop' };
        }
        flags.hasOffline = true;
        flags.offlineCount++;
        return { targetGridKey: 'offline', cardState: 'offline' };
    }

    const cardState = data._retrying ? 'retrying' : 'loading';
    const zone = previousZone || 'offline';
    if (zone === 'live') {
        flags.hasLive = true;
    } else if (zone === 'loop') {
        flags.hasLoop = true;
        flags.loopCount++;
    } else {
        flags.hasOffline = true;
        flags.offlineCount++;
    }
    return { targetGridKey: zone, cardState };
}

// ====================================================================
// Incremental update decision
// ====================================================================

/**
 * For existing cards in incremental mode, decide whether to call updateCard.
 * Live Twitch/Kick thumbnails always refresh to get the latest preview frame.
 */
function shouldUpdateCard(card, roomInfo, data, cardState) {
    if (!APP_CONFIG.INCREMENTAL.ENABLED) return true;

    const currentIsFav = card.classList.contains('is-favorite');
    const favStatusChanged = currentIsFav !== !!roomInfo.isFav;
    const platformChip = card._domRefs?.platformChip || card.querySelector('.platform-chip');
    const platformChromeNeedsUpdate = !!platformChip && platformChip.textContent.trim() === '平台';
    const isLiveThumbnail = cardState === 'live'
        && (roomInfo.platform === 'twitch' || roomInfo.platform === 'kick');

    return data._hasChanges !== false
        || data._stale === true
        || favStatusChanged
        || platformChromeNeedsUpdate
        || isLiveThumbnail;
}

// ====================================================================
// Batch DOM insertion
// ====================================================================

/**
 * Append all newly-created cards to their target grids in a single reflow
 * per grid via DocumentFragment.
 */
function batchInsertNewCards(newCardsByGrid, grids) {
    Object.keys(newCardsByGrid).forEach(gridKey => {
        const newCards = newCardsByGrid[gridKey];
        if (newCards.length === 0) return;

        const targetGrid = grids[gridKey];
        if (!targetGrid) return;

        const fragment = document.createDocumentFragment();
        newCards.forEach(({ card }) => fragment.appendChild(card));
        targetGrid.appendChild(fragment);

        if (APP_CONFIG.DEBUG.LOG_RENDER) {
            console.log(`[Render] Batch inserted ${newCards.length} new cards into ${gridKey} grid`);
        }
    });
}

/**
 * Remove cards whose rooms were deleted in this render pass and
 * detach them from the viewport tracker.
 */
function pruneOrphanCards(presentCardIds) {
    knownCardIds.forEach(cardId => {
        if (!presentCardIds.has(cardId)) {
            const card = document.getElementById(cardId);
            if (card) {
                viewportTracker.unobserve(card);
                card.remove();
            }
            knownCardIds.delete(cardId);
        }
    });
    presentCardIds.forEach(cardId => knownCardIds.add(cardId));
}

// ====================================================================
// Empty-state fast path
// ====================================================================

function renderEmptyState(cache, grids, zones) {
    if (cache.liveCount) cache.liveCount.textContent = '0';
    if (cache.offlineCount) cache.offlineCount.textContent = '0';
    if (cache.loopCount) cache.loopCount.textContent = '0';
    if (cache.metricLiveCount) cache.metricLiveCount.textContent = '0';
    if (cache.metricOfflineCount) cache.metricOfflineCount.textContent = '0';
    if (cache.metricFavoriteCount) cache.metricFavoriteCount.textContent = '0';
    cache.emptyState?.classList.remove('hidden');
    zones.forEach(el => el.classList.remove('active'));
    Object.values(grids).forEach(grid => {
        if (!grid) return;
        Array.from(grid.children).forEach(card => {
            if (card instanceof HTMLElement && card.classList.contains('room-card')) {
                viewportTracker.unobserve(card);
            }
        });
        grid.innerHTML = '';
    });
    knownCardIds.clear();
}

// ====================================================================
// Main render function
// ====================================================================

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
        renderEmptyState(cache, grids, zones);
        return;
    }
    cache.emptyState?.classList.add('hidden');

    // Favorites sort first, everything else keeps insertion order
    const favorites = [];
    const others = [];
    rooms.forEach(room => (room.isFav ? favorites : others).push(room));
    const sortedRooms = favorites.concat(others);

    const presentCardIds = new Set();
    const flags = { hasLive: false, hasOffline: false, hasLoop: false, liveCount: 0, offlineCount: 0, loopCount: 0 };
    const gridPositions = { live: 0, offline: 0, loop: 0 };
    const newCardsByGrid = { live: [], offline: [], loop: [] };

    let updatedCount = 0;
    let unchangedCount = 0;
    let newCardsCount = 0;

    sortedRooms.forEach(roomInfo => {
        const cardId = getCardId(roomInfo.platform, roomInfo.id);
        presentCardIds.add(cardId);
        const data = roomDataCache[getRoomCacheKey(roomInfo.platform, roomInfo.id)] || { loading: true };

        let card = document.getElementById(cardId);
        const previousZone = getPreviousZone(card);
        const { targetGridKey, cardState } = assignCardZone(data, previousZone, flags);

        if (card) {
            if (shouldUpdateCard(card, roomInfo, data, cardState)) {
                updateCard(card, roomInfo, data, cardState);
                updatedCount++;
            } else {
                unchangedCount++;
            }
        } else {
            card = createCard(cardId, roomInfo, data, cardState, updateCard);
            newCardsCount++;
            newCardsByGrid[targetGridKey].push({ card, position: gridPositions[targetGridKey] });
            gridPositions[targetGridKey]++;
            return;
        }

        // Reposition existing cards only when they moved zones or ordering changed.
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

    batchInsertNewCards(newCardsByGrid, grids);

    if (APP_CONFIG.INCREMENTAL.ENABLED && APP_CONFIG.DEBUG.LOG_RENDER) {
        console.log(`[Render Stats] Total: ${sortedRooms.length}, Updated: ${updatedCount}, New: ${newCardsCount}, Skipped: ${unchangedCount}`);
    }

    pruneOrphanCards(presentCardIds);

    if (cache.liveCount) {
        const nextCount = String(flags.liveCount);
        if (cache.liveCount.textContent !== nextCount) {
            cache.liveCount.textContent = nextCount;
        }
    }
    if (cache.offlineCount) {
        const nextCount = String(flags.offlineCount);
        if (cache.offlineCount.textContent !== nextCount) {
            cache.offlineCount.textContent = nextCount;
        }
    }
    if (cache.loopCount) {
        const nextCount = String(flags.loopCount);
        if (cache.loopCount.textContent !== nextCount) {
            cache.loopCount.textContent = nextCount;
        }
    }

    const favoriteCount = rooms.filter(room => room.isFav).length;
    const offlineTotal = flags.offlineCount;
    if (cache.metricLiveCount) cache.metricLiveCount.textContent = String(flags.liveCount);
    if (cache.metricOfflineCount) cache.metricOfflineCount.textContent = String(offlineTotal);
    if (cache.metricFavoriteCount) cache.metricFavoriteCount.textContent = String(favoriteCount);

    cache.zoneLive?.classList.toggle('active', flags.hasLive);
    cache.zoneOffline?.classList.toggle('active', flags.hasOffline);
    cache.zoneLoop?.classList.toggle('active', flags.hasLoop);
}

// ~60fps debounced wrapper. Use renderAll (the raw function) only when you
// truly need a synchronous render — normal code paths go through the debounced
// version or emit Events.RENDER_REQUEST.
export const debouncedRenderAll = debounce(renderAllImmediate, 16);
export const renderAll = renderAllImmediate;

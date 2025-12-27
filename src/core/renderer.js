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

// External dependencies (injected)
let rooms = [];
let roomDataCache = {};

/**
 * Initialize renderer with external dependencies
 * @param {Object} deps - Dependencies object
 */
export function initRenderer(deps = {}) {
    if (deps.rooms) rooms = deps.rooms;
    if (deps.roomDataCache) roomDataCache = deps.roomDataCache;
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
 */
export function renderAll() {
    const grids = {
        live: document.getElementById('grid-live'),
        offline: document.getElementById('grid-offline'),
        loop: document.getElementById('grid-loop')
    };
    const zones = document.querySelectorAll('.zone-container');

    if (rooms.length === 0) {
        document.getElementById('empty-state').classList.remove('hidden');
        zones.forEach(el => el.classList.remove('active'));
        Object.values(grids).forEach(grid => { if (grid) grid.innerHTML = ''; });
        return;
    }
    document.getElementById('empty-state').classList.add('hidden');

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

        let targetGridKey = 'offline';
        let cardState = 'loading';
        if (!data.loading) {
            if (data.isLive) { targetGridKey = 'live'; cardState = 'live'; hasLive = true; }
            else if (data.isReplay) { targetGridKey = 'loop'; cardState = 'loop'; hasLoop = true; }
            else { targetGridKey = 'offline'; cardState = 'offline'; hasOffline = true; }
        } else {
            hasOffline = true;
        }

        // Incremental update: Smart update logic
        if (card) {
            // Card already exists
            // Check if favorite status changed (independent of data changes)
            const currentIsFav = card.classList.contains('is-favorite');
            const favStatusChanged = currentIsFav !== roomInfo.isFav;

            if (APP_CONFIG.INCREMENTAL.ENABLED) {
                // Incremental mode: Update if data changed OR favorite status changed
                if (data._hasChanges !== false || favStatusChanged) {
                    // Has changes or favorite status changed
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

        // Move card to correct grid and ensure sorting
        // appendChild automatically handles element movement, enforcing correct DOM order based on sortedRooms array
        const targetGrid = grids[targetGridKey];
        targetGrid.appendChild(card);
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

    const cols = { douyu: '#ff5d23', bilibili: '#fb7299', twitch: '#9146ff' };
    card.style.setProperty('--brand-color', cols[roomInfo.platform]);
    viewerIcon.textContent = (roomInfo.platform === 'twitch') ? '👤' : '🔥';

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
    let newAvatarSrc = data.avatar || '';

    switch (cardState) {
        case 'live':
            card.classList.add('is-live-card');
            chip.className = 'status-chip chip-live';
            if (chipText.textContent !== '直播中') chipText.textContent = '直播中';

            // Twitch platform displays different content based on data status
            let displayTitle = data.title;
            if (roomInfo.platform === 'twitch' && (data.isError || data._stale)) {
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

            // Twitch platform displays different content based on data status
            let displayTitleLoop = data.title;
            if (roomInfo.platform === 'twitch' && (data.isError || data._stale)) {
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

            // Twitch platform displays different content based on data status
            let displayTitleOffline = data.title || "未开播";
            if (roomInfo.platform === 'twitch' && (data.isError || data._stale)) {
                displayTitleOffline = '连接异常';
            }
            if (titleEl.textContent !== displayTitleOffline) titleEl.textContent = displayTitleOffline;

            if (ownerEl.textContent !== `${data.owner || roomInfo.id} - ${roomInfo.id}`) ownerEl.textContent = `${data.owner || roomInfo.id} - ${roomInfo.id}`;
            if (viewerNum.textContent !== '离线') viewerNum.textContent = '离线';
            newThumbSrc = data.avatar || data.cover;
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

    // Update thumbnail with lazy loading
    if (newThumbSrc && thumb.src !== newThumbSrc) {
        thumb.classList.remove('loaded');
        loader.classList.remove('hidden');
        thumb.src = newThumbSrc;
        thumb.onload = () => {
            thumb.classList.add('loaded');
            loader.classList.add('hidden');
        };
        thumb.onerror = () => {
            loader.classList.add('hidden');
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
// Exports
// ====================================================================

export default renderAll;

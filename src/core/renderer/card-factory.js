/**
 * ====================================================================
 * Card Factory - Room Card Creation
 * ====================================================================
 *
 * Handles creation of new room cards from template
 *
 * @module core/renderer/card-factory
 */

import { viewportTracker } from '../../utils/viewport-tracker.js';

/**
 * Create a new room card from template
 * @param {string} cardId - Card DOM ID
 * @param {Object} roomInfo - Room information
 * @param {Object} data - Room data
 * @param {string} cardState - Card state (live/offline/loop/loading)
 * @param {Function} updateCard - Card update function from card-renderer
 * @returns {HTMLElement} Created card element
 */
export function createCard(cardId, roomInfo, data, cardState, updateCard) {
    const clone = document.getElementById('card-template').content.cloneNode(true);
    const card = clone.querySelector('.room-card');
    card.id = cardId;
    card.dataset.roomId = roomInfo.id;
    card.dataset.platform = roomInfo.platform;

    // 🔥 Performance: Register card for viewport tracking
    // Uses IntersectionObserver instead of getBoundingClientRect
    viewportTracker.observe(card);

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

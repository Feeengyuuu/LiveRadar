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

const TILT_MAX_ROTATE_DEG = 3.6;
const TILT_MAX_PUSH_PX = 4.5;
const TILT_MAX_LIFT_PX = 2.5;
const TILT_Z_PX = 8;
const TILT_DEPTH_NEAR_X_PX = 6.5;
const TILT_DEPTH_NEAR_Y_PX = 4.2;
const TILT_DEPTH_MID_X_PX = 4;
const TILT_DEPTH_MID_Y_PX = 2.8;
const TILT_DEPTH_BACK_X_PX = 2.8;
const TILT_DEPTH_BACK_Y_PX = 2;
const THUMB_SPACE_FAR_X_PX = 0.9;
const THUMB_SPACE_FAR_Y_PX = 0.7;
const THUMB_SPACE_MID_X_PX = 1.6;
const THUMB_SPACE_MID_Y_PX = 1.05;
const THUMB_SPACE_NEAR_X_PX = 2.4;
const THUMB_SPACE_NEAR_Y_PX = 1.55;
const THUMB_ROTATE_X_DEG = 0.42;
const THUMB_ROTATE_Y_DEG = 0.56;
const THUMB_FOCUS_X_PERCENT = 12;
const THUMB_FOCUS_Y_PERCENT = 10;

function canUseCardTilt() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (document.documentElement.classList.contains('perf-lite')) return false;
    if (document.documentElement.classList.contains('large-list-mode')) return false;
    if (typeof window.matchMedia !== 'function') return false;

    return window.matchMedia('(min-width: 901px)').matches
        && window.matchMedia('(hover: hover) and (pointer: fine)').matches
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearTiltStyles(card) {
    card.classList.remove('is-tilting');
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
    card.style.removeProperty('--tilt-push-x');
    card.style.removeProperty('--tilt-push-y');
    card.style.removeProperty('--tilt-push-z');
    card.style.removeProperty('--depth-near-x');
    card.style.removeProperty('--depth-near-y');
    card.style.removeProperty('--depth-mid-x');
    card.style.removeProperty('--depth-mid-y');
    card.style.removeProperty('--depth-back-x');
    card.style.removeProperty('--depth-back-y');
    card.style.removeProperty('--tilt-light-x');
    card.style.removeProperty('--tilt-light-y');
    card.style.removeProperty('--thumb-space-far-x');
    card.style.removeProperty('--thumb-space-far-y');
    card.style.removeProperty('--thumb-space-mid-x');
    card.style.removeProperty('--thumb-space-mid-y');
    card.style.removeProperty('--thumb-space-near-x');
    card.style.removeProperty('--thumb-space-near-y');
    card.style.removeProperty('--thumb-rotate-x');
    card.style.removeProperty('--thumb-rotate-y');
    card.style.removeProperty('--thumb-rotate-far-x');
    card.style.removeProperty('--thumb-rotate-far-y');
    card.style.removeProperty('--thumb-rotate-box-x');
    card.style.removeProperty('--thumb-rotate-box-y');
    card.style.removeProperty('--thumb-focus-x');
    card.style.removeProperty('--thumb-focus-y');
}

function isCardTiltDisabled(card) {
    return card.classList.contains('is-loading-card')
        || card.dataset.state === 'loading'
        || card.dataset.state === 'retrying';
}

function isInsideCard(card, target) {
    return !!target && target.nodeType === Node.ELEMENT_NODE && card.contains(target);
}

let tiltDelegationBound = false;
let activeTiltCard = null;
let tiltFrameId = 0;
let tiltRect = null;
let tiltPointerX = 0;
let tiltPointerY = 0;

function applyTilt() {
    tiltFrameId = 0;
    const card = activeTiltCard;
    if (!card?.isConnected || !tiltRect) {
        resetActiveTilt();
        return;
    }

    const width = Math.max(tiltRect.width, 1);
    const height = Math.max(tiltRect.height, 1);
    const x = Math.max(-1, Math.min(1, ((tiltPointerX - tiltRect.left) / width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((tiltPointerY - tiltRect.top) / height - 0.5) * 2));

    card.style.setProperty('--tilt-x', `${(-y * TILT_MAX_ROTATE_DEG).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(x * TILT_MAX_ROTATE_DEG).toFixed(2)}deg`);
    card.style.setProperty('--tilt-push-x', `${(x * TILT_MAX_PUSH_PX).toFixed(2)}px`);
    card.style.setProperty('--tilt-push-y', `${(y * TILT_MAX_LIFT_PX).toFixed(2)}px`);
    card.style.setProperty('--tilt-push-z', `${TILT_Z_PX}px`);
    card.style.setProperty('--depth-near-x', `${(x * TILT_DEPTH_NEAR_X_PX).toFixed(2)}px`);
    card.style.setProperty('--depth-near-y', `${(y * TILT_DEPTH_NEAR_Y_PX).toFixed(2)}px`);
    card.style.setProperty('--depth-mid-x', `${(x * TILT_DEPTH_MID_X_PX).toFixed(2)}px`);
    card.style.setProperty('--depth-mid-y', `${(y * TILT_DEPTH_MID_Y_PX).toFixed(2)}px`);
    card.style.setProperty('--depth-back-x', `${(-x * TILT_DEPTH_BACK_X_PX).toFixed(2)}px`);
    card.style.setProperty('--depth-back-y', `${(-y * TILT_DEPTH_BACK_Y_PX).toFixed(2)}px`);
    card.style.setProperty('--tilt-light-x', `${(50 + x * 22).toFixed(1)}%`);
    card.style.setProperty('--tilt-light-y', `${(50 + y * 18).toFixed(1)}%`);
    card.style.setProperty('--thumb-space-far-x', `${(-x * THUMB_SPACE_FAR_X_PX).toFixed(2)}px`);
    card.style.setProperty('--thumb-space-far-y', `${(-y * THUMB_SPACE_FAR_Y_PX).toFixed(2)}px`);
    card.style.setProperty('--thumb-space-mid-x', `${(x * THUMB_SPACE_MID_X_PX).toFixed(2)}px`);
    card.style.setProperty('--thumb-space-mid-y', `${(y * THUMB_SPACE_MID_Y_PX).toFixed(2)}px`);
    card.style.setProperty('--thumb-space-near-x', `${(x * THUMB_SPACE_NEAR_X_PX).toFixed(2)}px`);
    card.style.setProperty('--thumb-space-near-y', `${(y * THUMB_SPACE_NEAR_Y_PX).toFixed(2)}px`);
    card.style.setProperty('--thumb-rotate-x', `${(-y * THUMB_ROTATE_X_DEG).toFixed(2)}deg`);
    card.style.setProperty('--thumb-rotate-y', `${(x * THUMB_ROTATE_Y_DEG).toFixed(2)}deg`);
    card.style.setProperty('--thumb-rotate-far-x', `${(y * THUMB_ROTATE_X_DEG * 0.22).toFixed(2)}deg`);
    card.style.setProperty('--thumb-rotate-far-y', `${(-x * THUMB_ROTATE_Y_DEG * 0.22).toFixed(2)}deg`);
    card.style.setProperty('--thumb-rotate-box-x', `${(-y * THUMB_ROTATE_X_DEG * 0.28).toFixed(2)}deg`);
    card.style.setProperty('--thumb-rotate-box-y', `${(x * THUMB_ROTATE_Y_DEG * 0.28).toFixed(2)}deg`);
    card.style.setProperty('--thumb-focus-x', `${(50 + x * THUMB_FOCUS_X_PERCENT).toFixed(1)}%`);
    card.style.setProperty('--thumb-focus-y', `${(50 + y * THUMB_FOCUS_Y_PERCENT).toFixed(1)}%`);
}

function scheduleTilt(event) {
    if (!activeTiltCard) return;
    tiltPointerX = event.clientX;
    tiltPointerY = event.clientY;
    if (!tiltRect) {
        tiltRect = activeTiltCard.getBoundingClientRect();
    }
    if (!tiltFrameId) {
        tiltFrameId = window.requestAnimationFrame(applyTilt);
    }
}

function resetActiveTilt() {
    if (tiltFrameId) {
        window.cancelAnimationFrame(tiltFrameId);
        tiltFrameId = 0;
    }
    if (activeTiltCard) clearTiltStyles(activeTiltCard);
    activeTiltCard = null;
    tiltRect = null;
}

function startTilt(card, event) {
    if (activeTiltCard !== card) {
        resetActiveTilt();
        activeTiltCard = card;
        tiltRect = card.getBoundingClientRect();
        card.classList.add('is-tilting');
    }
    scheduleTilt(event);
}

function ensureCardTiltDelegation() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (tiltDelegationBound) return;

    document.addEventListener('pointerover', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        const card = event.target?.closest?.('.room-card');
        if (!card || activeTiltCard === card) return;
        if (isInsideCard(card, event.relatedTarget)) return;
        if (!canUseCardTilt()) return;
        if (isCardTiltDisabled(card)) return;

        startTilt(card, event);
    }, { passive: true });

    document.addEventListener('pointermove', (event) => {
        if (!activeTiltCard) return;
        if (!activeTiltCard.isConnected || isCardTiltDisabled(activeTiltCard) || !canUseCardTilt()) {
            resetActiveTilt();
            return;
        }
        scheduleTilt(event);
    }, { passive: true });

    document.addEventListener('pointerout', (event) => {
        if (!activeTiltCard) return;
        const card = event.target?.closest?.('.room-card');
        if (card !== activeTiltCard) return;
        if (isInsideCard(activeTiltCard, event.relatedTarget)) return;
        resetActiveTilt();
    }, { passive: true });

    document.addEventListener('pointercancel', resetActiveTilt, { passive: true });
    window.addEventListener('blur', resetActiveTilt);
    tiltDelegationBound = true;
}

function configureImageLoading(refs) {
    [refs.thumb, refs.avatar].forEach(img => {
        if (!img) return;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
    });

    if (refs.avatar && 'fetchPriority' in refs.avatar) {
        refs.avatar.fetchPriority = 'low';
    }
}

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
        picarto: `https://picarto.tv/${roomInfo.id}`,
        soop: `https://play.sooplive.co.kr/${roomInfo.id}`,
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
        platformChip: card.querySelector('.platform-chip'),
        chip: card.querySelector('.status-chip'),
        chipText: card.querySelector('.status-text'),
        titleEl: card.querySelector('.room-title'),
        ownerEl: card.querySelector('.room-owner'),
        roomIdEl: card.querySelector('.room-id-chip'),
        viewerPill: card.querySelector('.viewer-pill'),
        viewerIcon: card.querySelector('.viewer-icon'),
        viewerNum: card.querySelector('.viewer-num'),
        avatar: card.querySelector('.u-avatar'),
        favBtn: favBtn,
        loader: card.querySelector('.thumb-loader'),
        durationEl: card.querySelector('.live-duration')
    };

    configureImageLoading(card._domRefs);
    updateCard(card, roomInfo, data, cardState);
    ensureCardTiltDelegation();
    return card;
}

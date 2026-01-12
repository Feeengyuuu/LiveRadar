/**
 * ====================================================================
 * Card Renderer - Update Existing Room Cards
 * ====================================================================
 *
 * Handles incremental updates to existing room cards with:
 * - Smart DOM diffing (only update changed content)
 * - State management (live/offline/loop/loading/error/retrying)
 * - Favorite status synchronization
 * - Duration display formatting
 *
 * @module core/renderer/card-renderer
 */

import { setImageSource, getSmartImageUrl } from './image-handler.js';

// ====================================================================
// Helper Functions
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
// Card Update Function
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

    // 🔥 Performance: Use toggle instead of remove+add to reduce classList operations
    card.classList.toggle('is-live-card', cardState === 'live');
    card.classList.toggle('is-offline-card', cardState === 'offline' || cardState === 'error');
    card.classList.toggle('is-loop-card', cardState === 'loop');
    card.classList.toggle('is-error-card', cardState === 'error');

    let newThumbSrc = '';
    const newAvatarSrc = data.avatar || '';

    // Get display title using unified helper (eliminates code duplication)
    const displayTitle = getDisplayTitle(data, roomInfo, cardState);
    const ownerText = `${data.owner || roomInfo.id} - ${roomInfo.id}`;

    switch (cardState) {
        case 'live':
            chip.className = 'status-chip chip-live';
            if (chipText.textContent !== '直播中') chipText.textContent = '直播中';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== data.viewers) viewerNum.textContent = data.viewers;

            // 🔥 Performance: Smart image caching strategy
            // Add timestamp for live thumbnails to refresh periodically
            newThumbSrc = getSmartImageUrl(data.cover, roomInfo.platform, true);

            const duration = data.startTime ? formatDuration(data.startTime) : null;
            if (duration) {
                durationEl.textContent = `⏱ ${duration}`;
                durationEl.classList.toggle('hidden', false);
            } else {
                durationEl.classList.toggle('hidden', true);
            }
            break;

        case 'loop':
            chip.className = 'status-chip chip-loop';
            if (chipText.textContent !== '轮播') chipText.textContent = '轮播';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== '轮播中') viewerNum.textContent = '轮播中';
            newThumbSrc = data.cover;
            durationEl.classList.toggle('hidden', true);
            break;

        case 'offline':
            chip.className = 'status-chip chip-off';
            if (chipText.textContent !== '离线') chipText.textContent = '离线';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== '离线') viewerNum.textContent = '离线';
            newThumbSrc = data.avatar || data.cover;
            durationEl.classList.toggle('hidden', true);
            break;

        case 'error':
            chip.className = 'status-chip chip-error';
            if (chipText.textContent !== '连接失败') chipText.textContent = '连接失败';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== data.viewers) viewerNum.textContent = data.viewers;
            newThumbSrc = data.avatar || data.cover;
            durationEl.classList.toggle('hidden', true);
            break;

        case 'retrying':
            chip.className = 'status-chip chip-loading';
            const retryText = `重试中${data._retryCount ? ` (${data._retryCount}/2)` : ''}`;
            if (chipText.textContent !== retryText) chipText.textContent = retryText;
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== ownerText) ownerEl.textContent = ownerText;
            if (viewerNum.textContent !== '请稍候') viewerNum.textContent = '请稍候';
            durationEl.classList.toggle('hidden', true);
            break;

        case 'loading':
        default:
            chip.className = 'status-chip chip-off';
            if (chipText.textContent !== '加载中') chipText.textContent = '加载中';
            if (titleEl.textContent !== displayTitle) titleEl.textContent = displayTitle;
            if (ownerEl.textContent !== '---') ownerEl.textContent = '---';
            if (viewerNum.textContent !== '--') viewerNum.textContent = '--';
            durationEl.classList.toggle('hidden', true);
            break;
    }

    const forceTwitchThumbTransition = cardState === 'live' && roomInfo.platform === 'twitch';

    // Update thumbnail and avatar using unified image loading function
    setImageSource({
        imgElement: thumb,
        newSrc: newThumbSrc,
        loaderElement: loader,
        loadedClass: 'loaded',
        fallbacks: {
            hd: data._coverFallbackHD,
            standard: data._coverFallback
        },
        forceTransition: forceTwitchThumbTransition
    });

    const avatarSkeleton = avt.nextElementSibling;
    setImageSource({
        imgElement: avt,
        newSrc: newAvatarSrc,
        skeletonElement: avatarSkeleton,
        hideOnError: true
    });
}

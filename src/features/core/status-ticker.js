/**
 * Status Ticker Module
 * Displays live status change announcements (streamer went online/offline)
 */

import { getState } from '../../core/state.js';
import { getElement } from '../../utils/dom-cache.js';
import { getRoomCacheKey } from '../../utils/helpers.js';

// State
let previousLiveStatus = null; // Store previous online status (state-backed)
let statusChangeQueue = []; // Status change message queue
let currentTickerIndex = 0; // Current displayed message index
let tickerTimer = null; // Scroll timer
let currentTickerItem = null; // Reusable ticker item element (performance optimization)
let hideTimer = null; // Hide delay timer

function getTickerEl() {
    return getElement('status-ticker');
}

function getPreviousLiveStatusRef() {
    if (!previousLiveStatus) {
        previousLiveStatus = getState().previousLiveStatus || {};
    }
    return previousLiveStatus;
}

/**
 * Detect status changes across all rooms
 * @param {Array} rooms - Array of room objects
 * @param {Object} roomDataCache - Cache of room data
 */
export function detectStatusChanges(rooms, roomDataCache) {
    const changes = [];
    const statusSnapshot = getPreviousLiveStatusRef();

    // Iterate through all rooms, detect status changes
    rooms.forEach(room => {
        const key = getRoomCacheKey(room.platform, room.id);
        const currentData = roomDataCache[key];

        if (!currentData || currentData.loading || currentData.isError) return;

        const wasLive = statusSnapshot[key] === true;
        const isLive = currentData.isLive === true;

        // Detect went online
        if (!wasLive && isLive) {
            changes.push({
                type: 'online',
                name: currentData.owner || room.id,
                platform: room.platform
            });
        }

        // Detect went offline
        if (wasLive && !isLive) {
            changes.push({
                type: 'offline',
                name: currentData.owner || room.id,
                platform: room.platform
            });
        }

        // Update status snapshot
        statusSnapshot[key] = isLive;
    });

    // If there are changes, add to queue and start scrolling
    if (changes.length > 0) {
        statusChangeQueue = changes;
        currentTickerIndex = 0;
        startStatusTicker();
    }
}

/**
 * Start status ticker animation
 */
export function startStatusTicker() {
    // Clear previous timer
    if (tickerTimer) {
        clearInterval(tickerTimer);
    }
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    const ticker = getTickerEl();
    if (!ticker || statusChangeQueue.length === 0) return;

    // Show ticker container
    ticker.style.display = 'flex';

    // Display first message
    showTickerMessage(currentTickerIndex);

    // If only one message, hide after 2 seconds
    if (statusChangeQueue.length === 1) {
        hideTimer = setTimeout(() => {
            ticker.style.display = 'none';
            hideTimer = null;
        }, 2000);
        return;
    }

    // Switch to next message every 2 seconds (no loop)
    tickerTimer = setInterval(() => {
        currentTickerIndex++;

        // If reached last message, hide after displaying and stop
        if (currentTickerIndex >= statusChangeQueue.length) {
            clearInterval(tickerTimer);
            tickerTimer = null;
            hideTimer = setTimeout(() => {
                ticker.style.display = 'none';
                hideTimer = null;
            }, 2000);
            return;
        }

        showTickerMessage(currentTickerIndex);
    }, 2000);
}

/**
 * Stop status ticker
 */
export function stopStatusTicker() {
    if (tickerTimer) {
        clearInterval(tickerTimer);
        tickerTimer = null;
    }
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    const ticker = getTickerEl();
    if (ticker) {
        ticker.style.display = 'none';
    }
}

/**
 * Show a specific ticker message
 * 🔥 Performance: Reuses single DOM element instead of removing/creating
 * Reduces DOM thrashing from N reflows to 1 class update
 * @param {number} index - Message index in queue
 */
function showTickerMessage(index) {
    const ticker = getTickerEl();
    if (!ticker) return;

    const message = statusChangeQueue[index];
    if (!message) return;

    // Create or reuse ticker item element
    if (!currentTickerItem) {
        // First time: create the reusable element structure
        currentTickerItem = document.createElement('div');
        currentTickerItem.className = 'status-ticker-item';

        const icon = document.createElement('div');
        icon.className = 'ticker-icon';

        const text = document.createElement('span');
        text.className = 'ticker-text';

        const name = document.createElement('span');
        name.className = 'ticker-name';

        const action = document.createElement('span');
        action.className = 'ticker-action';

        text.appendChild(name);
        text.appendChild(action);
        currentTickerItem.appendChild(icon);
        currentTickerItem.appendChild(text);
        ticker.appendChild(currentTickerItem);
    }

    // Get references to inner elements
    const icon = currentTickerItem.querySelector('.ticker-icon');
    const name = currentTickerItem.querySelector('.ticker-name');
    const action = currentTickerItem.querySelector('.ticker-action');

    // Trigger exit animation
    currentTickerItem.classList.remove('active');

    // Update content after brief delay for smooth transition
    setTimeout(() => {
        // Update icon
        icon.className = `ticker-icon ${message.type}`;
        icon.textContent = message.type === 'online' ? '●' : '○';

        // Update text
        name.textContent = message.name;
        action.textContent = message.type === 'online' ? ' 开播了' : ' 下播了';

        // Trigger enter animation
        setTimeout(() => currentTickerItem.classList.add('active'), 10);
    }, 100);
}

/**
 * Update ticker with current status changes
 * Called after each refresh
 * @param {Array} rooms - Array of room objects
 * @param {Object} roomDataCache - Cache of room data
 */
export function updateTicker(rooms, roomDataCache) {
    detectStatusChanges(rooms, roomDataCache);
}

/**
 * Initialize status ticker
 */
export function initStatusTicker() {
    // Reset state
    previousLiveStatus = getState().previousLiveStatus || {};
    statusChangeQueue = [];
    currentTickerIndex = 0;
    tickerTimer = null;
    hideTimer = null;

    console.log('[Status Ticker] Initialized');
}

/**
 * Clear status ticker state
 */
export function clearTickerState() {
    const statusSnapshot = getPreviousLiveStatusRef();
    Object.keys(statusSnapshot).forEach(key => delete statusSnapshot[key]);
    statusChangeQueue = [];
    currentTickerIndex = 0;

    if (tickerTimer) {
        clearInterval(tickerTimer);
        tickerTimer = null;
    }
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    const ticker = getTickerEl();
    if (ticker) {
        ticker.style.display = 'none';
        ticker.innerHTML = '';
    }
}

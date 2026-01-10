/**
 * Status Ticker Module
 * Displays live status change announcements (streamer went online/offline)
 */

import { getState } from '../core/state.js';
import { getDOMCache } from '../utils/dom-cache.js';

// State
let previousLiveStatus = null; // Store previous online status (state-backed)
let statusChangeQueue = []; // Status change message queue
let currentTickerIndex = 0; // Current displayed message index
let tickerTimer = null; // Scroll timer

function getTickerEl() {
    const cache = getDOMCache();
    return cache.statusTicker || document.getElementById('status-ticker');
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
        const key = `${room.platform}-${room.id}`;
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

    const ticker = getTickerEl();
    if (!ticker || statusChangeQueue.length === 0) return;

    // Show ticker container
    ticker.style.display = 'flex';

    // Display first message
    showTickerMessage(currentTickerIndex);

    // If only one message, hide after 2 seconds
    if (statusChangeQueue.length === 1) {
        setTimeout(() => {
            ticker.style.display = 'none';
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
            setTimeout(() => {
                ticker.style.display = 'none';
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

    const ticker = getTickerEl();
    if (ticker) {
        ticker.style.display = 'none';
    }
}

/**
 * Show a specific ticker message
 * @param {number} index - Message index in queue
 */
function showTickerMessage(index) {
    const ticker = getTickerEl();
    if (!ticker) return;

    const message = statusChangeQueue[index];
    if (!message) return;

    // Remove old messages (with exit animation)
    const oldItems = ticker.querySelectorAll('.status-ticker-item');
    oldItems.forEach(item => {
        item.classList.remove('active');
        item.classList.add('exit');
        setTimeout(() => item.remove(), 300);
    });

    // Create new message
    const item = document.createElement('div');
    item.className = 'status-ticker-item';

    const icon = document.createElement('div');
    icon.className = `ticker-icon ${message.type}`;
    icon.textContent = message.type === 'online' ? '●' : '○';

    const text = document.createElement('span');
    text.className = 'ticker-text';

    const name = document.createElement('span');
    name.className = 'ticker-name';
    name.textContent = message.name;

    const action = document.createElement('span');
    action.textContent = message.type === 'online' ? ' 开播了' : ' 下播了';

    text.appendChild(name);
    text.appendChild(action);

    item.appendChild(icon);
    item.appendChild(text);
    ticker.appendChild(item);

    // Trigger enter animation
    setTimeout(() => item.classList.add('active'), 10);
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

    const ticker = getTickerEl();
    if (ticker) {
        ticker.style.display = 'none';
        ticker.innerHTML = '';
    }
}

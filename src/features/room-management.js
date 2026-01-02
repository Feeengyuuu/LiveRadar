/**
 * Room Management Module
 * Add/remove rooms, platform selector, search history
 */

import { SafeStorage } from '../utils/safe-storage.js';
import { getRooms, addRoom as addRoomToState, removeRoom as removeRoomFromState } from '../core/state.js';

// State
let searchHistory = SafeStorage.getJSON('pro_search_history', []);
let historyEventsBound = false;
let historyPositionBound = false;
const HISTORY_DROPDOWN_RIGHT_GAP = 8;

// Device detection
const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Toggle platform selector dropdown
 * @param {Event} e - Click event
 */
export function toggleDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('selector-menu');
    if (!menu) return;

    if (menu.classList.contains('dropdown-enter')) {
        menu.classList.remove('dropdown-enter');
        menu.classList.add('dropdown-enter-active');
    } else {
        closeDropdown();
    }
}

/**
 * Close platform selector dropdown
 */
export function closeDropdown() {
    const menu = document.getElementById('selector-menu');
    if (!menu) return;

    if (!menu.classList.contains('dropdown-enter')) {
        menu.classList.remove('dropdown-enter-active');
        menu.classList.add('dropdown-enter');
    }
}

/**
 * Select a platform from dropdown
 * @param {string} value - Platform value (twitch/douyu/bilibili)
 * @param {string} color - Platform color
 * @param {string} label - Platform display label
 */
export function selectPlatform(value, color, label) {
    const select = document.getElementById('platform-select');
    const labelEl = document.getElementById('current-platform-label');
    const indicator = document.getElementById('selected-indicator');

    if (select) select.value = value;
    if (labelEl) {
        labelEl.textContent = label;
        labelEl.style.color = color;
    }
    if (indicator) {
        indicator.style.backgroundColor = color;
        indicator.style.boxShadow = `0 0 8px ${color}`;
    }

    updatePlaceholder();
    closeDropdown();
}

/**
 * Update input placeholder based on selected platform
 */
export function updatePlaceholder() {
    const platformSelect = document.getElementById('platform-select');
    const input = document.getElementById('room-id-input');
    if (!platformSelect || !input) return;

    const platform = platformSelect.value;
    const placeholders = {
        twitch: "输入 ID (如 xqc)...",
        douyu: "输入房间号...",
        bilibili: "输入房间号...",
        kick: "输入 ID (如 xqc)..."
    };
    input.placeholder = placeholders[platform] || "输入 ID...";
}

/**
 * Show search history dropdown
 */
export function showHistory() {
    // 在移动端禁用历史记录功能
    if (isMobile()) return;

    const input = document.getElementById('room-id-input');
    renderHistory(input ? input.value : '');
    const menu = document.getElementById('history-dropdown');
    if (!menu) return;

    menu.classList.remove('dropdown-enter');
    menu.classList.add('dropdown-enter-active');
}

/**
 * Hide search history dropdown
 * @param {Event} e - Click event
 */
export function hideHistory(e) {
    if (e && (e.target.closest('#custom-selector-container') || e.target.id === 'room-id-input')) {
        return;
    }

    const menu = document.getElementById('history-dropdown');
    if (!menu) return;

    if (!menu.classList.contains('dropdown-enter')) {
        menu.classList.remove('dropdown-enter-active');
        menu.classList.add('dropdown-enter');
    }
}

/**
 * Handle input change in room ID field
 * @param {Event} e - Input event
 */
export function handleInput(e) {
    // 在移动端禁用历史记录功能
    if (isMobile()) return;

    const value = e && e.target ? e.target.value : '';
    renderHistory(value);

    const menu = document.getElementById('history-dropdown');
    if (!menu) return;

    if (menu.classList.contains('dropdown-enter')) {
        menu.classList.remove('dropdown-enter');
        menu.classList.add('dropdown-enter-active');
    }
}

/**
 * Handle add room button click
 */
export function handleAddInput() {
    const input = document.getElementById('room-id-input');
    const platformSelect = document.getElementById('platform-select');
    if (!input || !platformSelect) return;

    const value = input.value.trim();
    const platform = platformSelect.value;

    if (!value) return;
    saveSearchHistory(value);
    window.addRoom?.(value, platform);
    input.value = '';
    input.focus();
    showHistory();
}

/**
 * Add a room to monitored list
 * @param {string} id - Room ID
 * @param {string} platform - Platform (twitch/douyu/bilibili)
 */
window.addRoom = async function(id, platform) {
    if (!id) return;

    const rooms = getRooms();
    const roomId = id.toString();

    if (rooms.some(r => r.id === roomId && r.platform === platform)) {
        window.showToast?.('已存在', 'error');
        return;
    }

    const newRoom = { id: roomId, platform: platform, isFav: false };
    addRoomToState(newRoom);
    window.renderAll?.();

    await window.fetchStatus?.(newRoom, 0);
    window.renderAll?.();
};

/**
 * Remove a room from monitored list
 * @param {string} id - Room ID
 * @param {string} platform - Platform
 */
export function removeRoom(id, platform) {
    // Remove from state
    removeRoomFromState(id, platform);

    // Remove from cache
    const roomDataCache = window.roomDataCache || {};
    delete roomDataCache[`${platform}-${id}`];
    SafeStorage.setJSON('pro_room_cache', roomDataCache);

    window.renderAll?.();
}

/**
 * Toggle favorite status for a room
 * @param {string} id - Room ID
 * @param {string} platform - Platform
 */
export function toggleFavorite(id, platform) {
    const rooms = getRooms();
    const room = rooms.find(r => r.id === id && r.platform === platform);
    if (!room) return;

    room.isFav = !room.isFav;
    SafeStorage.setJSON('pro_monitored_rooms', rooms);
    window.renderAll?.();
}

/**
 * Apply history item to input
 * @param {string} value - History value to apply
 */
export function applyHistory(value) {
    const input = document.getElementById('room-id-input');
    if (!input) return;

    input.value = value;
    handleAddInput();
}

/**
 * Delete history item
 * @param {Event} e - Click event
 * @param {string} value - History value to delete
 */
export function deleteHistory(e, value) {
    e.stopPropagation();
    searchHistory = searchHistory.filter(item => item !== value);
    SafeStorage.setJSON('pro_search_history', searchHistory);
    renderHistory();

    const input = document.getElementById('room-id-input');
    if (input) input.focus();
}

/**
 * Save value to search history
 * @param {string} value - Value to save
 */
export function saveSearchHistory(value) {
    if (!value) return;

    searchHistory = searchHistory.filter(item => item !== value);
    searchHistory.unshift(value);
    if (searchHistory.length > 5) {
        searchHistory = searchHistory.slice(0, 5);
    }
    SafeStorage.setJSON('pro_search_history', searchHistory);
}

/**
 * Bind event listeners to history dropdown
 */
function bindHistoryEvents() {
    if (historyEventsBound) return;

    const historyEl = document.getElementById('history-dropdown');
    if (!historyEl) return;

    historyEl.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.history-delete');
        if (deleteBtn && deleteBtn.dataset.value != null) {
            deleteHistory(e, deleteBtn.dataset.value);
            return;
        }

        const item = e.target.closest('.history-item');
        if (item && item.dataset.value != null) {
            applyHistory(item.dataset.value);
        }
    });

    historyEventsBound = true;
}

function updateHistoryDropdownPosition() {
    const historyEl = document.getElementById('history-dropdown');
    if (!historyEl) return;

    const container = historyEl.offsetParent;
    if (!container) return;

    const input = document.getElementById('room-id-input');
    if (!input) return;

    // 找到添加按钮
    let addButton = historyEl.nextElementSibling;
    if (!addButton || addButton.tagName !== 'BUTTON') {
        addButton = historyEl.parentElement?.querySelector('button[onclick*="handleAddInput"]');
    }
    if (!addButton) return;

    const containerRect = container.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const buttonRect = addButton.getBoundingClientRect();

    // 计算输入框左边缘相对于容器的偏移
    const leftOffset = Math.max(0, Math.round(inputRect.left - containerRect.left));

    // 计算添加按钮左边缘相对于容器的偏移（留一点间距）
    const rightOffset = Math.max(
        0,
        Math.round(containerRect.right - buttonRect.left + HISTORY_DROPDOWN_RIGHT_GAP)
    );

    historyEl.style.left = `${leftOffset}px`;
    historyEl.style.right = `${rightOffset}px`;
}

function bindHistoryPosition() {
    if (historyPositionBound) return;
    window.addEventListener('resize', updateHistoryDropdownPosition);
    historyPositionBound = true;
}

/**
 * Render search history dropdown
 * @param {string} query - Search query to filter history
 */
export function renderHistory(query = '') {
    // 在移动端禁用历史记录功能
    if (isMobile()) return;

    const historyEl = document.getElementById('history-dropdown');
    if (!historyEl) return;

    bindHistoryEvents();
    bindHistoryPosition();
    updateHistoryDropdownPosition();
    historyEl.textContent = '';

    const q = query.trim().toLowerCase();
    const items = q ? searchHistory.filter(item => item.toLowerCase().includes(q)) : searchHistory.slice();

    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'p-3 text-xs text-gray-600 text-center';
        empty.textContent = q ? '无匹配历史' : '暂无历史记录';
        historyEl.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();

    const appendHighlighted = (node, text, needle) => {
        if (!needle) {
            node.textContent = text;
            return;
        }

        const lower = text.toLowerCase();
        let start = 0;

        while (start < text.length) {
            const idx = lower.indexOf(needle, start);
            if (idx === -1) {
                node.appendChild(document.createTextNode(text.slice(start)));
                break;
            }

            if (idx > start) {
                node.appendChild(document.createTextNode(text.slice(start, idx)));
            }

            const strong = document.createElement('strong');
            strong.textContent = text.slice(idx, idx + needle.length);
            node.appendChild(strong);
            start = idx + needle.length;
        }
    };

    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'history-item';
        row.dataset.value = item;

        const label = document.createElement('span');
        appendHighlighted(label, item, q);

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'history-delete';
        deleteBtn.dataset.value = item;
        deleteBtn.textContent = '✕';

        row.appendChild(label);
        row.appendChild(deleteBtn);
        fragment.appendChild(row);
    });

    historyEl.appendChild(fragment);
}

// Make functions available globally for onclick handlers
window.handleInput = handleInput;
window.handleAddInput = handleAddInput;
window.showHistory = showHistory;
window.hideHistory = hideHistory;
window.applyHistory = applyHistory;
window.deleteHistory = deleteHistory;
window.removeRoom = removeRoom;
window.selectPlatform = selectPlatform;
window.toggleDropdown = toggleDropdown;
window.closeDropdown = closeDropdown;
window.saveSearchHistory = saveSearchHistory;
window.renderHistory = renderHistory;
window.toggleFavorite = toggleFavorite;

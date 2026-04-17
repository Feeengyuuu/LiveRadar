/**
 * Import/Export Module
 * JSON-based room list import and export functionality
 */

import { getRooms, getRoomDataCache, updateRooms, updateRoomDataCache } from '../../core/state.js';
import { getRoomCacheKey, normalizeRoomId, showToast } from '../../utils/helpers.js';
import { emit, Events } from '../../core/event-bus.js';

/**
 * Export rooms to JSON file
 * @param {Array} rooms - Array of room objects to export
 */
export function exportRooms(rooms) {
    try {
        // Prepare export data (minimal necessary information)
        const exportData = {
            version: "3.1.1",
            timestamp: Date.now(),
            rooms: rooms.map(room => ({
                id: room.id,
                platform: room.platform,
                isFav: room.isFav || false
            }))
        };

        // Convert to JSON string
        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Filename: LiveRadar_Backup_YYYYMMDD_HHMM.json
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        a.download = `LiveRadar_Backup_${dateStr}.json`;

        // Trigger download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`✅ 已导出 ${exportData.rooms.length} 个主播`, 'success');
        console.log('[导出] 成功导出主播列表:', exportData);
    } catch (error) {
        console.error('[导出] 导出失败:', error);
        showToast('导出失败，请重试', 'error');
    }
}

/**
 * Import rooms from JSON file
 * @param {Event} event - File input change event
 */
export function importRooms(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // Parse JSON
            const importData = JSON.parse(e.target.result);

            // Validate data format
            if (!importData.rooms || !Array.isArray(importData.rooms)) {
                throw new Error('无效的文件格式');
            }

            // Normalize and validate each room data
            const normalizedRooms = importData.rooms
                .map(room => {
                    const platform = typeof room.platform === 'string' ? room.platform.toLowerCase() : '';
                    const id = normalizeRoomId(platform, room.id);
                    return {
                        id,
                        platform,
                        isFav: !!room.isFav
                    };
                })
                .filter(room => room.id && ['douyu', 'bilibili', 'twitch', 'kick'].includes(room.platform));

            const uniqueRooms = [];
            const seen = new Map();
            normalizedRooms.forEach(room => {
                const key = getRoomCacheKey(room.platform, room.id);
                const existing = seen.get(key);
                if (existing) {
                    if (room.isFav && !existing.isFav) existing.isFav = true;
                    return;
                }
                seen.set(key, room);
                uniqueRooms.push(room);
            });

            if (uniqueRooms.length === 0) {
                throw new Error('文件中没有有效的主播数据');
            }

            // Show import options dialog
            showImportDialog(uniqueRooms, importData.version);

        } catch (error) {
            console.error('[导入] 解析失败:', error);
            showToast('文件格式错误，请选择有效的备份文件', 'error');
        }

        // Reset file input to allow selecting the same file again
        event.target.value = '';
    };

    reader.onerror = function() {
        showToast('文件读取失败', 'error');
        event.target.value = '';
    };

    reader.readAsText(file);
}

/**
 * Show import options dialog
 * @param {Array} importRooms - Rooms to import
 * @param {string} version - Version from import file
 */
function showImportDialog(importRooms, version) {
    const rooms = getRooms();

    // Create dialog HTML
    const dialogHTML = `
        <div id="import-dialog" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center;">
            <div style="background: #1a1a1a; border-radius: 16px; padding: 32px; max-width: 480px; width: 90%; border: 1px solid #333;">
                <h3 style="color: #fff; font-size: 20px; font-weight: bold; margin: 0 0 16px 0;">导入主播列表</h3>
                <p style="color: #9ca3af; margin: 0 0 24px 0;">
                    检测到 <strong style="color: #60a5fa;">${importRooms.length}</strong> 个主播<br>
                    当前列表有 <strong style="color: #60a5fa;">${rooms.length}</strong> 个主播
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button onclick="window.doImport('replace', ${JSON.stringify(importRooms).replace(/"/g, '&quot;')})"
                            style="padding: 12px 20px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        🔄 替换当前列表
                    </button>
                    <button onclick="window.doImport('merge', ${JSON.stringify(importRooms).replace(/"/g, '&quot;')})"
                            style="padding: 12px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        ➕ 合并到当前列表（去重）
                    </button>
                    <button onclick="window.closeImportDialog()"
                            style="padding: 12px 20px; background: rgba(255,255,255,0.1); color: #9ca3af; border: 1px solid #333; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        取消
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add to page
    const dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = dialogHTML;
    document.body.appendChild(dialogContainer.firstElementChild);
}

/**
 * Execute import with specified mode
 * @param {string} mode - 'replace' or 'merge'
 * @param {Array} importRooms - Rooms to import
 */
window.doImport = function(mode, importRooms) {
    try {
        const rooms = getRooms();
        let newRooms = [];
        let message = '';

        if (mode === 'replace') {
            // Replace mode: directly use imported list
            newRooms = importRooms;
            message = `正在加载 ${newRooms.length} 个主播...`;
            showToast(message, 'info');
        } else if (mode === 'merge') {
            // Merge mode: merge after deduplication
            const existingKeys = new Set(rooms.map(r => getRoomCacheKey(r.platform, r.id)));
            const toAdd = importRooms.filter(r => !existingKeys.has(getRoomCacheKey(r.platform, r.id)));
            newRooms = [...rooms, ...toAdd];

            if (toAdd.length === 0) {
                showToast('所有主播都已存在，无需添加', 'info');
                closeImportDialog();
                return;
            }

            message = `正在添加 ${toAdd.length} 个新主播...`;
            showToast(message, 'info');
        }

        // Update rooms in place to keep references stable
        updateRooms(newRooms, true);

        // Clear cache (force re-fetch)
        const roomDataCache = getRoomDataCache();
        Object.keys(roomDataCache).forEach(key => delete roomDataCache[key]);
        updateRoomDataCache(roomDataCache, true);

        // Close dialog
        closeImportDialog();

        // Refresh UI (顺序加载，避免导入时同时验证触发平台风控)
        console.log(`[导入] 开始顺序刷新 ${newRooms.length} 个主播（并发：1）`);
        emit(Events.REFRESH_REQUEST, true, false, { sequential: true, preserveOrder: true, disableJitter: true });

        console.log('[导入] 成功导入，新列表长度:', newRooms.length);
    } catch (error) {
        console.error('[导入] 导入失败:', error);
        showToast('导入失败，请重试', 'error');
    }
};

/**
 * Close import dialog
 */
window.closeImportDialog = function() {
    const dialog = document.getElementById('import-dialog');
    if (dialog) {
        dialog.remove();
    }
};

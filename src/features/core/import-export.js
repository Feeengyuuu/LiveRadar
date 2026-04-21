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
            showImportDialog(uniqueRooms);

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
 * Build an import-dialog button via DOM APIs (no innerHTML with untrusted data).
 * @param {string} label
 * @param {string} background
 * @param {() => void} onClick
 */
function buildDialogButton(label, background, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = `padding: 12px 20px; background: ${background}; color: ${background.includes('rgba') ? '#9ca3af' : 'white'}; border: ${background.includes('rgba') ? '1px solid #333' : 'none'}; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s;`;
    btn.addEventListener('click', onClick);
    return btn;
}

/**
 * Show import options dialog
 * @param {Array} importRooms - Rooms to import
 */
function showImportDialog(importRooms) {
    const rooms = getRooms();

    const overlay = document.createElement('div');
    overlay.id = 'import-dialog';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center;';

    const panel = document.createElement('div');
    panel.style.cssText = 'background: #1a1a1a; border-radius: 16px; padding: 32px; max-width: 480px; width: 90%; border: 1px solid #333;';

    const heading = document.createElement('h3');
    heading.textContent = '导入主播列表';
    heading.style.cssText = 'color: #fff; font-size: 20px; font-weight: bold; margin: 0 0 16px 0;';

    const summary = document.createElement('p');
    summary.style.cssText = 'color: #9ca3af; margin: 0 0 24px 0;';
    const detectedStrong = document.createElement('strong');
    detectedStrong.textContent = String(importRooms.length);
    detectedStrong.style.color = '#60a5fa';
    const currentStrong = document.createElement('strong');
    currentStrong.textContent = String(rooms.length);
    currentStrong.style.color = '#60a5fa';
    summary.append('检测到 ', detectedStrong, ' 个主播');
    summary.appendChild(document.createElement('br'));
    summary.append('当前列表有 ', currentStrong, ' 个主播');

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    btnGroup.appendChild(buildDialogButton(
        '🔄 替换当前列表',
        'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        () => doImport('replace', importRooms)
    ));
    btnGroup.appendChild(buildDialogButton(
        '➕ 合并到当前列表（去重）',
        'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        () => doImport('merge', importRooms)
    ));
    btnGroup.appendChild(buildDialogButton(
        '取消',
        'rgba(255,255,255,0.1)',
        closeImportDialog
    ));

    panel.append(heading, summary, btnGroup);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

/**
 * Execute import with specified mode
 * @param {string} mode - 'replace' or 'merge'
 * @param {Array} importRooms - Rooms to import
 */
function doImport(mode, importRooms) {
    try {
        const rooms = getRooms();
        let newRooms = [];
        let message = '';

        if (mode === 'replace') {
            newRooms = importRooms;
            message = `正在加载 ${newRooms.length} 个主播...`;
            showToast(message, 'info');
        } else if (mode === 'merge') {
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

        updateRooms(newRooms, true);

        const roomDataCache = getRoomDataCache();
        Object.keys(roomDataCache).forEach(key => delete roomDataCache[key]);
        updateRoomDataCache(roomDataCache, true);

        closeImportDialog();

        console.log(`[导入] 开始顺序刷新 ${newRooms.length} 个主播（并发：1）`);
        emit(Events.REFRESH_REQUEST, true, false, { sequential: true, preserveOrder: true, disableJitter: true });

        console.log('[导入] 成功导入，新列表长度:', newRooms.length);
    } catch (error) {
        console.error('[导入] 导入失败:', error);
        showToast('导入失败，请重试', 'error');
    }
}

/**
 * Close import dialog
 */
function closeImportDialog() {
    const dialog = document.getElementById('import-dialog');
    if (dialog) {
        dialog.remove();
    }
}

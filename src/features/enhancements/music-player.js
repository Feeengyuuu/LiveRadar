/**
 * ====================================================================
 * 音乐播放器 - 悬浮小工具
 * ====================================================================
 *
 * Features:
 * - 自动解析音频元数据（标题、艺术家）
 * - 可拖动进度条
 * - 音量控制
 * - 最小化/展开状态
 * - 本地存储音量和播放状态
 * - 自动循环播放
 *
 * @module features/music-player
 */

import SafeStorage from '../../utils/safe-storage.js';
import '../../styles/components/music-player.css';

// ====================================================================
// 配置
// ====================================================================

function assetUrl(path) {
    return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

const PLAYLIST = [
    {
        title: "Travelers' Encore",
        artist: "Andrew Prahlow",
        path: assetUrl('music/Andrew Prahlow - Outer Wilds- Echoes of the Eye (The Lost Reels) -Deluxe Original Game Soundtrack- - 21 Travelers\' encore.mp3'),
        cover: assetUrl('covers/cover_travelers_encore.png')
    },
    {
        title: "Outer Wilds",
        artist: "Andrew Prahlow",
        path: assetUrl('music/Outer Wilds.mp3'),
        cover: assetUrl('covers/cover_outer_wilds.jpg')
    }
];

const CONFIG = {
    DEFAULT_VOLUME: 0.7,
    SAVE_VOLUME_KEY: 'music_player_volume',
    SAVE_MINIMIZED_KEY: 'music_player_minimized',
    SAVE_CURRENT_TRACK_KEY: 'music_player_current_track',
};

// ====================================================================
// 状态管理
// ====================================================================

let audio = null;
let isPlaying = false;
let isDraggingProgress = false;
let isDraggingVolume = false;
let isMinimized = SafeStorage.getItem(CONFIG.SAVE_MINIMIZED_KEY, 'true') === 'true';
let currentTrackIndex = parseInt(SafeStorage.getItem(CONFIG.SAVE_CURRENT_TRACK_KEY, '0'), 10);
let hasEverPlayed = false; // 标记是否曾经播放过，用于控制封面显示
let isAnimating = false;
let dragListenersBound = false;
let isInitialized = false;
let completionTimer = null;

const ANIMATION_DURATION_MS = 420;
const TRACK_COMPLETE_HOLD_MS = 120;
const PLAYER_INTERACTIVE_SELECTOR = [
    'button',
    'a',
    'input',
    '[role="button"]',
    '.progress-bar',
    '.volume-slider',
    '.playlist-item',
    '.playlist-items',
].join(',');

// ====================================================================
// DOM元素引用
// ====================================================================

const elements = {
    player: null,
    header: null,
    playBtn: null,
    prevBtn: null,
    nextBtn: null,
    progressBar: null,
    progressFill: null,
    currentTime: null,
    totalTime: null,
    volumeSlider: null,
    volumeFill: null,
    toggleBtn: null,
    title: null,
    artist: null,
    cover: null,
    progressRing: null,
    playlistContainer: null,
};

/**
 * 存储播放列表项的点击事件处理函数引用
 * 用于正确移除事件监听器，防止内存泄漏
 * @type {WeakMap<HTMLElement, Function>}
 */
const playlistItemHandlers = new WeakMap();
const playlistItemKeyHandlers = new WeakMap();

// ====================================================================
// 初始化
// ====================================================================

export function initMusicPlayer() {
    if (isInitialized) return;

    // 获取DOM元素
    elements.player = document.getElementById('music-player');
    elements.header = elements.player?.querySelector('.player-header') || null;
    elements.playBtn = document.getElementById('music-play-btn');
    elements.prevBtn = document.getElementById('music-prev-btn');
    elements.nextBtn = document.getElementById('music-next-btn');
    elements.progressBar = document.getElementById('music-progress-bar');
    elements.progressFill = document.getElementById('music-progress-fill');
    elements.currentTime = document.getElementById('music-current-time');
    elements.totalTime = document.getElementById('music-total-time');
    elements.volumeSlider = document.getElementById('music-volume-slider');
    elements.volumeFill = document.getElementById('music-volume-fill');
    elements.toggleBtn = document.getElementById('music-toggle-btn');
    elements.title = document.getElementById('music-title');
    elements.artist = document.getElementById('music-artist');
    elements.cover = document.getElementById('music-cover');
    elements.progressRing = ensureProgressRing();
    elements.playlistContainer = document.getElementById('music-playlist-items');

    if (!elements.player) {
        console.error('[MusicPlayer] Player element not found');
        return;
    }

    elements.player.classList.add('intro');
    const onIntroEnd = (event) => {
        if (event.target !== elements.player || event.animationName !== 'slideInUp') return;
        elements.player.classList.remove('intro');
        elements.player.removeEventListener('animationend', onIntroEnd);
    };
    elements.player.addEventListener('animationend', onIntroEnd);
    setTimeout(() => {
        elements.player.classList.remove('intro');
        elements.player.removeEventListener('animationend', onIntroEnd);
    }, 500);

    // 确保currentTrackIndex有效
    if (!Number.isFinite(currentTrackIndex) || currentTrackIndex < 0 || currentTrackIndex >= PLAYLIST.length) {
        currentTrackIndex = 0;
    }

    // 创建音频对象
    audio = new Audio(PLAYLIST[currentTrackIndex].path);
    audio.loop = false; // 不循环单曲，播放完后切换下一首

    // 从本地存储恢复音量
    const savedVolume = parseFloat(SafeStorage.getItem(CONFIG.SAVE_VOLUME_KEY, CONFIG.DEFAULT_VOLUME.toString()));
    audio.volume = savedVolume;
    updateVolumeUI(savedVolume);
    syncProgressUI(0);

    // 恢复最小化状态
    if (isMinimized) {
        elements.player.classList.add('minimized');
    }
    updatePlayerDisclosureUI();

    // 绑定事件
    bindEvents();

    // 创建播放列表UI
    createPlaylist();

    // 加载当前曲目信息
    loadTrackInfo();

    isInitialized = true;

    console.log('[MusicPlayer] Initialized successfully');
    console.log('[MusicPlayer] Playlist:', PLAYLIST);
    console.log('[MusicPlayer] Current track:', currentTrackIndex);
}

// ====================================================================
// 事件绑定
// ====================================================================

// 存储事件处理函数的引用，以便移除
const eventHandlers = {
    playBtnClick: (e) => {
        e.stopPropagation();
        togglePlay();
    },
    prevBtnClick: (e) => {
        e.stopPropagation();
        playPrevTrack();
    },
    nextBtnClick: (e) => {
        e.stopPropagation();
        playNextTrack();
    },
    progressBarMouseDown: (e) => {
        e.stopPropagation();
        startDraggingProgress(e);
    },
    progressBarClick: (e) => {
        e.stopPropagation();
        seekProgress(e);
    },
    progressBarKeydown: (e) => {
        e.stopPropagation();
        handleProgressKeydown(e);
    },
    progressBarTouchStart: (e) => {
        e.stopPropagation();
        startDraggingProgress(e);
    },
    volumeSliderMouseDown: (e) => {
        e.stopPropagation();
        startDraggingVolume(e);
    },
    volumeSliderClick: (e) => {
        e.stopPropagation();
        adjustVolume(e);
    },
    volumeSliderKeydown: (e) => {
        e.stopPropagation();
        handleVolumeKeydown(e);
    },
    volumeSliderTouchStart: (e) => {
        e.stopPropagation();
        startDraggingVolume(e);
    },
    toggleBtnClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[MusicPlayer] Toggle button clicked, current state:', isMinimized);
        toggleMinimize();
    },
    headerClick: (e) => {
        if (isMinimized || isAnimating || isInteractivePlayerTarget(e.target)) return;

        e.preventDefault();
        e.stopPropagation();
        console.log('[MusicPlayer] Header clicked while expanded, minimizing...');
        toggleMinimize();
    },
    playerClick: (e) => {
        if (isMinimized && !elements.toggleBtn.contains(e.target)) {
            console.log('[MusicPlayer] Player clicked while minimized');
            toggleMinimize();
        } else if (!isMinimized) {
            if (!isAnimating && !isInteractivePlayerTarget(e.target)) {
                console.log('[MusicPlayer] Expanded panel surface clicked, minimizing...');
                toggleMinimize();
            }
            e.stopPropagation();
        }
    },
    coverClick: (e) => {
        if (isMinimized) {
            e.stopPropagation();
            console.log('[MusicPlayer] Cover clicked while minimized');
            toggleMinimize();
        }
    },
    outsideClick: (e) => {
        if (!isMinimized && elements.player && !elements.player.contains(e.target)) {
            console.log('[MusicPlayer] Clicked outside, minimizing...');
            toggleMinimize();
        }
    }
};

function bindEvents() {
    // 播放/暂停
    elements.playBtn.addEventListener('click', eventHandlers.playBtnClick);

    // 上一曲
    elements.prevBtn.addEventListener('click', eventHandlers.prevBtnClick);

    // 下一曲
    elements.nextBtn.addEventListener('click', eventHandlers.nextBtnClick);

    // 进度条拖动
    elements.progressBar.addEventListener('mousedown', eventHandlers.progressBarMouseDown);
    elements.progressBar.addEventListener('click', eventHandlers.progressBarClick);
    elements.progressBar.addEventListener('keydown', eventHandlers.progressBarKeydown);

    // 音量拖动
    elements.volumeSlider.addEventListener('mousedown', eventHandlers.volumeSliderMouseDown);
    elements.volumeSlider.addEventListener('click', eventHandlers.volumeSliderClick);
    elements.volumeSlider.addEventListener('keydown', eventHandlers.volumeSliderKeydown);

    // 触摸事件支持
    elements.progressBar.addEventListener('touchstart', eventHandlers.progressBarTouchStart);
    elements.volumeSlider.addEventListener('touchstart', eventHandlers.volumeSliderTouchStart);

    // 最小化/展开
    elements.toggleBtn.addEventListener('click', eventHandlers.toggleBtnClick);
    elements.header?.addEventListener('click', eventHandlers.headerClick);

    // 播放器点击事件（包含缩小状态展开和阻止冒泡）
    elements.player.addEventListener('click', eventHandlers.playerClick);

    // 缩小状态下点击封面也可以展开
    elements.cover.addEventListener('click', eventHandlers.coverClick);

    // 点击外部区域自动折叠
    document.addEventListener('click', eventHandlers.outsideClick);

    // 音频事件
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', onMetadataLoaded);
    audio.addEventListener('ended', onAudioEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
}

// ====================================================================
// 播放控制
// ====================================================================

function togglePlay() {
    if (isPlaying) {
        audio.pause();
    } else {
        audio.play().catch(err => {
            console.error('[MusicPlayer] Play failed:', err);
        });
    }
}

function onPlay() {
    isPlaying = true;
    updatePlayButtonUI(true);
    elements.cover.classList.add('playing');
    elements.player.classList.add('playing'); // 给整个播放器添加playing类，用于缩小状态的呼吸灯

    // 第一次播放时标记并更新封面显示
    if (!hasEverPlayed) {
        hasEverPlayed = true;
        loadTrackInfo(); // 重新加载信息以显示封面
    }
}

function onPause() {
    isPlaying = false;
    updatePlayButtonUI(false);
    elements.cover.classList.remove('playing');
    elements.player.classList.remove('playing'); // 移除整个播放器的playing类
}

function onAudioEnded() {
    syncProgressUI(1);
    clearCompletionTimer();
    completionTimer = setTimeout(() => {
        completionTimer = null;
        playNextTrack();
    }, TRACK_COMPLETE_HOLD_MS);
}

function updatePlayButtonUI(playing) {
    const icon = elements.playBtn.querySelector('svg use');
    if (icon) {
        icon.setAttribute('href', playing ? '#icon-pause' : '#icon-play');
    }
    elements.playBtn.setAttribute('aria-pressed', playing.toString());
    elements.playBtn.title = playing ? '暂停' : '播放';
}

// ====================================================================
// 进度控制
// ====================================================================

function updateProgress() {
    if (isDraggingProgress) return;

    syncProgressUI();
}

function ensureProgressRing() {
    const cover = document.getElementById('music-cover');
    if (!cover) return null;

    let ring = cover.querySelector('.player-progress-ring');
    if (!ring) {
        ring = document.createElement('span');
        ring.className = 'player-progress-ring';
        ring.setAttribute('aria-hidden', 'true');
        cover.prepend(ring);
    }

    return ring;
}

function getPlaybackProgressRatio() {
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(1, audio.currentTime / audio.duration));
}

function syncProgressUI(ratio = getPlaybackProgressRatio()) {
    const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
    const percent = safeRatio * 100;
    const angle = safeRatio * 360;

    if (elements.progressFill) {
        elements.progressFill.style.width = `${percent}%`;
    }
    if (elements.currentTime && audio) {
        elements.currentTime.textContent = formatTime(audio.currentTime);
    }
    if (elements.progressBar && audio) {
        const now = Math.round(percent);
        const total = Number.isFinite(audio.duration) ? formatTime(audio.duration) : '0:00';
        elements.progressBar.setAttribute('aria-valuenow', now.toString());
        elements.progressBar.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} / ${total}`);
    }
    setProgressRingVars(elements.player, angle);
    setProgressRingVars(elements.cover, angle);
    setProgressRingVars(elements.progressRing, angle);
}

function setProgressRingVars(target, angle) {
    if (!target) return;

    target.style.setProperty('--music-progress-angle-soft', `${angle * 0.34}deg`);
    target.style.setProperty('--music-progress-angle-mid', `${angle * 0.68}deg`);
    target.style.setProperty('--music-progress-angle', `${angle}deg`);
}

function clearCompletionTimer() {
    if (!completionTimer) return;
    clearTimeout(completionTimer);
    completionTimer = null;
}

function startDraggingProgress(e) {
    bindDragListeners();
    isDraggingProgress = true;
    seekProgress(e);
}

function seekProgress(e) {
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
        syncProgressUI(0);
        return;
    }

    const rect = elements.progressBar.getBoundingClientRect();
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const offsetX = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, offsetX / rect.width));

    audio.currentTime = percent * audio.duration;
    syncProgressUI(percent);
}

function handleProgressKeydown(e) {
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

    const step = Math.max(5, audio.duration * 0.03);
    const pageStep = Math.max(15, audio.duration * 0.1);
    let nextTime = audio.currentTime;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        nextTime -= step;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        nextTime += step;
    } else if (e.key === 'PageDown') {
        nextTime -= pageStep;
    } else if (e.key === 'PageUp') {
        nextTime += pageStep;
    } else if (e.key === 'Home') {
        nextTime = 0;
    } else if (e.key === 'End') {
        nextTime = audio.duration;
    } else {
        return;
    }

    e.preventDefault();
    audio.currentTime = Math.max(0, Math.min(audio.duration, nextTime));
    syncProgressUI();
}

// ====================================================================
// 音量控制
// ====================================================================

function startDraggingVolume(e) {
    bindDragListeners();
    isDraggingVolume = true;
    adjustVolume(e);
}

function adjustVolume(e) {
    const rect = elements.volumeSlider.getBoundingClientRect();
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const offsetX = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, offsetX / rect.width));

    audio.volume = percent;
    updateVolumeUI(percent);
    SafeStorage.setItem(CONFIG.SAVE_VOLUME_KEY, percent.toString());
}

function updateVolumeUI(volume) {
    elements.volumeFill.style.width = `${volume * 100}%`;
    elements.volumeSlider?.setAttribute('aria-valuenow', Math.round(volume * 100).toString());
    elements.volumeSlider?.setAttribute('aria-valuetext', `${Math.round(volume * 100)}%`);
}

function handleVolumeKeydown(e) {
    if (!audio) return;

    let nextVolume = audio.volume;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        nextVolume -= 0.05;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        nextVolume += 0.05;
    } else if (e.key === 'PageDown') {
        nextVolume -= 0.1;
    } else if (e.key === 'PageUp') {
        nextVolume += 0.1;
    } else if (e.key === 'Home') {
        nextVolume = 0;
    } else if (e.key === 'End') {
        nextVolume = 1;
    } else {
        return;
    }

    e.preventDefault();
    audio.volume = Math.max(0, Math.min(1, nextVolume));
    updateVolumeUI(audio.volume);
    SafeStorage.setItem(CONFIG.SAVE_VOLUME_KEY, audio.volume.toString());
}

// ====================================================================
// 鼠标/触摸事件处理
// ====================================================================

function handleMouseMove(e) {
    if (isDraggingProgress) {
        seekProgress(e);
    } else if (isDraggingVolume) {
        adjustVolume(e);
    }
}

function handleTouchMove(e) {
    if (isDraggingProgress || isDraggingVolume) {
        e.preventDefault();
        handleMouseMove(e);
    }
}

function handleMouseUp() {
    isDraggingProgress = false;
    isDraggingVolume = false;
    unbindDragListeners();
}

function bindDragListeners() {
    if (dragListenersBound) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);
    document.addEventListener('touchcancel', handleMouseUp);

    dragListenersBound = true;
}

function unbindDragListeners() {
    if (!dragListenersBound) return;

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleMouseUp);
    document.removeEventListener('touchcancel', handleMouseUp);

    dragListenersBound = false;
}

// ====================================================================
// 最小化/展开
// ====================================================================

function isInteractivePlayerTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(PLAYER_INTERACTIVE_SELECTOR));
}

function updatePlayerDisclosureUI() {
    if (!elements.player) return;

    const isExpanded = !isMinimized;
    elements.player.setAttribute('aria-expanded', isExpanded.toString());
    elements.player.dataset.state = isExpanded ? 'expanded' : 'minimized';

    if (elements.toggleBtn) {
        elements.toggleBtn.setAttribute('aria-expanded', isExpanded.toString());
        elements.toggleBtn.setAttribute('aria-label', isExpanded ? '收起音乐播放器' : '展开音乐播放器');
        elements.toggleBtn.title = isExpanded ? '收起音乐播放器' : '展开音乐播放器';
    }

    if (elements.header) {
        elements.header.title = isExpanded ? '收起音乐播放器' : '展开音乐播放器';
    }
}

function measureExpandedHeight() {
    const player = elements.player;
    if (!player) return 0;

    const wasMinimized = player.classList.contains('minimized');
    if (wasMinimized) {
        player.classList.add('measuring');
        player.classList.remove('minimized');
        // Force reflow to ensure layout updates
        void player.offsetHeight;
    }

    const height = player.scrollHeight || 0;

    if (wasMinimized) {
        player.classList.add('minimized');
        player.classList.remove('measuring');
    }

    return height;
}

function finalizeAnimation(type) {
    const player = elements.player;
    if (!player || !isAnimating) return;

    if (type === 'expand') {
        player.classList.remove('expanding');
    } else {
        player.classList.remove('collapsing');
        player.classList.add('minimized');
    }

    player.classList.remove('is-animating');
    player.style.removeProperty('--player-open-height');
    updatePlayerDisclosureUI();
    isAnimating = false;
}

function toggleMinimize() {
    if (!elements.player || isAnimating) return;

    const player = elements.player;
    player.classList.remove('intro');
    isMinimized = !isMinimized;
    console.log('[MusicPlayer] toggleMinimize called, new state:', isMinimized);
    isAnimating = true;
    updatePlayerDisclosureUI();

    if (!isMinimized) {
        const expandedHeight = measureExpandedHeight();
        if (expandedHeight) {
            player.style.setProperty('--player-open-height', `${expandedHeight}px`);
        }
        player.classList.remove('minimized');
        player.classList.add('expanding', 'is-animating');

        const onEnd = (event) => {
            if (event.target !== player || event.animationName !== 'playerExpand') return;
            player.removeEventListener('animationend', onEnd);
            finalizeAnimation('expand');
        };
        player.addEventListener('animationend', onEnd);
        setTimeout(() => finalizeAnimation('expand'), ANIMATION_DURATION_MS + 80);
    } else {
        const expandedHeight = player.scrollHeight || measureExpandedHeight();
        if (expandedHeight) {
            player.style.setProperty('--player-open-height', `${expandedHeight}px`);
        }
        player.classList.add('collapsing', 'is-animating');

        const onEnd = (event) => {
            if (event.target !== player || event.animationName !== 'playerCollapse') return;
            player.removeEventListener('animationend', onEnd);
            finalizeAnimation('collapse');
        };
        player.addEventListener('animationend', onEnd);
        setTimeout(() => finalizeAnimation('collapse'), ANIMATION_DURATION_MS + 80);
    }

    SafeStorage.setItem(CONFIG.SAVE_MINIMIZED_KEY, isMinimized.toString());
}

// ====================================================================
// 播放列表管理
// ====================================================================

function createPlaylist() {
    if (!elements.playlistContainer) {
        console.warn('[MusicPlayer] Playlist container not found');
        return;
    }

    // 清空容器
    elements.playlistContainer.textContent = '';

    // 为每首歌创建列表项
    PLAYLIST.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        if (index === currentTrackIndex) {
            item.classList.add('active');
        }
        item.dataset.index = index;
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-pressed', (index === currentTrackIndex).toString());
        item.setAttribute('aria-label', `播放 ${track.title}`);

        const iconWrap = document.createElement('div');
        iconWrap.className = 'playlist-item-icon';
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        icon.setAttribute('fill', 'currentColor');
        icon.setAttribute('viewBox', '0 0 24 24');
        setPlaylistItemIcon(icon, index === currentTrackIndex);
        iconWrap.appendChild(icon);

        const info = document.createElement('div');
        info.className = 'playlist-item-info';
        const title = document.createElement('div');
        title.className = 'playlist-item-title';
        title.textContent = track.title;
        const artist = document.createElement('div');
        artist.className = 'playlist-item-artist';
        artist.textContent = track.artist;
        info.append(title, artist);

        const cover = document.createElement('div');
        cover.className = 'playlist-item-cover';
        const image = document.createElement('img');
        image.src = track.cover;
        image.alt = track.title;
        image.loading = 'lazy';
        cover.appendChild(image);

        item.append(iconWrap, info, cover);

        // 点击切换歌曲 - 存储处理函数引用以便后续移除
        const clickHandler = () => switchTrack(index);
        const keyHandler = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            switchTrack(index);
        };
        playlistItemHandlers.set(item, clickHandler);
        playlistItemKeyHandlers.set(item, keyHandler);
        item.addEventListener('click', clickHandler);
        item.addEventListener('keydown', keyHandler);

        elements.playlistContainer.appendChild(item);
    });

    console.log('[MusicPlayer] Playlist UI created');
}

function setPlaylistItemIcon(icon, isActive) {
    icon.replaceChildren();

    const node = document.createElementNS(
        'http://www.w3.org/2000/svg',
        isActive ? 'path' : 'circle'
    );

    if (isActive) {
        node.setAttribute('d', 'M9.5 16.5v-9l7 4.5z');
    } else {
        node.setAttribute('cx', '12');
        node.setAttribute('cy', '12');
        node.setAttribute('r', '2');
    }

    icon.appendChild(node);
}

function switchTrack(index) {
    clearCompletionTimer();

    if (index === currentTrackIndex) {
        // 点击当前歌曲，切换播放/暂停
        togglePlay();
        return;
    }

    // 记录之前是否在播放
    const wasPlaying = isPlaying;

    // 暂停当前播放
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }

    // 切换到新曲目
    currentTrackIndex = index;
    const nextTrack = PLAYLIST[currentTrackIndex];
    SafeStorage.setItem(CONFIG.SAVE_CURRENT_TRACK_KEY, currentTrackIndex.toString());

    // 加载新音频
    audio.src = PLAYLIST[currentTrackIndex].path;
    audio.src = nextTrack.path;
    audio.load();
    syncProgressUI(0);

    // 更新UI
    loadTrackInfo(nextTrack);
    updatePlaylistUI();

    // 如果之前在播放，自动播放新曲目
    if (wasPlaying) {
        audio.play().catch(err => {
            console.error('[MusicPlayer] Auto-play failed:', err);
        });
    }

    console.log('[MusicPlayer] Switched to track:', currentTrackIndex, PLAYLIST[currentTrackIndex].title);
}

function playPrevTrack() {
    const prevIndex = (currentTrackIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
    switchTrack(prevIndex);

    // 自动播放上一首
    audio.play().catch(err => {
        console.error('[MusicPlayer] Auto-play prev failed:', err);
    });
}

function playNextTrack() {
    const nextIndex = (currentTrackIndex + 1) % PLAYLIST.length;
    switchTrack(nextIndex);

    // 自动播放下一首
    audio.play().catch(err => {
        console.error('[MusicPlayer] Auto-play next failed:', err);
    });
}

function updatePlaylistUI() {
    if (!elements.playlistContainer) return;

    const items = elements.playlistContainer.querySelectorAll('.playlist-item');
    items.forEach((item, index) => {
        const icon = item.querySelector('.playlist-item-icon svg');

        if (index === currentTrackIndex) {
            item.classList.add('active');
            item.setAttribute('aria-pressed', 'true');
            if (icon) {
                setPlaylistItemIcon(icon, true);
            }
        } else {
            item.classList.remove('active');
            item.setAttribute('aria-pressed', 'false');
            if (icon) {
                setPlaylistItemIcon(icon, false);
            }
        }
    });
}

function loadTrackInfo(track = getCurrentPlaybackTrack()) {
    elements.title.textContent = track.title;
    elements.artist.textContent = track.artist;
    updatePanelArtwork(track);

    // 设置emoji属性（始终显示在最上层）
    elements.cover.setAttribute('data-emoji', '🎵');

    // 清除旧的封面图片
    const existingImg = elements.cover.querySelector('img');
    if (existingImg) {
        existingImg.remove();
    }

    // 只有在曾经播放过的情况下才显示封面图
    // 初次加载时保持默认橙色圆环 + emoji，点击播放后才显示封面
    if (hasEverPlayed && track.cover) {
        // 创建封面图片元素
        const img = document.createElement('img');
        img.src = track.cover;
        img.alt = track.title;
        elements.cover.appendChild(img);
        elements.cover.classList.add('has-cover');
    } else {
        // 初次加载或没有封面时，显示橙色圆环
        elements.cover.classList.remove('has-cover');
    }

    console.log('[MusicPlayer] Track info loaded:', {
        title: track.title,
        artist: track.artist,
        cover: track.cover,
        hasEverPlayed: hasEverPlayed
    });
}

function getCurrentPlaybackTrack() {
    const sources = [audio?.src, audio?.currentSrc].filter(Boolean);

    for (const source of sources) {
        const matchingTrack = PLAYLIST.find(track => getAbsoluteUrl(track.path) === source);
        if (matchingTrack) return matchingTrack;
    }

    return PLAYLIST[currentTrackIndex];
}

function getAbsoluteUrl(path) {
    try {
        return new URL(path, window.location.href).href;
    } catch {
        return path;
    }
}

function updatePanelArtwork(track) {
    if (!elements.player) return;

    if (!track?.cover) {
        elements.player.classList.remove('has-panel-artwork');
        elements.player.style.removeProperty('--music-panel-cover');
        delete elements.player.dataset.panelTrack;
        return;
    }

    const safeCover = track.cover.replace(/["\\\n\r\f]/g, '');
    elements.player.style.setProperty('--music-panel-cover', `url("${safeCover}")`);
    elements.player.dataset.panelTrack = track.title;
    elements.player.classList.add('has-panel-artwork');
}

function onMetadataLoaded() {
    elements.totalTime.textContent = formatTime(audio.duration);
    syncProgressUI();
    console.log('[MusicPlayer] Audio duration:', audio.duration);
}

// ====================================================================
// 工具函数
// ====================================================================

function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 清理音乐播放器资源，移除所有事件监听器
 * 用于防止内存泄漏
 */
export function destroyMusicPlayer() {
    clearCompletionTimer();

    // 停止音频播放
    if (audio) {
        audio.pause();
        audio.currentTime = 0;

        // 移除音频事件监听器
        audio.removeEventListener('timeupdate', updateProgress);
        audio.removeEventListener('loadedmetadata', onMetadataLoaded);
        audio.removeEventListener('ended', onAudioEnded);
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);

        audio = null;
    }

    // 移除DOM事件监听器
    if (elements.playBtn) {
        elements.playBtn.removeEventListener('click', eventHandlers.playBtnClick);
    }
    if (elements.prevBtn) {
        elements.prevBtn.removeEventListener('click', eventHandlers.prevBtnClick);
    }
    if (elements.nextBtn) {
        elements.nextBtn.removeEventListener('click', eventHandlers.nextBtnClick);
    }

    // 移除进度条事件
    if (elements.progressBar) {
        elements.progressBar.removeEventListener('mousedown', eventHandlers.progressBarMouseDown);
        elements.progressBar.removeEventListener('click', eventHandlers.progressBarClick);
        elements.progressBar.removeEventListener('keydown', eventHandlers.progressBarKeydown);
        elements.progressBar.removeEventListener('touchstart', eventHandlers.progressBarTouchStart);
    }

    // 移除音量控制事件
    if (elements.volumeSlider) {
        elements.volumeSlider.removeEventListener('mousedown', eventHandlers.volumeSliderMouseDown);
        elements.volumeSlider.removeEventListener('click', eventHandlers.volumeSliderClick);
        elements.volumeSlider.removeEventListener('keydown', eventHandlers.volumeSliderKeydown);
        elements.volumeSlider.removeEventListener('touchstart', eventHandlers.volumeSliderTouchStart);
    }

    // 移除全局事件监听器
    unbindDragListeners();

    // 移除播放器相关事件
    if (elements.toggleBtn) {
        elements.toggleBtn.removeEventListener('click', eventHandlers.toggleBtnClick);
    }
    if (elements.header) {
        elements.header.removeEventListener('click', eventHandlers.headerClick);
    }
    if (elements.player) {
        elements.player.removeEventListener('click', eventHandlers.playerClick);
    }
    if (elements.cover) {
        elements.cover.removeEventListener('click', eventHandlers.coverClick);
    }

    // 移除外部点击事件
    document.removeEventListener('click', eventHandlers.outsideClick);

    // 清空播放列表事件监听器 - 使用WeakMap中存储的处理函数引用
    if (elements.playlistContainer) {
        const items = elements.playlistContainer.querySelectorAll('.playlist-item');
        items.forEach(item => {
            const handler = playlistItemHandlers.get(item);
            if (handler) {
                item.removeEventListener('click', handler);
                playlistItemHandlers.delete(item);
            }
            const keyHandler = playlistItemKeyHandlers.get(item);
            if (keyHandler) {
                item.removeEventListener('keydown', keyHandler);
                playlistItemKeyHandlers.delete(item);
            }
        });
    }

    // 重置状态
    isPlaying = false;
    isDraggingProgress = false;
    isDraggingVolume = false;
    hasEverPlayed = false;
    isAnimating = false;
    isInitialized = false;

    console.log('[MusicPlayer] Resources cleaned up and destroyed');
}

export function toggleMusicPlayer() {
    toggleMinimize();
}

// ====================================================================
// 导出
// ====================================================================

export default {
    init: initMusicPlayer,
    togglePlay,
    toggleMinimize,
    destroy: destroyMusicPlayer,
};

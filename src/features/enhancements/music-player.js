import SafeStorage from '../../utils/safe-storage.js';
import '../../styles/components/music-player.css';

function assetUrl(path) {
    return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

const PLAYLIST = [
    {
        title: "Travelers' Encore",
        artist: 'Andrew Prahlow',
        path: assetUrl('music/Andrew Prahlow - Outer Wilds- Echoes of the Eye (The Lost Reels) -Deluxe Original Game Soundtrack- - 21 Travelers\' encore.mp3'),
        cover: assetUrl('covers/cover_travelers_encore.png')
    },
    {
        title: 'Outer Wilds',
        artist: 'Andrew Prahlow',
        path: assetUrl('music/Outer Wilds.mp3'),
        cover: assetUrl('covers/cover_outer_wilds.jpg')
    }
];

const CONFIG = {
    DEFAULT_VOLUME: 0.7,
    SAVE_VOLUME_KEY: 'music_player_volume',
    SAVE_MINIMIZED_KEY: 'music_player_minimized',
    SAVE_CURRENT_TRACK_KEY: 'music_player_current_track',
    ANIMATION_DURATION_MS: 220,
    TRACK_COMPLETE_HOLD_MS: 120,
};

const LABELS = {
    play: '\u64ad\u653e',
    pause: '\u6682\u505c',
    expand: '\u5c55\u5f00\u97f3\u4e50\u64ad\u653e\u5668',
    collapse: '\u6536\u8d77\u97f3\u4e50\u64ad\u653e\u5668',
    playTrack: '\u64ad\u653e',
    musicNote: '\uD83C\uDFB5',
};

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

let controller = null;

class MusicPlayerController {
    constructor() {
        this.elements = {};
        this.audio = null;
        this.cleanups = [];
        this.activeDragCleanups = [];
        this.completionTimer = null;
        this.animationTimer = null;
        this.animationFinish = null;
        this.animationCleanup = null;
        this.dragKind = null;
        this.pendingSeekRatio = null;
        this.pendingSeekNeedsReady = false;
        this.ready = false;

        this.state = {
            playing: false,
            minimized: SafeStorage.getItem(CONFIG.SAVE_MINIMIZED_KEY, 'true') === 'true',
            currentTrackIndex: readStoredTrackIndex(),
            playbackStarted: false,
            animating: false,
        };
    }

    init() {
        if (!this.collectElements()) return false;

        const track = this.currentTrack();
        this.audio = new Audio(track.path);
        this.audio.loop = false;
        this.audio.preload = 'metadata';

        this.ensureProgressRing();
        this.ensureCornerToggle();
        this.restoreAudioSettings();
        this.renderPlaylist();
        this.syncTrackUI();
        this.syncProgressUI(0);
        this.bindEvents();
        this.applyMinimizedState(this.state.minimized, { animate: false, persist: false });
        this.addIntroAnimation();

        this.ready = true;
        return true;
    }

    collectElements() {
        const player = document.getElementById('music-player');
        if (!player) {
            console.error('[MusicPlayer] Player element not found');
            return false;
        }

        this.elements = {
            player,
            header: player.querySelector('.player-header'),
            playBtn: document.getElementById('music-play-btn'),
            prevBtn: document.getElementById('music-prev-btn'),
            nextBtn: document.getElementById('music-next-btn'),
            progressBar: document.getElementById('music-progress-bar'),
            progressFill: document.getElementById('music-progress-fill'),
            currentTime: document.getElementById('music-current-time'),
            totalTime: document.getElementById('music-total-time'),
            volumeSlider: document.getElementById('music-volume-slider'),
            volumeFill: document.getElementById('music-volume-fill'),
            toggleBtn: document.getElementById('music-toggle-btn'),
            title: document.getElementById('music-title'),
            artist: document.getElementById('music-artist'),
            cover: document.getElementById('music-cover'),
            playlistContainer: document.getElementById('music-playlist-items'),
            cornerToggleBtn: null,
            progressRing: null,
        };

        const missing = [
            'playBtn',
            'prevBtn',
            'nextBtn',
            'progressBar',
            'progressFill',
            'currentTime',
            'totalTime',
            'volumeSlider',
            'volumeFill',
            'toggleBtn',
            'title',
            'artist',
            'cover',
            'playlistContainer',
        ].filter((key) => !this.elements[key]);

        if (missing.length > 0) {
            console.error(`[MusicPlayer] Missing required elements: ${missing.join(', ')}`);
            return false;
        }

        return true;
    }

    bindEvents() {
        this.on(this.elements.playBtn, 'click', (event) => {
            event.stopPropagation();
            this.togglePlay();
        });

        this.on(this.elements.prevBtn, 'click', (event) => {
            event.stopPropagation();
            this.playPreviousTrack();
        });

        this.on(this.elements.nextBtn, 'click', (event) => {
            event.stopPropagation();
            this.playNextTrack();
        });

        this.bindSlider(this.elements.progressBar, 'progress');
        this.bindSlider(this.elements.volumeSlider, 'volume');

        this.on(this.elements.toggleBtn, 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.toggleMinimize();
        });

        this.on(this.elements.cornerToggleBtn, 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.toggleMinimize();
        });

        this.on(this.elements.header, 'click', (event) => {
            if (this.state.animating || this.isInteractiveTarget(event.target)) return;
            event.stopPropagation();
        });

        this.on(this.elements.player, 'click', (event) => {
            this.handlePlayerSurfaceClick(event);
        });

        this.on(this.elements.cover, 'click', (event) => {
            if (!this.state.minimized) return;
            event.preventDefault();
            event.stopPropagation();
            this.applyMinimizedState(false);
        });

        this.on(document, 'click', (event) => {
            if (!this.state.minimized && !this.isInsidePlayerSurface(event)) {
                this.applyMinimizedState(true);
            }
        });

        this.on(this.audio, 'timeupdate', () => {
            if (this.dragKind !== 'progress') this.syncProgressUI();
        });
        this.on(this.audio, 'loadedmetadata', () => this.handleMetadataLoaded());
        this.on(this.audio, 'durationchange', () => this.handleDurationChange());
        this.on(this.audio, 'ended', () => this.handleAudioEnded());
        this.on(this.audio, 'play', () => this.handlePlay());
        this.on(this.audio, 'playing', () => this.handlePlaying());
        this.on(this.audio, 'pause', () => this.handlePause());
        this.on(this.audio, 'loadstart', () => this.setPlayerStatus('loading'));
        this.on(this.audio, 'canplay', () => this.handleCanPlay());
        this.on(this.audio, 'waiting', () => this.setPlayerStatus('loading'));
        this.on(this.audio, 'error', () => this.setPlayerStatus('error'));
    }

    bindSlider(slider, kind) {
        const start = (event) => {
            this.startDrag(kind, event);
        };
        const keydown = (event) => {
            if (kind === 'progress') {
                this.handleProgressKeydown(event);
            } else {
                this.handleVolumeKeydown(event);
            }
        };

        if (typeof window !== 'undefined' && 'PointerEvent' in window) {
            this.on(slider, 'pointerdown', start);
        } else {
            this.on(slider, 'mousedown', start);
            this.on(slider, 'touchstart', start, { passive: false });
        }

        this.on(slider, 'keydown', keydown);
    }

    on(target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        this.cleanups.push(() => target.removeEventListener(type, handler, options));
    }

    togglePlay() {
        if (!this.audio) return;

        if (this.state.playing) {
            this.audio.pause();
            return;
        }

        this.playAudio();
    }

    playAudio() {
        if (!this.audio) return;

        this.setPlayerStatus('loading');
        this.audio.play().catch((error) => {
            console.error('[MusicPlayer] Play failed:', error);
            this.setPlayerStatus('error');
        });
    }

    handlePlay() {
        this.state.playing = true;
        this.state.playbackStarted = true;
        this.setPlayerStatus('ready');
        this.updatePlayButtonUI();
        this.syncTrackUI();
        this.elements.cover.classList.add('playing');
        this.elements.player.classList.add('playing');
    }

    handlePause() {
        this.state.playing = false;
        this.updatePlayButtonUI();
        this.elements.cover.classList.remove('playing');
        this.elements.player.classList.remove('playing');
    }

    handleAudioEnded() {
        this.syncProgressUI(1);
        this.clearCompletionTimer();
        this.completionTimer = setTimeout(() => {
            this.completionTimer = null;
            this.playNextTrack();
        }, CONFIG.TRACK_COMPLETE_HOLD_MS);
    }

    playPreviousTrack() {
        const previousIndex = wrapIndex(this.state.currentTrackIndex - 1);
        this.selectTrack(previousIndex, { forcePlay: true });
    }

    playNextTrack() {
        const nextIndex = wrapIndex(this.state.currentTrackIndex + 1);
        this.selectTrack(nextIndex, { forcePlay: true });
    }

    selectTrack(index, options = {}) {
        const nextIndex = clampTrackIndex(index);
        const isCurrentTrack = nextIndex === this.state.currentTrackIndex;

        if (isCurrentTrack) {
            if (options.toggleCurrent) this.togglePlay();
            return;
        }

        this.clearCompletionTimer();
        this.pendingSeekRatio = null;
        this.pendingSeekNeedsReady = false;
        const shouldPlay = Boolean(options.forcePlay || (options.keepPlaybackState && this.state.playing));

        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }

        this.state.currentTrackIndex = nextIndex;
        SafeStorage.setItem(CONFIG.SAVE_CURRENT_TRACK_KEY, nextIndex.toString());

        const track = this.currentTrack();
        this.audio.src = track.path;
        this.setPlayerStatus('loading');
        this.audio.load();
        this.syncProgressUI(0);
        this.syncTrackUI();
        this.updatePlaylistUI();

        if (shouldPlay) this.playAudio();
    }

    startDrag(kind, event) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();

        this.dragKind = kind;
        this.applyDragValue(event);
        this.bindActiveDragListeners(event.type);
    }

    bindActiveDragListeners(startType) {
        this.clearActiveDragListeners();

        const move = (event) => {
            if (event.cancelable) event.preventDefault();
            this.applyDragValue(event);
        };
        const end = () => {
            this.dragKind = null;
            this.clearActiveDragListeners();
        };
        const add = (type, handler, options) => {
            document.addEventListener(type, handler, options);
            this.activeDragCleanups.push(() => document.removeEventListener(type, handler, options));
        };

        if (startType === 'pointerdown') {
            add('pointermove', move);
            add('pointerup', end);
            add('pointercancel', end);
            return;
        }

        if (startType === 'touchstart') {
            add('touchmove', move, { passive: false });
            add('touchend', end);
            add('touchcancel', end);
            return;
        }

        add('mousemove', move);
        add('mouseup', end);
    }

    clearActiveDragListeners() {
        while (this.activeDragCleanups.length > 0) {
            const cleanup = this.activeDragCleanups.pop();
            cleanup();
        }
    }

    applyDragValue(event) {
        if (this.dragKind === 'progress') {
            this.seekToRatio(this.getPointerRatio(event, this.elements.progressBar));
            return;
        }

        if (this.dragKind === 'volume') {
            this.setVolume(this.getPointerRatio(event, this.elements.volumeSlider));
        }
    }

    seekToRatio(ratio) {
        if (!this.audio) return;

        const safeRatio = clamp(ratio);
        this.clearCompletionTimer();

        if (!this.hasSeekableDuration()) {
            this.pendingSeekRatio = safeRatio;
            this.pendingSeekNeedsReady = true;
            this.syncProgressUI(safeRatio);
            return;
        }

        this.pendingSeekRatio = null;
        this.pendingSeekNeedsReady = false;
        this.audio.currentTime = safeRatio * this.audio.duration;
        this.syncProgressUI();
    }

    handleProgressKeydown(event) {
        if (!this.audio || !this.hasSeekableDuration()) return;

        const step = Math.max(5, this.audio.duration * 0.03);
        const pageStep = Math.max(15, this.audio.duration * 0.1);
        let nextTime = this.audio.currentTime;

        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            nextTime -= step;
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            nextTime += step;
        } else if (event.key === 'PageDown') {
            nextTime -= pageStep;
        } else if (event.key === 'PageUp') {
            nextTime += pageStep;
        } else if (event.key === 'Home') {
            nextTime = 0;
        } else if (event.key === 'End') {
            nextTime = this.audio.duration;
        } else {
            return;
        }

        event.preventDefault();
        this.audio.currentTime = clamp(nextTime / this.audio.duration) * this.audio.duration;
        this.syncProgressUI();
    }

    handleVolumeKeydown(event) {
        if (!this.audio) return;

        let nextVolume = this.audio.volume;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            nextVolume -= 0.05;
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            nextVolume += 0.05;
        } else if (event.key === 'PageDown') {
            nextVolume -= 0.1;
        } else if (event.key === 'PageUp') {
            nextVolume += 0.1;
        } else if (event.key === 'Home') {
            nextVolume = 0;
        } else if (event.key === 'End') {
            nextVolume = 1;
        } else {
            return;
        }

        event.preventDefault();
        this.setVolume(nextVolume);
    }

    setVolume(volume) {
        const safeVolume = clamp(volume);
        this.audio.volume = safeVolume;
        this.syncVolumeUI();
        SafeStorage.setItem(CONFIG.SAVE_VOLUME_KEY, safeVolume.toString());
    }

    syncVolumeUI() {
        const volume = this.audio ? clamp(this.audio.volume) : CONFIG.DEFAULT_VOLUME;
        const percent = Math.round(volume * 100);
        this.elements.volumeFill.style.width = `${percent}%`;
        this.elements.volumeSlider.setAttribute('aria-valuenow', percent.toString());
        this.elements.volumeSlider.setAttribute('aria-valuetext', `${percent}%`);
    }

    syncProgressUI(forcedRatio = null) {
        const ratio = forcedRatio === null ? this.getPlaybackRatio() : clamp(forcedRatio);
        const percent = ratio * 100;
        const angle = ratio * 360;
        const duration = this.audio?.duration;
        const currentTime = this.audio?.currentTime || 0;
        const totalText = Number.isFinite(duration) && duration > 0 ? formatTime(duration) : '0:00';

        this.elements.progressFill.style.width = `${percent}%`;
        this.elements.currentTime.textContent = formatTime(currentTime);
        this.elements.totalTime.textContent = totalText;
        this.elements.progressBar.setAttribute('aria-valuenow', Math.round(percent).toString());
        this.elements.progressBar.setAttribute('aria-valuetext', `${formatTime(currentTime)} / ${totalText}`);

        this.setProgressRingVars(this.elements.player, angle);
        this.setProgressRingVars(this.elements.cover, angle);
        this.setProgressRingVars(this.elements.progressRing, angle);
    }

    getPlaybackRatio() {
        if (!this.hasSeekableDuration()) return 0;
        return clamp(this.audio.currentTime / this.audio.duration);
    }

    hasSeekableDuration() {
        return Boolean(this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0);
    }

    setProgressRingVars(target, angle) {
        if (!target) return;
        target.style.setProperty('--music-progress-angle-soft', `${angle * 0.34}deg`);
        target.style.setProperty('--music-progress-angle-mid', `${angle * 0.68}deg`);
        target.style.setProperty('--music-progress-angle', `${angle}deg`);
    }

    handleMetadataLoaded() {
        this.setPlayerStatus('ready');
        if (!this.applyPendingSeek()) this.syncProgressUI();
    }

    handleDurationChange() {
        if (!this.applyPendingSeek()) this.syncProgressUI();
    }

    handleCanPlay() {
        this.applyPendingSeek({ ready: true });
        this.setPlayerStatus('ready');
    }

    handlePlaying() {
        this.applyPendingSeek({ ready: true });
        this.setPlayerStatus('ready');
    }

    applyPendingSeek(options = {}) {
        if (this.pendingSeekRatio === null || !this.hasSeekableDuration()) return false;

        const ratio = this.pendingSeekRatio;
        this.audio.currentTime = ratio * this.audio.duration;
        this.syncProgressUI();
        if (!this.pendingSeekNeedsReady || options.ready) {
            this.pendingSeekRatio = null;
            this.pendingSeekNeedsReady = false;
        }
        return true;
    }

    setPlayerStatus(status) {
        if (!this.elements.player) return;

        this.elements.player.classList.toggle('is-loading', status === 'loading');
        this.elements.player.classList.toggle('has-error', status === 'error');
    }

    getPointerRatio(event, element) {
        const rect = element.getBoundingClientRect();
        if (!rect.width) return 0;

        return clamp((getClientX(event) - rect.left) / rect.width);
    }

    applyMinimizedState(minimized, options = {}) {
        const { animate = true, persist = true } = options;
        const nextMinimized = Boolean(minimized);
        const player = this.elements.player;

        if (!player || (this.state.animating && animate)) return;

        player.classList.remove('intro');
        this.state.minimized = nextMinimized;
        if (persist) {
            SafeStorage.setItem(CONFIG.SAVE_MINIMIZED_KEY, nextMinimized.toString());
        }

        if (!animate) {
            this.finishAnimation(nextMinimized ? 'collapse' : 'expand', { immediate: true });
            return;
        }

        this.startDisclosureAnimation(nextMinimized ? 'collapse' : 'expand');
    }

    startDisclosureAnimation(type) {
        const player = this.elements.player;
        this.clearAnimationTimer();
        this.state.animating = true;
        this.updateDisclosureUI();
        this.setOpenHeight();

        if (type === 'expand') {
            player.classList.remove('minimized', 'collapsing');
            player.classList.add('expanding', 'is-animating');
        } else {
            player.classList.remove('expanding');
            player.classList.add('collapsing', 'is-animating');
        }

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            this.animationCleanup?.();
            this.animationCleanup = null;
            this.finishAnimation(type);
        };
        const onAnimationEnd = (event) => {
            if (event.target !== player) return;
            const expectedName = type === 'expand' ? 'playerExpand' : 'playerCollapse';
            if (event.animationName !== expectedName) return;
            finish();
        };

        this.animationFinish = finish;
        this.animationCleanup = () => player.removeEventListener('animationend', onAnimationEnd);
        player.addEventListener('animationend', onAnimationEnd);
        this.animationTimer = setTimeout(finish, CONFIG.ANIMATION_DURATION_MS + 80);
    }

    finishAnimation(type, options = {}) {
        const player = this.elements.player;
        if (!player) return;

        this.clearAnimationTimer();
        player.classList.remove('expanding', 'collapsing', 'is-animating');
        player.classList.toggle('minimized', type === 'collapse');
        player.style.removeProperty('--player-open-height');
        this.state.animating = false;
        this.updateDisclosureUI();

        if (options.immediate) {
            player.classList.toggle('minimized', this.state.minimized);
        }
    }

    clearAnimationTimer() {
        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
            this.animationTimer = null;
        }
        this.animationFinish = null;
        this.animationCleanup?.();
        this.animationCleanup = null;
    }

    setOpenHeight() {
        const height = this.measureOpenHeight();
        if (height > 0) {
            this.elements.player.style.setProperty('--player-open-height', `${height}px`);
        }
    }

    measureOpenHeight() {
        const player = this.elements.player;
        const wasMinimized = player.classList.contains('minimized');

        if (wasMinimized) {
            player.classList.add('measuring');
            player.classList.remove('minimized');
            void player.offsetHeight;
        }

        const height = player.scrollHeight || 0;

        if (wasMinimized) {
            player.classList.add('minimized');
            player.classList.remove('measuring');
        }

        return height;
    }

    toggleMinimize() {
        this.applyMinimizedState(!this.state.minimized);
    }

    updateDisclosureUI() {
        const expanded = !this.state.minimized;
        const label = expanded ? LABELS.collapse : LABELS.expand;

        this.elements.player.setAttribute('aria-expanded', expanded.toString());
        this.elements.player.dataset.state = expanded ? 'expanded' : 'minimized';
        this.elements.toggleBtn.setAttribute('aria-expanded', expanded.toString());
        this.elements.toggleBtn.setAttribute('aria-label', label);
        this.elements.toggleBtn.title = label;
        if (this.elements.cornerToggleBtn) {
            this.elements.cornerToggleBtn.setAttribute('aria-expanded', expanded.toString());
            this.elements.cornerToggleBtn.setAttribute('aria-label', label);
            this.elements.cornerToggleBtn.title = label;
        }
        if (this.elements.header) this.elements.header.title = label;
    }

    handlePlayerSurfaceClick(event) {
        if (this.state.minimized) {
            if (!this.isInteractiveTarget(event.target)) {
                event.preventDefault();
                event.stopPropagation();
                this.applyMinimizedState(false);
            }
            return;
        }

        if (!this.state.animating && !this.isInteractiveTarget(event.target)) {
            event.preventDefault();
        }
        event.stopPropagation();
    }

    isInsidePlayerSurface(event) {
        const { player } = this.elements;
        if (!player) return false;

        const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
        return path ? path.includes(player) : player.contains(event.target);
    }

    isInteractiveTarget(target) {
        if (!(target instanceof Element)) return false;
        return Boolean(target.closest(PLAYER_INTERACTIVE_SELECTOR));
    }

    renderPlaylist() {
        const fragment = document.createDocumentFragment();

        PLAYLIST.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.dataset.index = index.toString();
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `${LABELS.playTrack} ${track.title}`);

            const iconWrap = document.createElement('div');
            iconWrap.className = 'playlist-item-icon';
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            icon.setAttribute('fill', 'currentColor');
            icon.setAttribute('viewBox', '0 0 24 24');
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

            this.on(item, 'click', (event) => {
                event.stopPropagation();
                this.selectTrack(index, { toggleCurrent: true, keepPlaybackState: true });
            });
            this.on(item, 'keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.selectTrack(index, { toggleCurrent: true, keepPlaybackState: true });
            });

            item.append(iconWrap, info, cover);
            fragment.appendChild(item);
        });

        this.elements.playlistContainer.replaceChildren(fragment);
        this.updatePlaylistUI();
    }

    updatePlaylistUI() {
        const items = this.elements.playlistContainer.querySelectorAll('.playlist-item');
        items.forEach((item, index) => {
            const active = index === this.state.currentTrackIndex;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', active.toString());

            const icon = item.querySelector('.playlist-item-icon svg');
            if (icon) setPlaylistItemIcon(icon, active);
        });
    }

    syncTrackUI() {
        const track = this.currentTrack();
        this.elements.player.classList.remove('has-error');
        this.elements.title.textContent = track.title;
        this.elements.artist.textContent = track.artist;
        this.updatePanelArtwork(track);
        this.updateCoverArtwork(track);
        this.updatePlayButtonUI();
    }

    updatePlayButtonUI() {
        const use = this.elements.playBtn.querySelector('svg use');
        if (use) use.setAttribute('href', this.state.playing ? '#icon-pause' : '#icon-play');
        this.elements.playBtn.setAttribute('aria-pressed', this.state.playing.toString());
        this.elements.playBtn.title = this.state.playing ? LABELS.pause : LABELS.play;
    }

    updatePanelArtwork(track) {
        const player = this.elements.player;
        if (!track.cover) {
            player.classList.remove('has-panel-artwork');
            player.style.removeProperty('--music-panel-cover');
            delete player.dataset.panelTrack;
            return;
        }

        player.style.setProperty('--music-panel-cover', `url("${sanitizeCssUrl(track.cover)}")`);
        player.dataset.panelTrack = track.title;
        player.classList.add('has-panel-artwork');
    }

    updateCoverArtwork(track) {
        const cover = this.elements.cover;
        cover.dataset.emoji = LABELS.musicNote;

        cover.querySelectorAll('img').forEach((image) => image.remove());
        cover.classList.toggle('has-cover', Boolean(this.state.playbackStarted && track.cover));

        if (!this.state.playbackStarted || !track.cover) return;

        const image = document.createElement('img');
        image.src = track.cover;
        image.alt = track.title;
        cover.appendChild(image);
    }

    ensureProgressRing() {
        let ring = this.elements.cover.querySelector('.player-progress-ring');
        if (!ring) {
            ring = document.createElement('span');
            ring.className = 'player-progress-ring';
            ring.setAttribute('aria-hidden', 'true');
            this.elements.cover.prepend(ring);
        }
        this.elements.progressRing = ring;
    }

    ensureCornerToggle() {
        let toggle = this.elements.player.querySelector('.player-corner-toggle');
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'player-corner-toggle';
            toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 7v9h9" /><path d="M8 16l8-8" /></svg>';
            this.elements.player.appendChild(toggle);
        }
        this.elements.cornerToggleBtn = toggle;
    }

    restoreAudioSettings() {
        const storedVolume = Number.parseFloat(
            SafeStorage.getItem(CONFIG.SAVE_VOLUME_KEY, CONFIG.DEFAULT_VOLUME.toString())
        );
        this.audio.volume = Number.isFinite(storedVolume) ? clamp(storedVolume) : CONFIG.DEFAULT_VOLUME;
        this.syncVolumeUI();
    }

    addIntroAnimation() {
        const player = this.elements.player;
        player.classList.add('intro');

        let complete = false;
        let timer = null;
        const cleanup = () => {
            if (complete) return;
            complete = true;
            clearTimeout(timer);
            player.classList.remove('intro');
            player.removeEventListener('animationend', handleEnd);
        };
        const handleEnd = (event) => {
            if (event.target !== player || event.animationName !== 'slideInUp') return;
            cleanup();
        };

        player.addEventListener('animationend', handleEnd);
        timer = setTimeout(cleanup, CONFIG.ANIMATION_DURATION_MS + 80);
        this.cleanups.push(cleanup);
    }

    currentTrack() {
        return PLAYLIST[this.state.currentTrackIndex] || PLAYLIST[0];
    }

    clearCompletionTimer() {
        if (!this.completionTimer) return;
        clearTimeout(this.completionTimer);
        this.completionTimer = null;
    }

    destroy() {
        this.clearCompletionTimer();
        this.clearAnimationTimer();
        this.clearActiveDragListeners();

        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }

        while (this.cleanups.length > 0) {
            const cleanup = this.cleanups.pop();
            cleanup();
        }

        this.elements.player?.classList.remove('playing', 'expanding', 'collapsing', 'is-animating', 'intro', 'is-loading', 'has-error');
        this.elements.cover?.classList.remove('playing');
        this.audio = null;
        this.ready = false;
        this.state.playing = false;
        this.state.animating = false;
        this.dragKind = null;
        this.pendingSeekRatio = null;
        this.pendingSeekNeedsReady = false;
    }
}

function readStoredTrackIndex() {
    return clampTrackIndex(
        Number.parseInt(SafeStorage.getItem(CONFIG.SAVE_CURRENT_TRACK_KEY, '0'), 10)
    );
}

function clampTrackIndex(index) {
    if (!Number.isFinite(index)) return 0;
    return Math.max(0, Math.min(PLAYLIST.length - 1, index));
}

function wrapIndex(index) {
    return (index + PLAYLIST.length) % PLAYLIST.length;
}

function clamp(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function getClientX(event) {
    if (event.touches?.length) return event.touches[0].clientX;
    if (event.changedTouches?.length) return event.changedTouches[0].clientX;
    return event.clientX || 0;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function sanitizeCssUrl(url) {
    return String(url).replace(/["\\\n\r\f]/g, '');
}

function setPlaylistItemIcon(icon, active) {
    icon.replaceChildren();

    const node = document.createElementNS(
        'http://www.w3.org/2000/svg',
        active ? 'path' : 'circle'
    );

    if (active) {
        node.setAttribute('d', 'M9.5 16.5v-9l7 4.5z');
    } else {
        node.setAttribute('cx', '12');
        node.setAttribute('cy', '12');
        node.setAttribute('r', '2');
    }

    icon.appendChild(node);
}

export function initMusicPlayer() {
    if (controller?.ready) return;

    const nextController = new MusicPlayerController();
    if (nextController.init()) {
        controller = nextController;
    }
}

export function destroyMusicPlayer() {
    controller?.destroy();
    controller = null;
}

export function toggleMusicPlayer() {
    controller?.toggleMinimize();
}

export function togglePlay() {
    controller?.togglePlay();
}

export function toggleMinimize() {
    controller?.toggleMinimize();
}

export default {
    init: initMusicPlayer,
    togglePlay,
    toggleMinimize,
    destroy: destroyMusicPlayer,
};

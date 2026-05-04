// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let importedModule = null;
let audioInstances = [];
let originalAudio = null;
let originalGetBoundingClientRect = null;

class FakeAudio extends EventTarget {
    constructor(src) {
        super();
        this.src = src;
        this.currentSrc = src;
        this.currentTime = 0;
        this.duration = 120;
        this.volume = 1;
        this.loop = false;
        this.preload = '';
        audioInstances.push(this);
    }

    play() {
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
    }

    pause() {
        this.dispatchEvent(new Event('pause'));
    }

    load() {
        this.currentSrc = this.src;
        this.dispatchEvent(new Event('loadedmetadata'));
    }
}

describe('music-player', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.resetModules();
        importedModule = null;
        audioInstances = [];
        localStorage.clear();
        document.body.innerHTML = musicPlayerMarkup();

        originalAudio = globalThis.Audio;
        globalThis.Audio = FakeAudio;
        window.Audio = FakeAudio;

        originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
            if (this.id === 'music-progress-bar' || this.id === 'music-volume-slider') {
                return { left: 0, top: 0, right: 200, bottom: 16, width: 200, height: 16 };
            }
            return { left: 0, top: 0, right: 340, bottom: 408, width: 340, height: 408 };
        };
    });

    afterEach(() => {
        importedModule?.destroyMusicPlayer();
        HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
        globalThis.Audio = originalAudio;
        window.Audio = originalAudio;
        vi.useRealTimers();
    });

    it('initializes the complete player shell from stored defaults', async () => {
        importedModule = await import('../music-player.js');

        importedModule.initMusicPlayer();

        expect(audioInstances).toHaveLength(1);
        expect(audioInstances[0].src).toContain('Travelers');
        expect(document.getElementById('music-player').classList.contains('minimized')).toBe(true);
        expect(document.getElementById('music-player').dataset.state).toBe('minimized');
        expect(document.getElementById('music-title').textContent).toBe("Travelers' Encore");
        expect(document.querySelectorAll('.playlist-item')).toHaveLength(2);
        expect(document.querySelector('.playlist-item.active .playlist-item-title').textContent).toBe("Travelers' Encore");
        expect(document.querySelector('.player-progress-ring')).toBeTruthy();
        expect(document.querySelector('.player-corner-toggle')).toBeTruthy();
        expect(document.getElementById('music-volume-slider').getAttribute('aria-valuenow')).toBe('70');
    });

    it('restores persisted track, volume, and disclosure state', async () => {
        localStorage.setItem('music_player_current_track', '1');
        localStorage.setItem('music_player_volume', '0.35');
        localStorage.setItem('music_player_minimized', 'false');
        importedModule = await import('../music-player.js');

        importedModule.initMusicPlayer();

        expect(audioInstances[0].src).toContain('Outer Wilds');
        expect(audioInstances[0].volume).toBe(0.35);
        expect(document.getElementById('music-player').classList.contains('minimized')).toBe(false);
        expect(document.getElementById('music-player').getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById('music-title').textContent).toBe('Outer Wilds');
    });

    it('plays, switches tracks, and keeps artwork state in sync', async () => {
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();

        document.getElementById('music-play-btn').click();
        await Promise.resolve();

        expect(document.getElementById('music-play-btn').getAttribute('aria-pressed')).toBe('true');
        expect(document.getElementById('music-player').classList.contains('playing')).toBe(true);
        expect(document.getElementById('music-cover').classList.contains('has-cover')).toBe(true);

        document.getElementById('music-next-btn').click();
        await Promise.resolve();

        expect(document.getElementById('music-title').textContent).toBe('Outer Wilds');
        expect(localStorage.getItem('music_player_current_track')).toBe('1');
        expect(document.querySelectorAll('.playlist-item')[1].classList.contains('active')).toBe(true);
        expect(document.getElementById('music-play-btn').getAttribute('aria-pressed')).toBe('true');
    });

    it('supports keyboard seeking and volume changes', async () => {
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();

        document.getElementById('music-progress-bar').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'End', bubbles: true })
        );
        document.getElementById('music-volume-slider').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
        );

        expect(audioInstances[0].currentTime).toBe(120);
        expect(document.getElementById('music-progress-bar').getAttribute('aria-valuenow')).toBe('100');
        expect(document.querySelector('.player-progress-ring').style.getPropertyValue('--music-progress-angle')).toBe('360deg');
        expect(audioInstances[0].volume).toBe(0);
        expect(document.getElementById('music-volume-slider').getAttribute('aria-valuenow')).toBe('0');
        expect(localStorage.getItem('music_player_volume')).toBe('0');
    });

    it('seeks to the clicked progress position without restarting playback', async () => {
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();

        document.getElementById('music-play-btn').click();
        await Promise.resolve();

        audioInstances[0].currentTime = 10;
        dispatchSliderStart(document.getElementById('music-progress-bar'), 100);

        expect(audioInstances[0].currentTime).toBe(60);
        expect(document.getElementById('music-progress-bar').getAttribute('aria-valuenow')).toBe('50');
        expect(document.getElementById('music-play-btn').getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps progress click intent until metadata makes the track seekable', async () => {
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();

        audioInstances[0].duration = Number.NaN;
        dispatchSliderStart(document.getElementById('music-progress-bar'), 100);

        expect(audioInstances[0].currentTime).toBe(0);
        expect(document.getElementById('music-progress-fill').style.width).toBe('50%');

        audioInstances[0].duration = 120;
        audioInstances[0].dispatchEvent(new Event('loadedmetadata'));

        expect(audioInstances[0].currentTime).toBe(60);
        expect(document.getElementById('music-progress-bar').getAttribute('aria-valuenow')).toBe('50');

        audioInstances[0].currentTime = 0;
        audioInstances[0].dispatchEvent(new Event('canplay'));

        expect(audioInstances[0].currentTime).toBe(60);
        expect(document.getElementById('music-progress-bar').getAttribute('aria-valuenow')).toBe('50');
    });

    it('keeps a pending progress click stable after switching to the second track', async () => {
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();

        document.querySelectorAll('.playlist-item')[1].click();

        expect(document.getElementById('music-title').textContent).toBe('Outer Wilds');

        audioInstances[0].duration = Number.NaN;
        audioInstances[0].currentTime = 0;
        dispatchSliderStart(document.getElementById('music-progress-bar'), 100);

        expect(document.getElementById('music-progress-fill').style.width).toBe('50%');

        audioInstances[0].duration = 146;
        audioInstances[0].dispatchEvent(new Event('loadedmetadata'));
        expect(audioInstances[0].currentTime).toBe(73);

        audioInstances[0].currentTime = 0;
        audioInstances[0].dispatchEvent(new Event('playing'));

        expect(audioInstances[0].currentTime).toBe(73);
        expect(document.getElementById('music-current-time').textContent).toBe('1:13');
    });

    it('expands and collapses through the new disclosure controller', async () => {
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();
        const player = document.getElementById('music-player');

        player.click();
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(false);
        expect(player.dataset.state).toBe('expanded');
        expect(player.getAttribute('aria-expanded')).toBe('true');
        expect(localStorage.getItem('music_player_minimized')).toBe('false');

        document.getElementById('music-toggle-btn').click();
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(true);
        expect(player.dataset.state).toBe('minimized');
        expect(player.getAttribute('aria-expanded')).toBe('false');
        expect(localStorage.getItem('music_player_minimized')).toBe('true');
    });

    it('keeps internal blank clicks open and only collapses from outside clicks', async () => {
        localStorage.setItem('music_player_minimized', 'false');
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();
        const player = document.getElementById('music-player');

        player.querySelector('.player-content').dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true })
        );
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(false);
        expect(player.dataset.state).toBe('expanded');
        expect(localStorage.getItem('music_player_minimized')).toBe('false');

        player.querySelector('.player-header').dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true })
        );
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(false);
        expect(player.dataset.state).toBe('expanded');

        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(true);
        expect(player.dataset.state).toBe('minimized');
        expect(localStorage.getItem('music_player_minimized')).toBe('true');
    });

    it('uses the lower-left corner toggle for repeated disclosure', async () => {
        importedModule = await import('../music-player.js');
        importedModule.initMusicPlayer();
        const player = document.getElementById('music-player');
        const cornerToggle = document.querySelector('.player-corner-toggle');

        expect(cornerToggle).toBeTruthy();

        player.click();
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(false);
        expect(cornerToggle.getAttribute('aria-expanded')).toBe('true');

        cornerToggle.click();
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(true);
        expect(cornerToggle.getAttribute('aria-expanded')).toBe('false');

        player.click();
        vi.advanceTimersByTime(320);

        expect(player.classList.contains('minimized')).toBe(false);
        expect(player.dataset.state).toBe('expanded');
    });
});

function musicPlayerMarkup() {
    return `
        <div id="music-player" class="music-player">
            <div class="player-header">
                <div id="music-cover" class="player-cover">\uD83C\uDFB5</div>
                <div class="player-info">
                    <div id="music-title" class="player-title">Loading...</div>
                    <div id="music-artist" class="player-artist">---</div>
                </div>
                <button id="music-toggle-btn" type="button" class="player-toggle">
                    <svg><path /></svg>
                </button>
            </div>
            <div class="player-content">
                <div class="player-progress">
                    <div id="music-progress-bar" class="progress-bar" role="slider" tabindex="0">
                        <div id="music-progress-fill" class="progress-fill"></div>
                    </div>
                    <div class="progress-time">
                        <span id="music-current-time">0:00</span>
                        <span id="music-total-time">0:00</span>
                    </div>
                </div>
                <div class="player-controls">
                    <button id="music-prev-btn" type="button" class="control-btn"></button>
                    <button id="music-play-btn" type="button" class="control-btn play-btn" aria-pressed="false">
                        <svg><use href="#icon-play" /></svg>
                    </button>
                    <button id="music-next-btn" type="button" class="control-btn"></button>
                </div>
                <div class="volume-control">
                    <div id="music-volume-slider" class="volume-slider" role="slider" tabindex="0">
                        <div id="music-volume-fill" class="volume-fill"></div>
                    </div>
                </div>
                <div class="playlist-section">
                    <div id="music-playlist-items" class="playlist-items"></div>
                </div>
            </div>
        </div>
        <svg>
            <symbol id="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></symbol>
            <symbol id="icon-pause" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></symbol>
        </svg>
    `;
}

function dispatchSliderStart(element, clientX) {
    const usesPointerEvents = 'PointerEvent' in window;
    const startType = usesPointerEvents ? 'pointerdown' : 'mousedown';
    const endType = usesPointerEvents ? 'pointerup' : 'mouseup';
    const EventConstructor = usesPointerEvents && typeof window.PointerEvent === 'function'
        ? window.PointerEvent
        : window.MouseEvent;

    element.dispatchEvent(new EventConstructor(startType, {
        bubbles: true,
        cancelable: true,
        clientX,
    }));
    document.dispatchEvent(new EventConstructor(endType, {
        bubbles: true,
        cancelable: true,
        clientX,
    }));
}

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    setImageSource: vi.fn(),
    getSmartImageUrl: vi.fn((url) => url)
}));

vi.mock('../image-handler.js', () => ({
    setImageSource: mocks.setImageSource,
    getSmartImageUrl: mocks.getSmartImageUrl
}));

const { updateCard } = await import('../card-renderer.js');

function createCard() {
    const card = document.createElement('a');
    card.className = 'room-card';

    const thumb = document.createElement('img');
    const platformChip = document.createElement('span');
    const chip = document.createElement('span');
    const chipText = document.createElement('span');
    chip.appendChild(chipText);
    const titleEl = document.createElement('span');
    const ownerEl = document.createElement('span');
    const roomIdEl = document.createElement('span');
    const viewerPill = document.createElement('span');
    const viewerIcon = document.createElement('span');
    const viewerNum = document.createElement('span');
    const avatar = document.createElement('img');
    const avatarSkeleton = document.createElement('div');
    const favBtn = document.createElement('button');
    const loader = document.createElement('div');
    const durationEl = document.createElement('span');

    card.append(
        thumb,
        platformChip,
        chip,
        titleEl,
        ownerEl,
        roomIdEl,
        viewerPill,
        viewerIcon,
        viewerNum,
        avatar,
        avatarSkeleton,
        favBtn,
        loader,
        durationEl
    );

    card._domRefs = {
        thumb,
        platformChip,
        chip,
        chipText,
        titleEl,
        ownerEl,
        roomIdEl,
        viewerPill,
        viewerIcon,
        viewerNum,
        avatar,
        favBtn,
        loader,
        durationEl
    };

    return { card, avatar };
}

describe('card-renderer avatar source selection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses the cover as the avatar source when platform data has no avatar URL', () => {
        const { card, avatar } = createCard();

        updateCard(
            card,
            { id: '100', platform: 'douyu', isFav: false },
            {
                isLive: true,
                isReplay: false,
                title: 'Live title',
                owner: 'Streamer',
                viewers: 'online',
                cover: 'https://example.com/live-cover.jpg',
                avatar: '',
                startTime: null
            },
            'live'
        );

        const avatarCall = mocks.setImageSource.mock.calls.find(([config]) => config.imgElement === avatar);
        expect(avatarCall?.[0].newSrc).toBe('https://example.com/live-cover.jpg');
    });

    it('keeps the real avatar as the primary source and cover as fallback', () => {
        const { card, avatar } = createCard();

        updateCard(
            card,
            { id: '100', platform: 'douyu', isFav: false },
            {
                isLive: true,
                isReplay: false,
                title: 'Live title',
                owner: 'Streamer',
                viewers: 'online',
                cover: 'https://example.com/live-cover.jpg',
                avatar: 'https://example.com/avatar.jpg',
                startTime: null
            },
            'live'
        );

        const avatarCall = mocks.setImageSource.mock.calls.find(([config]) => config.imgElement === avatar);
        expect(avatarCall?.[0].newSrc).toBe('https://example.com/avatar.jpg');
        expect(avatarCall?.[0].fallbacks.standard).toBe('https://example.com/live-cover.jpg');
    });
});

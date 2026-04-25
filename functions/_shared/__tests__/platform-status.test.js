import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleBatchStatusRequest, handleStatusRequest, isSupportedPlatform, parseHeatValue } from '../platform-status.js';

describe('cloudflare platform status helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('recognizes supported platforms', () => {
        expect(isSupportedPlatform('douyu')).toBe(true);
        expect(isSupportedPlatform('bilibili')).toBe(true);
        expect(isSupportedPlatform('unknown')).toBe(false);
    });

    it('normalizes heat values from common platform formats', () => {
        expect(parseHeatValue(1234)).toBe(1234);
        expect(parseHeatValue('1.2K')).toBe(1200);
        expect(parseHeatValue(`3.4${'\u4e07'}`)).toBe(34000);
        expect(parseHeatValue('bad')).toBe(0);
    });

    it('rejects unsupported status platforms before fetching', async () => {
        const response = await handleStatusRequest({
            request: new Request('https://liveradar.pages.dev/api/status?platform=unknown&id=1'),
            env: {}
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            ok: false,
            error: 'unsupported_platform'
        });
    });

    it('rejects batch requests above the per-request stability limit', async () => {
        const rooms = Array.from({ length: 11 }, (_, index) => ({
            platform: 'douyu',
            id: String(index + 1)
        }));
        const response = await handleBatchStatusRequest({
            request: new Request('https://liveradar.pages.dev/api/status/batch', {
                method: 'POST',
                body: JSON.stringify({ rooms })
            }),
            env: {}
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            ok: false,
            error: 'too_many_rooms',
            limit: 10
        });
    });

    it('uses the Bilibili room batch API for batch requests', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            const rawUrl = String(url);
            if (rawUrl.includes('getRoomBaseInfo')) {
                return new Response(JSON.stringify({
                    code: 0,
                    data: {
                        by_room_ids: {
                            100: {
                                room_id: 100,
                                uid: 1,
                                live_status: 1,
                                title: 'Room 100',
                                uname: 'Anchor 100',
                                online: 1234,
                                live_time: '2026-04-24 12:00:00',
                                cover: 'https://example.com/100.jpg'
                            },
                            2200: {
                                room_id: 2200,
                                short_id: 200,
                                uid: 2,
                                live_status: 0,
                                title: 'Room 200',
                                uname: 'Anchor 200',
                                online: 0,
                                live_time: '0000-00-00 00:00:00',
                                cover: 'https://example.com/200.jpg'
                            }
                        }
                    }
                }), { status: 200 });
            }

            if (rawUrl.includes('get_status_info_by_uids')) {
                return new Response(JSON.stringify({
                    code: 0,
                    data: {
                        1: {
                            uid: 1,
                            room_id: 100,
                            live_status: 1,
                            title: 'Room 100',
                            uname: 'Anchor 100',
                            online: 1234,
                            live_time: 1777041600,
                            face: 'https://example.com/100-face.jpg',
                            keyframe: 'https://example.com/100-live.jpg'
                        },
                        2: {
                            uid: 2,
                            room_id: 2200,
                            live_status: 0,
                            title: 'Room 200',
                            uname: 'Anchor 200',
                            online: 0,
                            live_time: 0,
                            face: 'https://example.com/200-face.jpg',
                            cover_from_user: 'https://example.com/200-cover.jpg'
                        }
                    }
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${rawUrl}`);
        });

        const response = await handleBatchStatusRequest({
            request: new Request('https://liveradar.pages.dev/api/status/batch', {
                method: 'POST',
                body: JSON.stringify({
                    rooms: [
                        { platform: 'bilibili', id: '100', fetchAvatar: true },
                        { platform: 'bilibili', id: '200', fetchAvatar: true }
                    ]
                })
            }),
            env: {}
        });

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.results).toHaveLength(2);
        expect(payload.results[0]).toMatchObject({
            ok: true,
            platform: 'bilibili',
            id: '100',
            status: {
                isLive: true,
                owner: 'Anchor 100',
                avatar: 'https://example.com/100-face.jpg'
            }
        });
        expect(payload.results[1]).toMatchObject({
            ok: true,
            platform: 'bilibili',
            id: '200',
            status: {
                isLive: false,
                owner: 'Anchor 200',
                avatar: 'https://example.com/200-face.jpg'
            }
        });
        expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('uses Douyu betard before the older ratestream fallback', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            const rawUrl = String(url);
            if (rawUrl.includes('ratestream')) {
                throw new Error('ratestream should not be called after betard succeeds');
            }
            if (rawUrl.includes('betard')) {
                return new Response(JSON.stringify({
                    room: {
                        videoLoop: 0,
                        show_status: 1,
                        room_name: 'Douyu Live',
                        nickname: 'Douyu Anchor',
                        online: '1.2万',
                        room_pic: 'https://example.com/douyu.jpg',
                        owner_avatar: 'https://example.com/douyu-face.jpg',
                        show_time: 1777041600
                    }
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${rawUrl}`);
        });

        const response = await handleStatusRequest({
            request: new Request('https://liveradar.pages.dev/api/status?platform=douyu&id=100'),
            env: {}
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            platform: 'douyu',
            status: {
                isLive: true,
                owner: 'Douyu Anchor',
                heatValue: 12000
            }
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses the official Kick API when a token is configured', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
            const rawUrl = String(url);
            if (rawUrl.includes('api.kick.com/public/v1/channels')) {
                expect(options.headers.Authorization).toBe('Bearer token-123');
                return new Response(JSON.stringify({
                    data: [{
                        slug: 'xqc',
                        stream_title: 'Kick Stream',
                        banner_picture: 'https://example.com/kick-banner.jpg',
                        user: {
                            username: 'xqc',
                            profile_pic: 'https://example.com/kick-face.jpg'
                        },
                        stream: {
                            is_live: true,
                            viewer_count: 321,
                            start_time: '2026-04-24T12:00:00Z',
                            thumbnail: 'https://example.com/kick-live.jpg'
                        }
                    }]
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${rawUrl}`);
        });

        const response = await handleStatusRequest({
            request: new Request('https://liveradar.pages.dev/api/status?platform=kick&id=xqc'),
            env: {
                KICK_ACCESS_TOKEN: 'token-123'
            }
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            platform: 'kick',
            status: {
                isLive: true,
                title: 'Kick Stream',
                owner: 'xqc',
                heatValue: 321,
                avatar: 'https://example.com/kick-face.jpg'
            }
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

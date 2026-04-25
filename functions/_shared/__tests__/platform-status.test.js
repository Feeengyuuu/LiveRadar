import { describe, expect, it } from 'vitest';
import { handleBatchStatusRequest, handleStatusRequest, isSupportedPlatform, parseHeatValue } from '../platform-status.js';

describe('cloudflare platform status helpers', () => {
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

    it('keeps the batch limit above the uploaded 64-room backup size', async () => {
        const rooms = Array.from({ length: 101 }, (_, index) => ({
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
            limit: 100
        });
    });
});

const SUPPORTED_PLATFORMS = new Set(['douyu', 'bilibili', 'twitch', 'kick']);
const STATUS_TIMEOUT_MS = 8000;
const STATUS_CACHE_SECONDS = 20;
const STATUS_CACHE_STALE_SECONDS = 40;
const BATCH_LIMIT = 10;
const BATCH_CONCURRENCY = 6;

let twitchTokenCache = {
    key: '',
    token: '',
    expiresAt: 0
};

export function isSupportedPlatform(platform) {
    return SUPPORTED_PLATFORMS.has(platform);
}

function createDefaultStatus(platform, id) {
    return {
        isLive: false,
        isReplay: false,
        title: '',
        owner: String(id),
        cover: '',
        avatar: '',
        heatValue: 0,
        isError: false,
        startTime: null,
        platform,
        id: String(id)
    };
}

export function parseHeatValue(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    }

    const raw = String(value ?? '').trim().toLowerCase().replace(/,/g, '');
    if (!raw) return 0;

    const match = raw.match(/([\d.]+)\s*(\u4e07|\u4ebf|w|k|m)?/i);
    const numeric = Number.parseFloat(match?.[1] ?? '0');
    if (!Number.isFinite(numeric)) return 0;

    const unit = match?.[2]?.toLowerCase();
    const multiplier = {
        '\u4e07': 10000,
        w: 10000,
        k: 1000,
        m: 1000000,
        '\u4ebf': 100000000
    }[unit] ?? 1;

    return Math.max(0, Math.floor(numeric * multiplier));
}

function parseTimestamp(value, timezoneSuffix = '') {
    if (!value) return null;

    if (typeof value === 'number') {
        if (value > 946684800000) return value;
        if (value > 946684800) return value * 1000;
        return null;
    }

    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d+(\.\d+)?$/.test(raw)) return parseTimestamp(Number(raw));

    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const hasTimezone = /(?:Z|[+-]\d\d:?\d\d)$/.test(normalized);
    const parsed = Date.parse(hasTimezone ? normalized : `${normalized}${timezoneSuffix}`);
    return Number.isNaN(parsed) ? null : parsed;
}

function appendQuery(url, values) {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(values)) {
        parsed.searchParams.set(key, String(value));
    }
    return parsed.toString();
}

function appendCommonQuery(url) {
    return appendQuery(url, {
        t: Math.round(Date.now() / 1000),
        did: 'cloudflare'
    });
}

function timeoutController(timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        clear: () => clearTimeout(timeoutId)
    };
}

async function fetchJson(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? STATUS_TIMEOUT_MS;
    const timeout = timeoutController(timeoutMs);
    try {
        const response = await fetch(url, {
            method: options.method ?? 'GET',
            body: options.body,
            signal: timeout.signal,
            headers: {
                Accept: 'application/json, text/plain, */*',
                'User-Agent': 'LiveRadar/3.1 Cloudflare Pages Function',
                ...(options.headers ?? {})
            }
        });

        if (!response.ok) return null;
        return await response.json();
    } catch (_error) {
        return null;
    } finally {
        timeout.clear();
    }
}

async function fetchText(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? STATUS_TIMEOUT_MS;
    const timeout = timeoutController(timeoutMs);
    try {
        const response = await fetch(url, {
            signal: timeout.signal,
            headers: {
                Accept: 'text/plain, */*',
                'User-Agent': 'LiveRadar/3.1 Cloudflare Pages Function',
                ...(options.headers ?? {})
            }
        });

        if (!response.ok) return null;
        return await response.text();
    } catch (_error) {
        return null;
    } finally {
        timeout.clear();
    }
}

function jsonResponse(data, init = {}) {
    const headers = new Headers(init.headers ?? {});
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(JSON.stringify(data), {
        ...init,
        headers
    });
}

function optionsResponse() {
    return jsonResponse({ ok: true }, {
        headers: {
            'Cache-Control': 'no-store'
        }
    });
}

function cacheRequestFor(request, platform, id, fetchAvatar) {
    const url = new URL(request.url);
    url.pathname = '/api/status';
    url.search = new URLSearchParams({
        platform,
        id: String(id),
        avatar: fetchAvatar ? '1' : '0'
    }).toString();
    return new Request(url.toString(), { method: 'GET' });
}

function waitFor(context, promise) {
    if (typeof context.waitUntil === 'function') {
        context.waitUntil(promise);
        return;
    }
    promise.catch(() => undefined);
}

function normalizePlatform(rawPlatform) {
    return String(rawPlatform ?? '').trim().toLowerCase();
}

function normalizeId(rawId) {
    return String(rawId ?? '').trim();
}

function statusPayload(platform, id, status, cacheStatus = 'MISS') {
    return {
        ok: true,
        platform,
        id: String(id),
        status,
        source: 'cloudflare-pages-function',
        cache: cacheStatus
    };
}

async function fetchStatusDataWithCache(context, platform, id, fetchAvatar) {
    const cacheRequest = cacheRequestFor(context.request, platform, id, fetchAvatar);
    const canUseCache = typeof caches !== 'undefined' && caches.default;

    if (canUseCache) {
        const cached = await caches.default.match(cacheRequest);
        if (cached) {
            const payload = await cached.json();
            return {
                status: payload.status ?? null,
                cache: 'HIT'
            };
        }
    }

    const status = await getPlatformStatus(platform, id, { fetchAvatar, env: context.env ?? {} });
    if (!status) {
        return {
            status: null,
            cache: 'MISS'
        };
    }

    if (canUseCache) {
        const response = jsonResponse(statusPayload(platform, id, status), {
            headers: {
                'Cache-Control': `public, max-age=${STATUS_CACHE_SECONDS}, stale-while-revalidate=${STATUS_CACHE_STALE_SECONDS}`
            }
        });
        waitFor(context, caches.default.put(cacheRequest, response));
    }

    return {
        status,
        cache: 'MISS'
    };
}

export async function handleStatusRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') return optionsResponse();
    if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 });
    }

    const url = new URL(request.url);
    const platform = normalizePlatform(url.searchParams.get('platform'));
    const id = normalizeId(url.searchParams.get('id'));
    const fetchAvatar = url.searchParams.get('avatar') !== '0';

    if (!isSupportedPlatform(platform)) {
        return jsonResponse({ ok: false, error: 'unsupported_platform' }, { status: 400 });
    }
    if (!id) {
        return jsonResponse({ ok: false, error: 'missing_id' }, { status: 400 });
    }

    const result = await fetchStatusDataWithCache(context, platform, id, fetchAvatar);
    if (!result.status) {
        return jsonResponse({ ok: false, error: 'fetch_failed', platform, id }, {
            status: 502,
            headers: { 'Cache-Control': 'no-store' }
        });
    }

    return jsonResponse(statusPayload(platform, id, result.status, result.cache), {
        headers: {
            'Cache-Control': result.cache === 'HIT'
                ? `public, max-age=${STATUS_CACHE_SECONDS}`
                : `public, max-age=${STATUS_CACHE_SECONDS}, stale-while-revalidate=${STATUS_CACHE_STALE_SECONDS}`
        }
    });
}

export async function handleBatchStatusRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') return optionsResponse();
    if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 });
    }

    let body = null;
    try {
        body = await request.json();
    } catch (_error) {
        return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 });
    }

    const rooms = Array.isArray(body?.rooms) ? body.rooms : [];
    if (rooms.length === 0) {
        return jsonResponse({ ok: false, error: 'missing_rooms' }, { status: 400 });
    }
    if (rooms.length > BATCH_LIMIT) {
        return jsonResponse({ ok: false, error: 'too_many_rooms', limit: BATCH_LIMIT }, { status: 400 });
    }

    const normalizedRooms = rooms.map(room => ({
        platform: normalizePlatform(room.platform),
        id: normalizeId(room.id),
        fetchAvatar: room.fetchAvatar !== false && room.avatar !== false
    }));

    const invalid = normalizedRooms.find(room => !isSupportedPlatform(room.platform) || !room.id);
    if (invalid) {
        return jsonResponse({ ok: false, error: 'invalid_room', room: invalid }, { status: 400 });
    }

    const results = await mapWithConcurrency(normalizedRooms, BATCH_CONCURRENCY, async (room) => {
        const result = await fetchStatusDataWithCache(context, room.platform, room.id, room.fetchAvatar);
        return {
            ok: !!result.status,
            platform: room.platform,
            id: room.id,
            status: result.status,
            cache: result.cache,
            error: result.status ? null : 'fetch_failed'
        };
    });

    return jsonResponse({
        ok: true,
        results
    }, {
        headers: { 'Cache-Control': 'no-store' }
    });
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function run() {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await worker(items[index], index);
        }
    }

    const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
    await Promise.all(runners);
    return results;
}

async function getPlatformStatus(platform, id, options) {
    switch (platform) {
        case 'douyu':
            return getDouyuStatus(id, options.fetchAvatar);
        case 'bilibili':
            return getBilibiliStatus(id, options.fetchAvatar);
        case 'twitch':
            return getTwitchStatus(id, options.fetchAvatar, options.env);
        case 'kick':
            return getKickStatus(id);
        default:
            return null;
    }
}

async function getDouyuStatus(id, fetchAvatar) {
    const status = createDefaultStatus('douyu', id);
    const roomId = encodeURIComponent(id);

    const rateData = await fetchJson(appendCommonQuery(`https://m.douyu.com/api/room/ratestream?rid=${roomId}`));
    if (rateData?.data) {
        const data = rateData.data;
        const roomInfo = data.roomInfo ?? {};
        const bizAll = data.room_biz_all ?? {};
        const isReplay = roomInfo.videoLoop === 1 || bizAll.videoLoop === 1;
        const isLive = !isReplay && (roomInfo.show_status === 1 || bizAll.show_status === 1);
        const showTime = bizAll.show_time || roomInfo.show_time;

        status.isReplay = isReplay;
        status.isLive = isLive;
        status.title = bizAll.room_name || roomInfo.room_name || status.title;
        status.owner = bizAll.nickname || roomInfo.nickname || status.owner;
        status.heatValue = parseHeatValue(bizAll.online || roomInfo.online || 0);
        status.cover = bizAll.room_pic || roomInfo.room_pic || status.cover;
        status.avatar = bizAll.owner_avatar || roomInfo.avatar || status.avatar;
        status.startTime = isLive ? parseTimestamp(showTime) : null;

        if (fetchAvatar && !status.avatar) {
            await attachDouyuAvatar(status, roomId);
        }
        return status;
    }

    const betardData = await fetchJson(appendCommonQuery(`https://www.douyu.com/betard/${roomId}`));
    if (betardData?.room) {
        const data = betardData.room;
        const isReplay = data.videoLoop === 1;
        const isLive = !isReplay && data.show_status === 1;

        status.isReplay = isReplay;
        status.isLive = isLive;
        status.title = data.room_name || status.title;
        status.owner = data.nickname || status.owner;
        status.heatValue = parseHeatValue(data.online || 0);
        status.cover = data.room_pic || status.cover;
        status.avatar = data.owner_avatar || status.avatar;
        status.startTime = isLive ? parseTimestamp(data.show_time) : null;

        if (fetchAvatar && !status.avatar) {
            await attachDouyuAvatar(status, roomId);
        }
        return status;
    }

    return null;
}

async function attachDouyuAvatar(status, roomId) {
    const roomData = await fetchJson(appendCommonQuery(`https://open.douyucdn.cn/api/RoomApi/room/${roomId}`), {
        timeoutMs: 4000
    });
    if (roomData?.data?.avatar) {
        status.avatar = roomData.data.avatar;
        status._profileFetched = true;
    }
}

async function getBilibiliStatus(id, fetchAvatar) {
    const status = createDefaultStatus('bilibili', id);
    const roomId = encodeURIComponent(id);
    const info = await fetchJson(appendCommonQuery(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomId}`), {
        timeoutMs: 7000
    });

    if (info?.code === 0 && info.data) {
        applyBilibiliInfo(status, info.data);
        const uid = info.data.uid;
        if (uid) {
            await attachBilibiliProfile(status, uid, fetchAvatar);
        }
        return status;
    }

    const init = await fetchJson(appendCommonQuery(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomId}`), {
        timeoutMs: 6000
    });
    if (!init) return null;

    if (init.code !== 0) {
        return status;
    }

    const data = init.data ?? {};
    const liveStatus = data.live_status;
    status.isLive = liveStatus === 1;
    status.isReplay = liveStatus === 2;
    status.startTime = status.isLive ? parseTimestamp(data.live_time) : null;
    if (data.uid) {
        await attachBilibiliProfile(status, data.uid, fetchAvatar);
    }
    return status;
}

function applyBilibiliInfo(status, data) {
    const liveStatus = data.live_status;
    status.isLive = liveStatus === 1;
    status.isReplay = liveStatus === 2;
    status.title = data.title || status.title;
    status.heatValue = parseHeatValue(data.online || 0);
    status.startTime = status.isLive ? parseTimestamp(data.live_time, '+08:00') : null;

    if (status.isLive) {
        status.cover = data.keyframe || data.user_cover || status.cover;
    } else if (status.isReplay) {
        status.cover = data.user_cover || data.keyframe || status.cover;
    } else {
        status.cover = data.user_cover || status.cover;
    }
}

async function attachBilibiliProfile(status, uid, fetchAvatar) {
    const master = await fetchJson(appendCommonQuery(`https://api.live.bilibili.com/live_user/v1/Master/info?uid=${encodeURIComponent(uid)}`), {
        timeoutMs: 6000
    });
    const info = master?.code === 0 ? master.data?.info : null;
    if (info) {
        status.owner = info.uname || status.owner;
        if (fetchAvatar !== false) {
            status.avatar = info.face || status.avatar;
        }
        status._profileFetched = true;
        return;
    }

    const userInfo = await fetchJson(appendCommonQuery(`https://api.bilibili.com/x/space/acc/info?mid=${encodeURIComponent(uid)}`), {
        timeoutMs: 6000
    });
    if (userInfo?.code === 0 && userInfo.data) {
        status.owner = userInfo.data.name || status.owner;
        if (fetchAvatar !== false) {
            status.avatar = userInfo.data.face || status.avatar;
        }
        status._profileFetched = true;
    }
}

async function getTwitchStatus(id, fetchAvatar, env) {
    const helixStatus = await getTwitchHelixStatus(id, fetchAvatar, env);
    if (helixStatus) return helixStatus;
    return getTwitchDecapiStatus(id, fetchAvatar);
}

async function getTwitchHelixStatus(id, fetchAvatar, env) {
    const auth = await getTwitchAuth(env);
    if (!auth) return null;

    const login = String(id).trim().toLowerCase();
    const headers = {
        Authorization: `Bearer ${auth.token}`,
        'Client-Id': auth.clientId
    };
    const streamUrl = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`;
    const userUrl = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;

    const [streamResult, userResult] = await Promise.allSettled([
        fetchJson(streamUrl, { headers, timeoutMs: 6000 }),
        fetchJson(userUrl, { headers, timeoutMs: 6000 })
    ]);

    const stream = streamResult.status === 'fulfilled' ? streamResult.value?.data?.[0] : null;
    const user = userResult.status === 'fulfilled' ? userResult.value?.data?.[0] : null;
    if (!stream && !user) return null;

    const status = createDefaultStatus('twitch', id);
    status.owner = stream?.user_name || user?.display_name || status.owner;
    status.avatar = fetchAvatar !== false ? (user?.profile_image_url || status.avatar) : status.avatar;

    if (stream?.type === 'live') {
        status.isLive = true;
        status.title = stream.title || status.title;
        status.heatValue = parseHeatValue(stream.viewer_count || 0);
        status.startTime = parseTimestamp(stream.started_at);
        status.cover = (stream.thumbnail_url || '')
            .replace('{width}', '640')
            .replace('{height}', '360');
    } else {
        status.cover = user?.offline_image_url || status.cover;
    }

    if (user) {
        status._profileFetched = fetchAvatar !== false;
    }
    return status;
}

async function getTwitchAuth(env = {}) {
    const clientId = env.TWITCH_CLIENT_ID;
    const staticToken = env.TWITCH_ACCESS_TOKEN || env.TWITCH_APP_TOKEN;
    if (clientId && staticToken) {
        return {
            clientId,
            token: String(staticToken).replace(/^Bearer\s+/i, '')
        };
    }

    const clientSecret = env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const cacheKey = `${clientId}:${String(clientSecret).slice(0, 8)}`;
    if (
        twitchTokenCache.key === cacheKey &&
        twitchTokenCache.token &&
        twitchTokenCache.expiresAt > Date.now() + 60000
    ) {
        return {
            clientId,
            token: twitchTokenCache.token
        };
    }

    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
    });
    const tokenData = await fetchJson('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: params,
        timeoutMs: 6000,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    if (!tokenData?.access_token) return null;

    twitchTokenCache = {
        key: cacheKey,
        token: tokenData.access_token,
        expiresAt: Date.now() + Math.max(60, tokenData.expires_in ?? 3600) * 1000
    };

    return {
        clientId,
        token: twitchTokenCache.token
    };
}

async function getTwitchDecapiStatus(id, fetchAvatar) {
    const status = createDefaultStatus('twitch', id);
    const channel = encodeURIComponent(String(id).trim().toLowerCase());

    const requests = [
        fetchText(`https://decapi.me/twitch/uptime/${channel}`, { timeoutMs: 6000 }),
        fetchText(`https://decapi.me/twitch/title/${channel}`, { timeoutMs: 3000 }),
        fetchText(`https://decapi.me/twitch/viewers/${channel}`, { timeoutMs: 3000 }),
        fetchAvatar !== false
            ? fetchText(`https://decapi.me/twitch/avatar/${channel}`, { timeoutMs: 3000 })
            : Promise.resolve(null)
    ];

    const [uptimeResult, titleResult, viewersResult, avatarResult] = await Promise.allSettled(requests);
    const uptime = uptimeResult.status === 'fulfilled' ? uptimeResult.value || '' : '';
    if (!uptime) return null;

    const uptimeLower = uptime.toLowerCase();
    const isOffline = uptimeLower.includes('offline') ||
        uptimeLower.includes('not found') ||
        uptimeLower.includes('error') ||
        !/\d+\s*(hour|minute|second)/i.test(uptime);

    status.isLive = !isOffline;
    status.title = titleResult.status === 'fulfilled' ? titleResult.value || '' : '';
    status.heatValue = viewersResult.status === 'fulfilled'
        ? parseHeatValue(viewersResult.value || 0)
        : 0;
    status.avatar = avatarResult.status === 'fulfilled' && avatarResult.value && !avatarResult.value.includes('No user')
        ? avatarResult.value
        : status.avatar;

    if (status.isLive) {
        status.startTime = Date.now() - parseTwitchUptimeMs(uptime);
        status.cover = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-640x360.jpg`;
    }

    return status;
}

function parseTwitchUptimeMs(uptime) {
    if (!uptime) return 0;
    let totalMs = 0;
    const hours = uptime.match(/(\d+)\s*hour/i);
    const minutes = uptime.match(/(\d+)\s*minute/i);
    const seconds = uptime.match(/(\d+)\s*second/i);
    if (hours) totalMs += Number.parseInt(hours[1], 10) * 60 * 60 * 1000;
    if (minutes) totalMs += Number.parseInt(minutes[1], 10) * 60 * 1000;
    if (seconds) totalMs += Number.parseInt(seconds[1], 10) * 1000;
    return totalMs;
}

async function getKickStatus(id) {
    const status = createDefaultStatus('kick', id);
    const data = await fetchJson(`https://kick.com/api/v2/channels/${encodeURIComponent(id)}`, {
        timeoutMs: 7000,
        headers: {
            Accept: 'application/json',
            Referer: 'https://kick.com/'
        }
    });

    if (!data?.user) return null;

    const livestream = data.livestream;
    const user = data.user;
    status.owner = user.username || status.owner;
    status.avatar = user.profile_pic || status.avatar;
    status.isLive = livestream?.is_live === true;

    if (status.isLive && livestream) {
        status.title = livestream.session_title || status.title;
        status.heatValue = parseHeatValue(livestream.viewer_count || 0);
        status.startTime = parseTimestamp(livestream.created_at);
        const thumbnail = livestream.thumbnail?.url ||
            livestream.thumbnail?.src ||
            livestream.thumbnail;
        status.cover = typeof thumbnail === 'string'
            ? thumbnail
            : (user.profile_pic || status.cover);
    } else {
        status.cover = user.profile_pic || status.cover;
    }

    return status;
}

const SUPPORTED_PLATFORMS = new Set(['douyu', 'bilibili', 'twitch', 'kick']);
const STATUS_TIMEOUT_MS = 8000;
const STATUS_CACHE_SECONDS = 20;
const STATUS_CACHE_STALE_SECONDS = 40;
const BATCH_LIMIT = 10;
const BATCH_CONCURRENCY = 4;
const CODETABS_PROXY = {
    name: 'codetabs',
    url: targetUrl => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
};
const ALLORIGINS_RAW_PROXY = {
    name: 'allorigins-raw',
    url: targetUrl => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
};
const BILIBILI_ROOM_BASE_URL = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo';
const BILIBILI_UID_STATUS_URL = 'https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids';
const BILIBILI_INDIVIDUAL_FALLBACK_LIMIT = 4;
const BILIBILI_PROXIES = [
    CODETABS_PROXY,
    ALLORIGINS_RAW_PROXY
];
const DOUYU_PROXIES = [
    CODETABS_PROXY
];
const BILIBILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 LiveRadar/3.1',
    Referer: 'https://live.bilibili.com/',
    Origin: 'https://live.bilibili.com'
};
const DOUYU_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 LiveRadar/3.1',
    Referer: 'https://www.douyu.com/',
    Origin: 'https://www.douyu.com'
};
const KICK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 LiveRadar/3.1',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://kick.com/',
    Origin: 'https://kick.com'
};

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

function timeoutController(timeoutMs, externalSignal = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }
    }
    return {
        signal: controller.signal,
        clear: () => clearTimeout(timeoutId)
    };
}

async function fetchJson(url, options = {}) {
    const result = await fetchJsonResult(url, options);
    return result.ok ? result.data : null;
}

async function fetchJsonResult(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? STATUS_TIMEOUT_MS;
    const timeout = timeoutController(timeoutMs, options.signal);
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

        if (!response.ok) {
            return {
                ok: false,
                error: `http_${response.status}`,
                status: response.status
            };
        }

        const data = await response.json();
        return {
            ok: true,
            data,
            status: response.status
        };
    } catch (error) {
        return {
            ok: false,
            error: error?.name === 'AbortError' ? 'timeout' : 'network_error',
            message: error?.message || ''
        };
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

function canUseStatusCache() {
    return typeof caches !== 'undefined' && caches.default;
}

async function readCachedStatus(context, platform, id, fetchAvatar) {
    if (!canUseStatusCache()) return null;

    const cached = await caches.default.match(cacheRequestFor(context.request, platform, id, fetchAvatar));
    if (!cached) return null;

    const payload = await cached.json();
    return {
        status: payload.status ?? null,
        cache: 'HIT'
    };
}

function writeCachedStatus(context, platform, id, fetchAvatar, status) {
    if (!canUseStatusCache()) return;

    const response = jsonResponse(statusPayload(platform, id, status), {
        headers: {
            'Cache-Control': `public, max-age=${STATUS_CACHE_SECONDS}, stale-while-revalidate=${STATUS_CACHE_STALE_SECONDS}`
        }
    });
    waitFor(context, caches.default.put(cacheRequestFor(context.request, platform, id, fetchAvatar), response));
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
    const cached = await readCachedStatus(context, platform, id, fetchAvatar);
    if (cached) return cached;

    const status = await getPlatformStatus(platform, id, { fetchAvatar, env: context.env ?? {} });
    if (!status) {
        return {
            status: null,
            cache: 'MISS'
        };
    }

    writeCachedStatus(context, platform, id, fetchAvatar, status);

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

    const results = new Array(normalizedRooms.length);
    const bilibiliEntries = [];
    const regularEntries = [];

    normalizedRooms.forEach((room, index) => {
        const entry = { room, index };
        if (room.platform === 'bilibili') {
            bilibiliEntries.push(entry);
        } else {
            regularEntries.push(entry);
        }
    });

    if (bilibiliEntries.length > 0) {
        const bilibiliResults = await fetchBilibiliBatchDataWithCache(
            context,
            bilibiliEntries.map(entry => entry.room)
        );
        bilibiliEntries.forEach((entry, index) => {
            const result = bilibiliResults[index];
            results[entry.index] = {
                ok: !!result.status,
                platform: entry.room.platform,
                id: entry.room.id,
                status: result.status,
                cache: result.cache,
                error: result.status ? null : (result.error || 'fetch_failed')
            };
        });
    }

    const regularResults = await mapWithConcurrency(regularEntries, BATCH_CONCURRENCY, async (entry) => {
        const { room } = entry;
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
    regularEntries.forEach((entry, index) => {
        results[entry.index] = regularResults[index];
    });

    return jsonResponse({
        ok: true,
        results
    }, {
        headers: { 'Cache-Control': 'no-store' }
    });
}

async function fetchBilibiliBatchDataWithCache(context, rooms) {
    const results = new Array(rooms.length);
    const missing = [];

    for (let index = 0; index < rooms.length; index += 1) {
        const room = rooms[index];
        const cached = await readCachedStatus(context, room.platform, room.id, room.fetchAvatar);
        if (cached) {
            results[index] = cached;
        } else {
            missing.push({ room, index });
        }
    }

    if (missing.length === 0) return results;

    const fetched = await getBilibiliBatchStatuses(missing.map(entry => entry.room));
    missing.forEach((entry, fetchedIndex) => {
        const status = fetched[fetchedIndex] ?? null;
        if (status) {
            writeCachedStatus(context, entry.room.platform, entry.room.id, entry.room.fetchAvatar, status);
            results[entry.index] = {
                status,
                cache: 'MISS'
            };
            return;
        }

        results[entry.index] = {
            status: null,
            cache: 'MISS',
            error: 'bilibili_batch_fetch_failed'
        };
    });

    return results;
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

function promiseAny(promises) {
    if (typeof Promise.any === 'function') return Promise.any(promises);

    return new Promise((resolve, reject) => {
        const errors = [];
        let pending = promises.length;
        if (pending === 0) {
            reject(new Error('No promises provided'));
            return;
        }

        promises.forEach((promise, index) => {
            Promise.resolve(promise)
                .then(resolve)
                .catch(error => {
                    errors[index] = error;
                    pending -= 1;
                    if (pending === 0) {
                        const aggregate = new Error('All promises rejected');
                        aggregate.errors = errors;
                        reject(aggregate);
                    }
                });
        });
    });
}

async function firstNonNull(promises) {
    try {
        return await promiseAny(promises.map(promise =>
            Promise.resolve(promise).then(value => {
                if (value) return value;
                throw new Error('empty_result');
            })
        ));
    } catch (_error) {
        return null;
    }
}

async function fetchJsonFromCandidates(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? STATUS_TIMEOUT_MS;
    const directHeaders = options.headers ?? {};
    const proxyHeaders = options.proxyHeaders ?? {};
    const proxies = options.proxies ?? [];
    const attempts = [
        { url, headers: directHeaders },
        ...proxies.map(proxy => ({
            url: proxy.url(url),
            headers: proxyHeaders
        }))
    ];
    const controllers = attempts.map(() => new AbortController());

    const requests = attempts.map((attempt, index) =>
        fetchJsonResult(attempt.url, {
            ...options,
            timeoutMs,
            headers: attempt.headers,
            signal: controllers[index].signal
        }).then(result => {
            if (result.ok && result.data) return result.data;
            throw new Error(result.error || 'fetch_failed');
        })
    );

    try {
        return await promiseAny(requests);
    } catch (_error) {
        return null;
    } finally {
        controllers.forEach(controller => controller.abort());
    }
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
            return getKickStatus(id, options.env);
        default:
            return null;
    }
}

async function getDouyuStatus(id, fetchAvatar) {
    const status = createDefaultStatus('douyu', id);
    const roomId = encodeURIComponent(id);

    const betardData = await fetchDouyuJson(appendCommonQuery(`https://www.douyu.com/betard/${roomId}`));
    if (betardData?.room) {
        const data = betardData.room;
        applyDouyuRoomStatus(status, data);
        if (fetchAvatar && !status.avatar) {
            await attachDouyuAvatar(status, roomId);
        }
        return status;
    }

    const openData = await fetchDouyuJson(`https://open.douyucdn.cn/api/RoomApi/room/${roomId}`, {
        timeoutMs: 4500
    });
    if (openData?.data) {
        applyDouyuOpenStatus(status, openData.data);
        return status;
    }

    const rateData = await fetchDouyuJson(appendCommonQuery(`https://m.douyu.com/api/room/ratestream?rid=${roomId}`), {
        timeoutMs: 4500
    });
    if (rateData?.data) {
        const data = rateData.data;
        const roomInfo = data.roomInfo ?? {};
        const bizAll = data.room_biz_all ?? {};
        applyDouyuRoomStatus(status, {
            videoLoop: roomInfo.videoLoop ?? bizAll.videoLoop,
            show_status: roomInfo.show_status ?? bizAll.show_status,
            room_name: bizAll.room_name || roomInfo.room_name,
            nickname: bizAll.nickname || roomInfo.nickname,
            online: bizAll.online || roomInfo.online,
            room_pic: bizAll.room_pic || roomInfo.room_pic,
            owner_avatar: bizAll.owner_avatar || roomInfo.avatar,
            show_time: bizAll.show_time || roomInfo.show_time
        });
        if (fetchAvatar && !status.avatar) {
            await attachDouyuAvatar(status, roomId);
        }
        return status;
    }

    return null;
}

async function fetchDouyuJson(url, options = {}) {
    return fetchJsonFromCandidates(url, {
        ...options,
        timeoutMs: options.timeoutMs ?? 5000,
        headers: {
            ...DOUYU_HEADERS,
            ...(options.headers ?? {})
        },
        proxyHeaders: options.headers ?? {},
        proxies: DOUYU_PROXIES
    });
}

function applyDouyuRoomStatus(status, data) {
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
}

function applyDouyuOpenStatus(status, data) {
    const isLive = String(data.room_status) === '1';

    status.isReplay = false;
    status.isLive = isLive;
    status.title = data.room_name || status.title;
    status.owner = data.owner_name || status.owner;
    status.heatValue = parseHeatValue(data.hn || data.online || 0);
    status.cover = data.room_thumb || status.cover;
    status.avatar = data.avatar || status.avatar;
    status.startTime = isLive ? parseTimestamp(data.start_time, '+08:00') : null;
    status._profileFetched = !!status.avatar;
}

async function attachDouyuAvatar(status, roomId) {
    const roomData = await fetchDouyuJson(`https://open.douyucdn.cn/api/RoomApi/room/${roomId}`, {
        timeoutMs: 4000
    });
    if (roomData?.data?.avatar) {
        status.avatar = roomData.data.avatar;
        status._profileFetched = true;
    }
}

async function getBilibiliStatus(id, fetchAvatar) {
    const results = await getBilibiliBatchStatuses([{
        id: String(id),
        fetchAvatar
    }]);
    return results[0] ?? null;
}

async function getBilibiliBatchStatuses(rooms) {
    if (!Array.isArray(rooms) || rooms.length === 0) return [];

    const ids = rooms.map(room => String(room.id));
    const baseData = await fetchBilibiliRoomBaseInfo(ids);
    if (!baseData) return rooms.map(() => null);

    const byRoomIds = baseData?.data?.by_room_ids ?? {};
    const statuses = rooms.map(room => {
        const id = String(room.id);
        const data = findBilibiliRoomData(byRoomIds, id);
        if (!data) return null;

        const status = createDefaultStatus('bilibili', id);
        applyBilibiliBaseInfo(status, data);
        return status;
    });

    const roomsNeedingAvatar = rooms
        .map((room, index) => ({ room, index, status: statuses[index] }))
        .filter(entry => entry.status && entry.room.fetchAvatar !== false && entry.status._uid);

    if (roomsNeedingAvatar.length > 0) {
        const uidInfo = await fetchBilibiliUidStatusInfo(roomsNeedingAvatar.map(entry => entry.status._uid));
        if (uidInfo?.data) {
            roomsNeedingAvatar.forEach(entry => {
                const data = uidInfo.data[String(entry.status._uid)];
                if (data) {
                    applyBilibiliUidInfo(entry.status, data, entry.room.fetchAvatar);
                }
            });
        }
    }

    statuses.forEach(status => {
        if (status) delete status._uid;
    });

    const missingEntries = statuses
        .map((status, index) => ({ status, index, room: rooms[index] }))
        .filter(entry => !entry.status);
    if (missingEntries.length > 0) {
        const fallbackEntries = missingEntries.slice(0, BILIBILI_INDIVIDUAL_FALLBACK_LIMIT);
        const fallbackStatuses = await mapWithConcurrency(fallbackEntries, 2, entry =>
            fetchBilibiliInfoStatus(entry.room)
        );
        fallbackEntries.forEach((entry, index) => {
            statuses[entry.index] = fallbackStatuses[index];
        });
    }

    return statuses;
}

async function fetchBilibiliRoomBaseInfo(ids) {
    const url = new URL(BILIBILI_ROOM_BASE_URL);
    ids.forEach(id => url.searchParams.append('room_ids', String(id)));
    url.searchParams.set('req_biz', 'web_room_componet');
    const data = await fetchBilibiliJson(url.toString(), { timeoutMs: 7000 });
    return data?.code === 0 ? data : null;
}

function findBilibiliRoomData(byRoomIds, id) {
    const direct = byRoomIds[id] ?? byRoomIds[Number(id)];
    if (direct) return direct;

    return Object.values(byRoomIds).find(data =>
        String(data?.room_id ?? '') === id || String(data?.short_id ?? '') === id
    ) ?? null;
}

async function fetchBilibiliUidStatusInfo(uids) {
    const url = new URL(BILIBILI_UID_STATUS_URL);
    uids.forEach(uid => url.searchParams.append('uids[]', String(uid)));
    const data = await fetchBilibiliJson(url.toString(), { timeoutMs: 7000 });
    return data?.code === 0 ? data : null;
}

async function fetchBilibiliJson(url, options = {}) {
    return fetchJsonFromCandidates(url, {
        ...options,
        timeoutMs: Math.min(options.timeoutMs ?? 6500, 6500),
        headers: {
            ...BILIBILI_HEADERS,
            ...(options.headers ?? {})
        },
        proxyHeaders: options.headers ?? {},
        proxies: BILIBILI_PROXIES
    });
}

function applyBilibiliBaseInfo(status, data) {
    const liveStatus = data.live_status;
    status.isLive = liveStatus === 1;
    status.isReplay = liveStatus === 2;
    status.title = data.title || status.title;
    status.owner = data.uname || status.owner;
    status.heatValue = parseHeatValue(data.online || 0);
    status.startTime = status.isLive ? parseTimestamp(data.live_time, '+08:00') : null;
    status.cover = data.cover || data.user_cover || data.keyframe || status.cover;
    status._uid = data.uid ? String(data.uid) : '';
}

async function fetchBilibiliInfoStatus(room) {
    const id = String(room.id);
    const info = await fetchBilibiliJson(appendCommonQuery(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${encodeURIComponent(id)}`), {
        timeoutMs: 7000
    });
    if (info?.code !== 0 || !info.data) return null;

    const status = createDefaultStatus('bilibili', id);
    applyBilibiliInfo(status, info.data);

    if (room.fetchAvatar !== false && status._uid) {
        const uidInfo = await fetchBilibiliUidStatusInfo([status._uid]);
        const data = uidInfo?.data?.[String(status._uid)];
        if (data) {
            applyBilibiliUidInfo(status, data, room.fetchAvatar);
        }
    }

    delete status._uid;
    return status;
}

function applyBilibiliInfo(status, data) {
    const liveStatus = data.live_status;
    status.isLive = liveStatus === 1;
    status.isReplay = liveStatus === 2;
    status.title = data.title || status.title;
    status.heatValue = parseHeatValue(data.online || 0);
    status.startTime = status.isLive ? parseTimestamp(data.live_time, '+08:00') : null;
    status.cover = data.keyframe || data.user_cover || status.cover;
    status._uid = data.uid ? String(data.uid) : '';
}

function applyBilibiliUidInfo(status, data, fetchAvatar) {
    const liveStatus = data.live_status;
    status.isLive = liveStatus === 1;
    status.isReplay = liveStatus === 2;
    status.title = data.title || status.title;
    status.owner = data.uname || status.owner;
    status.heatValue = parseHeatValue(data.online ?? status.heatValue);
    status.startTime = status.isLive ? parseTimestamp(data.live_time, '+08:00') : null;
    status.cover = data.keyframe || data.cover_from_user || status.cover;

    if (fetchAvatar !== false) {
        status.avatar = data.face || status.avatar;
        status._profileFetched = !!status.avatar || status._profileFetched;
    }
}

async function getTwitchStatus(id, fetchAvatar, env) {
    const candidates = [getTwitchDecapiStatus(id, fetchAvatar)];
    if (hasTwitchCredentials(env)) {
        candidates.unshift(getTwitchHelixStatus(id, fetchAvatar, env));
    }

    return firstNonNull(candidates);
}

function hasTwitchCredentials(env = {}) {
    return !!(
        env.TWITCH_CLIENT_ID &&
        (env.TWITCH_ACCESS_TOKEN || env.TWITCH_APP_TOKEN || env.TWITCH_CLIENT_SECRET)
    );
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

async function getKickStatus(id, env = {}) {
    const officialStatus = await getKickOfficialStatus(id, env);
    if (officialStatus) return officialStatus;

    const status = createDefaultStatus('kick', id);
    const data = await fetchKickInternalJson(id);

    if (!data?.user || data.error) return null;

    applyKickInternalStatus(status, data);
    return status;
}

async function getKickOfficialStatus(id, env = {}) {
    const token = getKickAccessToken(env);
    if (!token) return null;

    const data = await fetchJson(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(id)}`, {
        timeoutMs: 6000,
        headers: {
            Authorization: `Bearer ${String(token).replace(/^Bearer\s+/i, '')}`,
            Accept: 'application/json'
        }
    });

    const channel = Array.isArray(data?.data)
        ? data.data[0]
        : (data?.channel ?? data?.data);
    if (!channel) return null;

    const status = createDefaultStatus('kick', id);
    applyKickOfficialStatus(status, channel);
    return status;
}

function getKickAccessToken(env = {}) {
    return env.KICK_ACCESS_TOKEN ||
        env.KICK_APP_TOKEN ||
        env.KICK_BEARER_TOKEN ||
        env.KICK_API_TOKEN ||
        '';
}

async function fetchKickInternalJson(id) {
    const url = `https://kick.com/api/v2/channels/${encodeURIComponent(id)}`;
    return fetchJsonFromCandidates(url, {
        timeoutMs: 6500,
        headers: KICK_HEADERS,
        proxyHeaders: {
            Accept: 'application/json, text/plain, */*'
        },
        proxies: [
            CODETABS_PROXY,
            ALLORIGINS_RAW_PROXY
        ]
    });
}

function applyKickInternalStatus(status, data) {
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
}

function applyKickOfficialStatus(status, channel) {
    const stream = channel.stream ?? channel.livestream;
    const user = channel.user ?? {};

    status.owner = channel.slug ||
        channel.username ||
        user.username ||
        status.owner;
    status.avatar = user.profile_pic ||
        user.profile_picture ||
        channel.profile_picture ||
        channel.profile_image ||
        channel.banner_picture ||
        status.avatar;
    status.isLive = stream?.is_live === true || channel.is_live === true;

    if (status.isLive && stream) {
        status.title = stream.session_title ||
            stream.title ||
            channel.stream_title ||
            status.title;
        status.heatValue = parseHeatValue(stream.viewer_count ?? stream.viewers ?? 0);
        status.startTime = parseTimestamp(stream.start_time || stream.created_at);
        status.cover = stream.thumbnail ||
            stream.thumbnail_url ||
            stream.url ||
            channel.banner_picture ||
            status.avatar ||
            status.cover;
    } else {
        status.title = channel.stream_title || status.title;
        status.cover = channel.banner_picture ||
            status.avatar ||
            status.cover;
    }
}

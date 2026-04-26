function getHeader(headers, name) {
    const lowerName = name.toLowerCase();
    return headers?.[name] ?? headers?.[lowerName] ?? '';
}

function getEventUrl(event) {
    if (event.rawUrl) return event.rawUrl;

    const headers = event.headers ?? {};
    const protocol = getHeader(headers, 'x-forwarded-proto') || 'https';
    const host = getHeader(headers, 'host') || 'localhost';
    const path = event.path || '/';
    const query = event.rawQuery ? `?${event.rawQuery}` : '';
    return `${protocol}://${host}${path}${query}`;
}

function getEventBody(event) {
    const method = String(event.httpMethod || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || !event.body) return undefined;

    if (event.isBase64Encoded && globalThis.Buffer) {
        return globalThis.Buffer.from(event.body, 'base64');
    }

    return event.body;
}

async function toNetlifyResponse(response) {
    const headers = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });

    return {
        statusCode: response.status,
        headers,
        body: await response.text()
    };
}

export function createNetlifyHandler(pagesHandler) {
    return async function handler(event) {
        const request = new Request(getEventUrl(event), {
            method: event.httpMethod || 'GET',
            headers: new Headers(event.headers ?? {}),
            body: getEventBody(event)
        });

        const response = await pagesHandler({
            request,
            env: globalThis.process?.env ?? {}
        });

        return toNetlifyResponse(response);
    };
}

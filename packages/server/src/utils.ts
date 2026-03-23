import { IncomingMessage, ServerResponse } from 'http';

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
}

export function readBody(request: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
            } catch (err) {
                reject(err);
            }
        });
        request.on('error', reject);
    });
}

export function parseQueryString(url: string): Record<string, string> {
    const idx = url.indexOf('?');
    if (idx === -1) return {};
    return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)));
}

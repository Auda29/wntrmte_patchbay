import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { Store } from '@patchbay/core';

const continueConversation = vi.fn();

vi.mock('./runtime', () => ({
    createConfiguredOrchestrator: vi.fn(() => ({
        continueConversation,
    })),
}));

describe('createServer', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patchbay-server-test-'));
        const store = new Store(tmpDir);
        store.init({ name: 'Test Project', goal: 'Test standalone server' });
        continueConversation.mockReset();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('handles POST /reply by delegating to continueConversation', async () => {
        const run = {
            id: 'RUN-1',
            taskId: 'TASK-1',
            runner: 'codex',
            startTime: '2026-03-20T10:00:00.000Z',
            status: 'completed',
            conversationId: 'conv-1',
            turnIndex: 1,
        };
        continueConversation.mockResolvedValue(run);

        const { createServer } = await import('./server');
        const server = await createServer({ repoRoot: tmpDir });

        try {
            await new Promise<void>((resolve) => server.listen(0, resolve));
            const address = server.address() as AddressInfo;

            const response = await fetch(`http://127.0.0.1:${address.port}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: 'conv-1',
                    message: 'Here is the missing info',
                    runnerId: 'codex',
                }),
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual(run);
            expect(continueConversation).toHaveBeenCalledWith('conv-1', 'Here is the missing info', 'codex');
        } finally {
            await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
        }
    });

    it('returns 400 for invalid /reply payloads', async () => {
        const { createServer } = await import('./server');
        const server = await createServer({ repoRoot: tmpDir });

        try {
            await new Promise<void>((resolve) => server.listen(0, resolve));
            const address = server.address() as AddressInfo;

            const response = await fetch(`http://127.0.0.1:${address.port}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: 'conv-1' }),
            });

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: 'Missing conversationId or message' });
            expect(continueConversation).not.toHaveBeenCalled();
        } finally {
            await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
        }
    });

    it('serves persistent sessions via GET /sessions', async () => {
        const store = new Store(tmpDir);
        store.saveSession({
            id: 'session-001',
            taskId: 'TASK-1',
            connectorId: 'claude-code',
            status: 'completed',
            startTime: '2026-03-24T10:00:00.000Z',
            endTime: '2026-03-24T10:05:00.000Z',
            title: 'Investigate list repo items',
            lastEventAt: '2026-03-24T10:05:00.000Z',
        });

        const { createServer } = await import('./server');
        const server = await createServer({ repoRoot: tmpDir });

        try {
            await new Promise<void>((resolve) => server.listen(0, resolve));
            const address = server.address() as AddressInfo;

            const response = await fetch(`http://127.0.0.1:${address.port}/sessions`);

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual([
                expect.objectContaining({
                    id: 'session-001',
                    connectorId: 'claude-code',
                }),
            ]);
        } finally {
            await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
        }
    });
});

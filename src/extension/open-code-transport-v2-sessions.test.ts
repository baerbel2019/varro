/* oxlint-disable anti-slop/no-module-mocking -- Exercise response budgets without a VS Code logging host. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SessionInfo } from '@opencode/client';
import { OpenCodeTransport } from './open-code-transport';
import { OpenCodeV2SessionState } from './opencode-v2-session-state';

vi.mock('./logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('v2 session response budgets', () => {
  const options = { maxResponseBytes: 16 * 1024, maxProjectedResponseBytes: 4096 };

  async function fixture() {
    const parent = resolve('artifacts/ai-test-data');
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(join(parent, 'session-response-budget-'));
    directories.push(directory);
    const state = new OpenCodeV2SessionState(directory);
    const sessions: SessionInfo[] = Array.from({ length: 2 }, (_, index) => ({
      id: `ses_${index}`,
      parentID: 'ses_parent',
      title: `Session ${index}`,
      projectID: 'project',
      location: { directory: '/repo' },
      time: { created: 1, updated: 2 },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }));
    const generationTiming = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [
        `msg_${index}:text:0`,
        { start: 1, end: 2, textHash: 'a'.repeat(64), startSequence: index },
      ])
    );
    for (const session of sessions) {
      await state.update(session.id, {
        metadata: { label: 'kept' },
        time: { updated: 3 },
        generationTiming,
      });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname;
        if (path === '/global/health') return Response.json({ healthy: true, version: '2.1.4' });
        if (path === '/api/session')
          return Response.json({ data: sessions, cursor: { next: 'older' } });
        if (path === '/api/session/ses_0') return Response.json({ data: sessions[0] });
        throw new Error(`Unexpected request: ${path}`);
      })
    );
    const client = new OpenCodeTransport({
      sessionStateDirectory: directory,
      getUrl: () => 'http://localhost:4096',
      getWorkspaceCwd: () => undefined,
      getStatus: () => ({ state: 'running', url: 'http://localhost:4096', eventStream: 'healthy' }),
      isDisposing: () => false,
      updateEventStreamState: vi.fn(),
      emitEvent: vi.fn(),
    });
    expect(await client.checkHealth()).toBe(true);
    return { client, sessions, directory, generationTiming };
  }

  it.each([
    '/session?limit=2',
    '/experimental/session?limit=1000000',
    '/session/ses_parent/children',
    '/session/ses_0',
  ])('keeps private timing out of %s without changing stored annotations', async (path) => {
    const { client, directory, generationTiming } = await fixture();
    const annotationPath = join(directory, 'ses_0.json');
    const before = await readFile(annotationPath, 'utf8');
    expect(Buffer.byteLength(before)).toBeGreaterThan(options.maxProjectedResponseBytes);

    const result: unknown = await client.request('GET', path, undefined, options);
    const sessions = Array.isArray(result) ? result : [result];
    expect(sessions).toHaveLength(path === '/session/ses_0' ? 1 : 2);
    for (const session of sessions) {
      expect(session).toMatchObject({
        parentID: 'ses_parent',
        directory: '/repo',
        version: '2',
        metadata: { label: 'kept' },
        time: { created: 1, updated: 3 },
      });
      expect(session).not.toHaveProperty('generationTiming');
    }
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(
      options.maxProjectedResponseBytes
    );
    expect(await readFile(annotationPath, 'utf8')).toBe(before);
    expect(JSON.parse(before)).toMatchObject({ generationTiming });
  });

  it('preserves pagination cursors while excluding private timing', async () => {
    const { client } = await fixture();
    const result = await client.request('GET', '/session?limit=2', undefined, {
      ...options,
      captureNextCursor: true,
    });
    expect(result).toMatchObject({ nextCursor: 'older', data: [{ id: 'ses_0' }, { id: 'ses_1' }] });
    expect(JSON.stringify(result)).not.toContain('generationTiming');
  });

  it('still rejects public session data above the projected budget', async () => {
    const { client, sessions } = await fixture();
    sessions[0]!.title = 'x'.repeat(options.maxProjectedResponseBytes);
    await expect(
      client.request('GET', '/experimental/session?limit=1000000', undefined, options)
    ).rejects.toThrow('4096-byte safety limit');
  });
});

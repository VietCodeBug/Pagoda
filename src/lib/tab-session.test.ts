import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabSession } from './tab-session';

function fixture(reverse = false) {
  let sequence = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(reverse ? 1000 - ++sequence : ++sequence).padStart(12, '0')}`;
  const channels = new Set<ReturnType<typeof makeChannel>>();
  function makeChannel() {
    const channel = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      postMessage(data: unknown) {
        for (const receiver of channels) if (receiver !== channel) {
          setTimeout(() => { if (channels.has(receiver)) receiver.onmessage?.({ data } as MessageEvent); }, 0);
        }
      },
      close() { channels.delete(channel); },
    };
    channels.add(channel);
    return channel;
  }
  function tab(initial: Map<string, string> = new Map(), coordinated = true, reload = false) {
    const values = new Map(initial);
    const session = createTabSession({
      uuid, reload,
      storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
      ...(coordinated ? { createChannel: makeChannel } : {}),
    });
    return { session, values };
  }
  async function acquire(session: ReturnType<typeof createTabSession>) {
    const pending = session.acquire();
    await vi.advanceTimersByTimeAsync(130);
    return pending;
  }
  return { tab, acquire };
}

afterEach(() => vi.useRealTimers());
describe('tab reconnect identity', () => {
  it('reuses the same identity for socket reconnects and a reload after the old document leaves', async () => {
    vi.useFakeTimers();
    const { tab, acquire } = fixture();
    const first = tab();
    const id = await acquire(first.session);
    expect(await first.session.acquire()).toBe(id);
    first.session.release();
    expect(await acquire(tab(first.values, true, true).session)).toBe(id);
  });

  it('separates a duplicated tab that inherited sessionStorage from a live owner', async () => {
    vi.useFakeTimers();
    const { tab, acquire } = fixture();
    const first = tab();
    const id = await acquire(first.session);
    const duplicate = tab(first.values);
    expect(await acquire(duplicate.session)).not.toBe(id);
    expect(await first.session.acquire()).toBe(id);
  });

  it.each([false, true])('separates simultaneous probes in either UUID ordering (%s)', async reverse => {
    vi.useFakeTimers();
    const { tab, acquire } = fixture(reverse);
    const original = tab();
    await acquire(original.session);
    original.session.release();
    const first = tab(original.values);
    const second = tab(original.values);
    const ids = [first.session.acquire(), second.session.acquire()];
    await vi.advanceTimersByTimeAsync(130);
    const [a, b] = await Promise.all(ids);
    expect(a).not.toBe(b);
  });

  it('rechecks ownership after a frozen page resumes', async () => {
    vi.useFakeTimers();
    const { tab, acquire } = fixture();
    const first = tab();
    const id = await acquire(first.session);
    first.session.release();
    const duplicate = tab(first.values);
    expect(await acquire(duplicate.session)).toBe(id);
    expect(await acquire(first.session)).not.toBe(id);
  });

  it('falls back to stored identity only for reload when BroadcastChannel is unavailable', async () => {
    vi.useFakeTimers();
    const { tab, acquire } = fixture();
    const original = tab(new Map(), false);
    const id = await acquire(original.session);
    expect(await acquire(tab(original.values, false, true).session)).toBe(id);
    expect(await acquire(tab(original.values, false, false).session)).not.toBe(id);
  });

  it('keeps an in-memory identity when storage and channel access are denied', async () => {
    let next = 0;
    const session = createTabSession({
      uuid: () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
      reload: false,
      storage: { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } },
      createChannel() { throw new Error('Denied'); },
    });
    expect(await session.acquire()).toBe(await session.acquire());
  });
});

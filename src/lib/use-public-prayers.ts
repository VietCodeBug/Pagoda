'use client';
import { useCallback, useEffect, useState } from 'react';
import { createRealtimeClient, QueryRefreshController, type SealedLiveQuery } from '@neon/realtime/client';
import { publicPrayerRows, type PublicPrayer, type PrayerStreamStatus } from './prayer-stream';

type LiveQueryResponse = { url: string; sealedQuery: SealedLiveQuery<PublicPrayer> };
type PrayerJournal = { prayers: PublicPrayer[]; status: PrayerStreamStatus; message: string };

async function requestLiveQuery(signal: AbortSignal): Promise<LiveQueryResponse> {
  const response = await fetch('/api/prayers/live-query', { method: 'POST', signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Live journal unavailable');
  const result = await response.json() as LiveQueryResponse;
  if (typeof result.url !== 'string' || !result.sealedQuery || typeof result.sealedQuery.capability !== 'string' || typeof result.sealedQuery.queryFingerprint !== 'string' || !Number.isFinite(result.sealedQuery.expiresAt)) throw new Error('Invalid live journal response');
  return result;
}

/** Opens a direct Neon subscription only while the journal is visible. */
export function usePublicPrayers(enabled: boolean): PrayerJournal & { refresh: () => void } {
  const [journal, setJournal] = useState<PrayerJournal>({ prayers: [], status: 'connecting', message: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(current => current + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let disposed = false;
    let client: ReturnType<typeof createRealtimeClient> | undefined;
    let stopRefresh: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let removeListener: (() => void) | undefined;
    setJournal({ prayers: [], status: 'connecting', message: '' });

    // The existing HTTP read stays usable when Realtime is not configured or is down.
    // This is a single initial read, not polling presented as a live subscription.
    void fetch('/api/prayers', { signal: abort.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!disposed) setJournal(current => current.status === 'live' ? current : { ...current, prayers: publicPrayerRows(data.prayers) });
    }).catch(() => {});

    void (async () => {
      try {
        const initial = await requestLiveQuery(abort.signal);
        if (disposed) return;
        client = createRealtimeClient({ url: initial.url, logLevel: 'silent' });
        const subscription = client.subscribe(initial.sealedQuery);
        unsubscribe = () => subscription.unsubscribe();
        const refresh = new QueryRefreshController({
          query: initial.sealedQuery,
          subscription,
          refreshQuery: async () => {
            const replacement = await requestLiveQuery(abort.signal);
            if (replacement.url !== initial.url) throw new Error('Live journal endpoint changed');
            return replacement.sealedQuery;
          },
          renewSubscription: query => subscription.renew(query),
          onRefreshExhausted: () => {
            if (!disposed) setJournal(current => ({ ...current, status: 'unavailable', message: 'Cập nhật trực tiếp đang tạm ngắt. Đóng và mở lại sổ để thử lại.' }));
          },
        });
        stopRefresh = () => refresh.stop();
        removeListener = subscription.onChange(snapshot => {
          if (disposed) return;
          const status: PrayerStreamStatus = snapshot.status === 'live' ? 'live' : snapshot.status === 'connecting' ? 'connecting' : snapshot.status === 'stale' ? 'reconnecting' : 'unavailable';
          setJournal(current => ({
            prayers: snapshot.data === undefined ? current.prayers : publicPrayerRows(snapshot.data),
            status,
            message: status === 'unavailable' ? 'Cập nhật trực tiếp đang tạm ngắt. Đóng và mở lại sổ để thử lại.' : '',
          }));
        });
        refresh.start();
      } catch {
        if (!disposed) setJournal(current => ({ ...current, status: 'unavailable', message: 'Sổ đang hiển thị dữ liệu đã tải. Cập nhật trực tiếp chưa sẵn sàng.' }));
      }
    })();
    return () => {
      disposed = true;
      abort.abort();
      stopRefresh?.();
      removeListener?.();
      unsubscribe?.();
      client?.close();
    };
  }, [enabled, revision]);
  return { ...journal, refresh };
}

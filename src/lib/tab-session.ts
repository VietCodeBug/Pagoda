const STORAGE_KEY = 'vto:tab-client-id';
const CHANNEL_NAME = 'vto:tab-presence';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PresenceMessage = { type: 'probe' | 'occupied'; clientId: string; documentId: string; target?: string };
type PresenceChannel = {
  onmessage: ((event: MessageEvent<PresenceMessage>) => void) | null;
  postMessage(message: PresenceMessage): void;
  close(): void;
};
type TabEnvironment = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  createChannel?: () => PresenceChannel;
  uuid: () => string;
  reload: boolean;
};

/** A reconnect identity belongs to one tab, even when its guest cookie is shared. */
export function createTabSession(environment: TabEnvironment) {
  let clientId: string | undefined;
  let channel: PresenceChannel | undefined;
  let pending: Promise<string> | undefined;
  let owner = false;
  let generation = 0;
  const documentId = environment.uuid();
  const persist = () => {
    try { environment.storage.setItem(STORAGE_KEY, clientId!); } catch { /* Private mode can deny storage. */ }
  };
  const fresh = () => { clientId = environment.uuid(); persist(); };

  return {
    acquire(): Promise<string> {
      if (owner) return Promise.resolve(clientId!);
      if (pending) return pending;
      if (!clientId) {
        try {
          const stored = environment.storage.getItem(STORAGE_KEY);
          if (stored && UUID.test(stored)) clientId = stored;
        } catch { /* An in-memory identity still survives socket reconnects. */ }
        // Without tab coordination, only an actual reload may reuse stored identity.
        if (!clientId || (!environment.createChannel && !environment.reload)) fresh();
      }
      try { channel = environment.createChannel?.(); } catch {
        if (!environment.reload) fresh();
      }
      if (!channel) {
        owner = true;
        persist();
        return Promise.resolve(clientId!);
      }
      const currentChannel = channel;
      const version = ++generation;
      currentChannel.onmessage = ({ data }) => {
        if (version !== generation || data?.clientId !== clientId || data.documentId === documentId) return;
        if (data.type === 'probe') {
          // Existing owners win. Simultaneous new documents break a tie consistently.
          if (owner || documentId < data.documentId) {
            currentChannel.postMessage({ type: 'occupied', clientId: clientId!, documentId, target: data.documentId });
          } else fresh();
        } else if (data.type === 'occupied' && data.target === documentId && !owner) fresh();
      };
      pending = new Promise(resolve => {
        currentChannel.postMessage({ type: 'probe', clientId: clientId!, documentId });
        setTimeout(() => {
          if (version === generation) { owner = true; pending = undefined; persist(); }
          resolve(clientId!);
        }, 120);
      });
      return pending;
    },
    release() {
      generation++;
      owner = false;
      pending = undefined;
      channel?.close();
      channel = undefined;
    },
  };
}

let tabSession: ReturnType<typeof createTabSession> | undefined;
export function getTabSession() {
  if (!tabSession) {
    // This accessor is called from an effect, never while rendering server HTML.
    const storage = { getItem: (key: string) => window.sessionStorage.getItem(key), setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value) };
    tabSession = createTabSession({
      storage,
      uuid: () => crypto.randomUUID(),
      reload: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload',
      ...('BroadcastChannel' in window ? { createChannel: () => new BroadcastChannel(CHANNEL_NAME) } : {}),
    });
  }
  return tabSession;
}

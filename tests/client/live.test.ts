import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveClient } from '../../src/client/platform/live.ts';
import { PING } from '../../src/shared/platform/protocol.ts';

/** WebSocket factice pilotable depuis le test. */
class FakeSocket extends EventTarget {
  static instances: FakeSocket[] = [];
  readyState: number = WebSocket.CONNECTING;
  readonly sent: string[] = [];
  readonly url: string;

  constructor(url: string) {
    super();
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}

const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1] as FakeSocket;

describe('LiveClient', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const create = () => new LiveClient((url) => new FakeSocket(url) as unknown as WebSocket, 'wss://host');

  it('se connecte avec le jeton et renvoie l’activité courante à l’ouverture', () => {
    const live = create();
    live.setActivity({ type: 'activity', game: 'fioles', key: 'c:1', state: 'ab', value: 1 });
    live.connect('tok en');
    expect(latest().url).toBe('wss://host/api/live?token=tok%20en');
    latest().open();
    expect(JSON.parse(latest().sent[0] ?? '')).toMatchObject({ type: 'activity', key: 'c:1' });
  });

  it('mémorise la présence et prévient les abonnés', () => {
    const live = create();
    const listener = vi.fn();
    live.subscribe(listener);
    live.connect('t');
    latest().open();
    const online = [{ player: 'abc123', name: 'A', game: null, key: null, state: null, value: 0 }];
    latest().receive({ type: 'presence', online });
    latest().receive({ type: 'inconnu' });
    expect(live.presence).toEqual(online);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('envoie un ping régulier', () => {
    const live = create();
    live.connect('t');
    latest().open();
    vi.advanceTimersByTime(25_000);
    expect(latest().sent).toContain(PING);
  });

  it('se reconnecte après une coupure, avec un délai croissant', () => {
    const live = create();
    live.connect('t');
    latest().close();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    latest().close();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('ne se reconnecte pas après une déconnexion volontaire', () => {
    const live = create();
    live.connect('t');
    live.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(live.presence).toEqual([]);
  });
});

// Coquille de l'application : session, langue, navigation entre écrans, branchement du temps réel.

import { isAvatar } from '../../shared/platform/avatars.ts';
import type { Account, ServerMessage, SessionResponse } from '../../shared/platform/protocol.ts';
import { isId, isRecord } from '../../shared/platform/validate.ts';
import { findClientGame } from '../games/registry.ts';
import { ApiClient } from './api.ts';
import { setAvatar, setAvatars } from './avatar.ts';
import { ChatStore } from './chat.ts';
import type { AppContext, ScreenHandle } from './context.ts';
import { detectLang, isLang, type Lang } from './i18n.ts';
import type { Installer } from './install.ts';
import { LiveClient } from './live.ts';
import { formatRoute, type GameRoute, parseRoute, type Route } from './router.ts';
import { mountGame } from './screens/game.ts';
import { mountHub } from './screens/hub.ts';
import { mountLogin } from './screens/login.ts';
import { mountPlay } from './screens/play.ts';
import { mountPlayer } from './screens/player.ts';
import { mountRun } from './screens/run.ts';
import { createLocalStore, type LocalStore } from './storage.ts';
import { PLATFORM_STRINGS } from './strings.ts';
import { closeModals, showAppName } from './ui.ts';

const SESSION_KEY = 'session';
const LANG_KEY = 'lang';

export function parseSession(raw: unknown): SessionResponse | null {
  if (!isRecord(raw) || typeof raw['token'] !== 'string' || !isRecord(raw['player'])) return null;
  const { id, name, created, login = name, avatar = null } = raw['player'];
  if (!isId(id) || typeof name !== 'string' || typeof created !== 'number' || typeof login !== 'string') return null;
  // Une session enregistrée sans identifiant l'a été quand il valait toujours le pseudo, et sans animal
  // quand il n'existait pas ; `me()` relit l'un et l'autre au démarrage de la session.
  return { token: raw['token'], player: { id, name, created, login, avatar: isAvatar(avatar) ? avatar : null } };
}

/** Clé de jeu concernée par une route (pour savoir quel écran recharger). */
const routeGame = (route: Route): string | null => ('game' in route ? route.game : null);

export interface AppDependencies {
  root: HTMLElement;
  storage: Storage | null;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  createSocket: (url: string) => WebSocket;
  socketBase: string;
  languages: readonly string[];
  installer: Installer;
}

export class App {
  private readonly root: HTMLElement;
  private readonly store: LocalStore;
  private readonly api: ApiClient;
  private readonly live: LiveClient;
  private readonly installer: Installer;
  private chat: ChatStore | null = null;
  private lang: Lang;
  private session: SessionResponse | null;
  private screen: ScreenHandle | null = null;
  private route: Route = { name: 'hub' };

  constructor(deps: AppDependencies) {
    this.root = deps.root;
    this.store = createLocalStore(deps.storage);
    this.api = new ApiClient(deps.fetch);
    this.live = new LiveClient(deps.createSocket, deps.socketBase);
    this.installer = deps.installer;
    this.lang = this.store.get(LANG_KEY, (v) => (isLang(v) ? v : null)) ?? detectLang(deps.languages);
    this.session = this.store.get(SESSION_KEY, parseSession);
    this.api.onUnauthorized(() => this.endSession());
    this.live.subscribe((message) => this.onLiveMessage(message));
  }

  start(): void {
    window.addEventListener('hashchange', () => this.show());
    if (this.session) this.beginSession(this.session);
    this.show();
  }

  private beginSession(session: SessionResponse): void {
    this.session = session;
    this.store.set(SESSION_KEY, session);
    this.api.setToken(session.token);
    this.live.connect(session.token);
    this.chat = new ChatStore(this.api, this.store, session.player.id);
    void this.chat.load().catch(() => undefined);
    setAvatar(session.player.id, session.player.avatar);
    this.refreshPlayers();
    void this.api
      .me()
      .then((me) => this.updateMe(me))
      .catch(() => undefined);
  }

  private endSession(): void {
    this.session = null;
    this.chat = null;
    this.store.remove(SESSION_KEY);
    this.api.setToken(null);
    this.live.disconnect();
    this.navigate({ name: 'login' });
  }

  private updateMe(me: Account): void {
    if (!this.session) return;
    this.session = { ...this.session, player: me };
    this.store.set(SESSION_KEY, this.session);
    setAvatar(me.id, me.avatar);
  }

  /** Relit la liste des joueurs pour l'annuaire des avatars, puis fait redessiner l'écran, même en cas d'échec. */
  private refreshPlayers(): void {
    void this.api
      .players()
      .then(setAvatars)
      .catch(() => undefined)
      .finally(() => this.screen?.onDataChanged?.());
  }

  private navigate(route: Route): void {
    const hash = formatRoute(route);
    if (window.location.hash === hash) this.show();
    else window.location.hash = hash;
  }

  private context(me: Account): AppContext {
    if (!this.chat) throw new Error('salon indisponible');
    return {
      api: this.api,
      live: this.live,
      chat: this.chat,
      installer: this.installer,
      lang: this.lang,
      t: PLATFORM_STRINGS[this.lang],
      me,
      navigate: (route) => this.navigate(route),
      setLang: (lang) => this.setLang(lang),
      setMe: (player) => {
        this.updateMe(player);
        this.show();
      },
      logout: async () => {
        await this.api.logout().catch(() => undefined);
        this.endSession();
      },
    };
  }

  private setLang(lang: Lang): void {
    this.lang = lang;
    this.store.set(LANG_KEY, lang);
    this.show();
  }

  /** Monte l'écran correspondant au hash courant. */
  private show(): void {
    this.screen?.dispose?.();
    this.screen = null;
    closeModals();
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'fr';
    showAppName(PLATFORM_STRINGS[this.lang].appName);
    const route = parseRoute(window.location.hash) ?? { name: 'hub' };
    this.route = route;
    window.scrollTo(0, 0);

    if (!this.session) {
      mountLogin(this.root, {
        api: this.api,
        t: PLATFORM_STRINGS[this.lang],
        lang: this.lang,
        onSession: (session) => {
          this.beginSession(session);
          this.navigate({ name: 'hub' });
        },
        onSwitchLang: () => this.setLang(this.lang === 'fr' ? 'zh' : 'fr'),
      });
      return;
    }

    this.screen = this.mountRoute(route, this.context(this.session.player));
  }

  private mountRoute(route: Route, ctx: AppContext): ScreenHandle {
    switch (route.name) {
      case 'login':
      case 'hub':
        return mountHub(this.root, ctx);
      case 'run':
        return mountRun(this.root, ctx, route.run);
      case 'game':
      case 'player':
      case 'play':
        return this.mountGameRoute(route, ctx);
    }
  }

  /** Écrans propres à un jeu ; un jeu inconnu renvoie à l'accueil. */
  private mountGameRoute(route: GameRoute, ctx: AppContext): ScreenHandle {
    const game = findClientGame(route.game);
    if (!game) return mountHub(this.root, ctx);
    switch (route.name) {
      case 'game':
        return mountGame(this.root, ctx, game);
      case 'player':
        return mountPlayer(this.root, ctx, game, route.player);
      case 'play':
        return mountPlay(this.root, ctx, game, route.key);
    }
  }

  private onLiveMessage(message: ServerMessage): void {
    if (message.type === 'presence') {
      this.screen?.onPresenceChanged?.();
      return;
    }
    if (message.type === 'reaction') {
      this.screen?.onReaction?.(message.reaction);
      return;
    }
    if (message.type === 'chat') {
      this.chat?.receive(message.message);
      return;
    }
    if (message.type === 'voice') {
      this.chat?.receiveVoice(message.note);
      return;
    }
    if (message.type === 'race_voice') {
      this.screen?.onRaceVoice?.(message.note);
      return;
    }
    if (message.type === 'race_voice_read') {
      this.screen?.onRaceVoiceRead?.(message.read);
      return;
    }
    if (message.type === 'race_voice_gone') {
      this.screen?.onRaceVoiceGone?.(message.id);
      return;
    }
    // Un changement de joueurs (inscription, pseudo, animal) passe par l'annuaire avant de redessiner.
    if (message.game === null) {
      this.refreshPlayers();
      return;
    }
    const game = routeGame(this.route);
    if (game === null || message.game === game) this.screen?.onDataChanged?.();
  }
}

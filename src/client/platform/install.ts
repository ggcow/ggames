// Installation de l'application sur l'écran d'accueil.

/** Événement `beforeinstallprompt` de Chromium : non standard, donc absent des types du DOM. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

const isInstallPromptEvent = (event: Event): event is InstallPromptEvent =>
  'prompt' in event && typeof event.prompt === 'function';

/**
 * Façon d'installer l'application depuis le navigateur courant : déjà installée, fenêtre d'installation du
 * navigateur, ou instructions (Safari iOS, WeChat qui n'installe rien, Chrome ou Edge sur ordinateur, Firefox sur
 * ordinateur qui n'installe rien, menu d'un autre navigateur).
 */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'wechat' | 'chrome' | 'edge' | 'firefox' | 'menu';

export interface InstallEnvironment {
  readonly userAgent: string;
  /** L'application tourne déjà depuis l'écran d'accueil. */
  readonly standalone: boolean;
}

export function installMode(env: InstallEnvironment, canPrompt: boolean): InstallMode {
  if (env.standalone) return 'installed';
  if (/MicroMessenger/i.test(env.userAgent)) return 'wechat';
  if (canPrompt) return 'prompt';
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return 'ios';
  // Sur téléphone, le menu des navigateurs propose l'écran d'accueil ; sur ordinateur, chacun a son chemin.
  if (/Android|Mobile/.test(env.userAgent)) return 'menu';
  if (/Firefox\//.test(env.userAgent)) return 'firefox';
  if (/Edg\//.test(env.userAgent)) return 'edge';
  if (/Chrome\//.test(env.userAgent) && !/OPR\//.test(env.userAgent)) return 'chrome';
  return 'menu';
}

/** Suit ce que le navigateur permet pour installer l'application. */
export class Installer {
  private readonly env: InstallEnvironment;
  private pending: InstallPromptEvent | null = null;
  private installed = false;
  private readonly listeners = new Set<() => void>();

  constructor(env: InstallEnvironment) {
    this.env = env;
  }

  /** Écoute la fenêtre dès le chargement : Chromium envoie `beforeinstallprompt` une seule fois, très tôt. */
  listen(target: EventTarget): void {
    target.addEventListener('beforeinstallprompt', (event) => {
      if (!isInstallPromptEvent(event)) return;
      // Garde l'invitation pour le bouton de l'accueil au lieu du bandeau automatique du navigateur.
      event.preventDefault();
      this.pending = event;
      this.notify();
    });
    target.addEventListener('appinstalled', () => {
      this.installed = true;
      this.pending = null;
      this.notify();
    });
  }

  mode(): InstallMode {
    return this.installed ? 'installed' : installMode(this.env, this.pending !== null);
  }

  /** Ouvre la fenêtre d'installation du navigateur ; une invitation ne sert qu'une fois. */
  async prompt(): Promise<void> {
    const event = this.pending;
    if (!event) return;
    this.pending = null;
    this.notify();
    await event.prompt();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

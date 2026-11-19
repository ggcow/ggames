// Point d'entrée du navigateur : branche l'application sur les API réelles.

import { App } from './platform/app.ts';
import { Installer } from './platform/install.ts';
import { browserStorage } from './platform/storage.ts';

const root = document.getElementById('app');
if (!root) throw new Error('élément #app manquant');

const installer = new Installer({
  userAgent: navigator.userAgent,
  // Safari iOS signale l'écran d'accueil par `navigator.standalone`, les autres par le mode d'affichage.
  standalone:
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true),
});
installer.listen(window);

new App({
  root,
  storage: browserStorage(),
  fetch: (input, init) => window.fetch(input, init),
  createSocket: (url) => new WebSocket(url),
  socketBase: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`,
  languages: navigator.languages,
  installer,
}).start();

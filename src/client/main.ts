// Point d'entrée du navigateur : branche l'application sur les API réelles.

import { App } from './platform/app.ts';
import { browserStorage } from './platform/storage.ts';

const root = document.getElementById('app');
if (!root) throw new Error('élément #app manquant');

new App({
  root,
  storage: browserStorage(),
  fetch: (input, init) => window.fetch(input, init),
  createSocket: (url) => new WebSocket(url),
  socketBase: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`,
  languages: navigator.languages,
}).start();

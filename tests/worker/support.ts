import { exports } from 'cloudflare:workers';
import type { SessionResponse } from '../../src/shared/platform/protocol.ts';

export interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

/** Appelle le Worker comme le ferait un client HTTP. */
export async function call<T = unknown>(path: string, options: CallOptions = {}): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const init: RequestInit = { method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const response = await exports.default.fetch(new Request(`https://test.local${path}`, init));
  return { status: response.status, body: (await response.json()) as T };
}

let counter = 0;

/** Crée un compte avec un nom unique dans le test et renvoie sa session. */
export async function newPlayer(prefix = 'joueur'): Promise<SessionResponse> {
  counter += 1;
  const { status, body } = await call<SessionResponse>('/api/auth/register', {
    body: { name: `${prefix}${counter}`, password: 'secret123' },
  });
  if (status !== 200) throw new Error(`register failed: ${status}`);
  return body;
}

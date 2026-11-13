import { type ErrorResponse, LIMITS } from '../shared/platform/protocol.ts';
import { isRecord } from '../shared/platform/validate.ts';
import type { Result } from './platform/result.ts';

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const errorResponse = (status: number, error: string): Response =>
  json({ error } satisfies ErrorResponse, status);

export const toResponse = <T>(result: Result<T>): Response =>
  result.ok ? json(result.value) : errorResponse(result.status, result.error);

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/** Corps JSON objet, limité à LIMITS.body octets. `null` si absent, trop gros ou invalide. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > LIMITS.body) return null;
  try {
    const body: unknown = JSON.parse(text);
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

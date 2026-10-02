import crypto from 'node:crypto';
import { CompactEncrypt, compactDecrypt } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'sam_session';
const secretSource = process.env.APP_SESSION_SECRET ?? 'dev-only-change-me';
const KEY = crypto.createHash('sha256').update(secretSource).digest();

type SessionPayload = {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
};

export async function setSpotifySession(payload: SessionPayload) {
  const encoded = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(KEY);
  const jar = await cookies();
  jar.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 60,
  });
}

export async function getSpotifySession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const { plaintext } = await compactDecrypt(raw, KEY);
    return JSON.parse(new TextDecoder().decode(plaintext)) as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSpotifySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

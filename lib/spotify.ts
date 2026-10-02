import { setSpotifySession, getSpotifySession } from './session';

const API = 'https://api.spotify.com/v1';
const AUTH = 'https://accounts.spotify.com';

export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

export function spotifyRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/auth/spotify/callback`;
}

export function buildSpotifyAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri: spotifyRedirectUri(),
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `${AUTH}/authorize?${p.toString()}`;
}

async function exchangeCode(code: string) {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${AUTH}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri(),
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function refreshAccessToken(refreshToken: string) {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${AUTH}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function saveSpotifyCode(code: string) {
  const token = await exchangeCode(code);
  if (!token.refresh_token) throw new Error('Spotify did not return a refresh token. Reconnect and approve all requested scopes.');
  await setSpotifySession({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000 - 30_000,
  });
}

export async function spotifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (path.startsWith(API)) path = path.slice(API.length);
  let session = await getSpotifySession();
  if (!session) throw new Error('Spotify is not connected.');

  if (Date.now() >= session.expiresAt) {
    const token = await refreshAccessToken(session.refreshToken);
    session = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000 - 30_000,
    };
    await setSpotifySession(session);
  }

  let res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${session.accessToken}`, ...(init?.headers ?? {}) },
    cache: 'no-store',
  });

  if (res.status === 401) {
    const token = await refreshAccessToken(session.refreshToken);
    session = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000 - 30_000,
    };
    await setSpotifySession(session);
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${session.accessToken}`, ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export type SpotifyPlaylist = {
  id: string;
  name: string;
  description?: string | null;
  public?: boolean;
  collaborative?: boolean;
  items?: { total?: number };
};

export type SpotifyTrack = {
  id: string;
  name: string;
  uri: string;
  duration_ms?: number;
  external_ids?: { isrc?: string };
  artists: { id: string; name: string }[];
  album: { id: string; name: string; release_date?: string };
  is_local?: boolean;
};

export async function getCurrentUser() {
  return spotifyFetch<{ id: string; display_name?: string; images?: { url: string }[] }>('/me');
}

export async function getPlaylists() {
  const out: SpotifyPlaylist[] = [];
  let cursor: string | null = '/me/playlists?limit=50';
  while (cursor) {
    const page: { items: SpotifyPlaylist[]; next: string | null } = await spotifyFetch<{ items: SpotifyPlaylist[]; next: string | null }>(cursor.replace(API, ''));
    out.push(...page.items);
    cursor = page.next ? page.next.replace(API, '') : null;
    if (out.length >= 200) break;
  }
  return out;
}

export async function getPlaylistTracks(playlistId: string) {
  const tracks: SpotifyTrack[] = [];
  let cursor: string | null = `/playlists/${encodeURIComponent(playlistId)}/items?limit=50&fields=items(item(type,id,name,uri,artists(id,name),album(id,name,release_date),is_local,external_ids(isrc))),next,total`;
  while (cursor) {
    const page: { items: { item: SpotifyTrack | null }[]; next: string | null } = await spotifyFetch(cursor);
    for (const row of page.items) {
      if (row.item && row.item.id && !row.item.is_local) tracks.push(row.item);
    }
    cursor = page.next ? page.next.replace(API, '') : null;
  }
  return tracks;
}

export async function getSavedTracks() {
  const tracks: SpotifyTrack[] = [];
  let cursor: string | null = '/me/tracks?limit=50&fields=items(added_at,item(id,name,uri,artists(id,name),album(id,name,release_date),is_local,external_ids(isrc))),next,total';
  while (cursor) {
    const page: { items: { item: SpotifyTrack | null }[]; next: string | null } = await spotifyFetch(cursor);
    for (const row of page.items) {
      if (row.item && row.item.id && !row.item.is_local) tracks.push(row.item);
    }
    cursor = page.next ? page.next.replace(API, '') : null;
    if (tracks.length >= 5000) break;
  }
  return tracks;
}

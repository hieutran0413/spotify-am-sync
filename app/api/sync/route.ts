import { NextResponse } from 'next/server';
import { getPlaylistTracks, getSavedTracks, type SpotifyTrack } from '../../../lib/spotify';
import { getAppleDeveloperToken } from '../../../lib/apple';

export const runtime = 'nodejs';
export const maxDuration = 60;

type AppleSong = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
  };
};

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(track: SpotifyTrack, candidate: AppleSong) {
  const a = candidate.attributes ?? {};
  const title = normalize(track.name);
  const artist = normalize(track.artists[0]?.name ?? '');
  const cTitle = normalize(a.name ?? '');
  const cArtist = normalize(a.artistName ?? '');
  let value = 0;
  if (cTitle === title) value += 12;
  else if (cTitle.includes(title) || title.includes(cTitle)) value += 6;
  if (cArtist === artist) value += 10;
  else if (cArtist.includes(artist) || artist.includes(cArtist)) value += 5;
  if (track.external_ids?.isrc && a.isrc && track.external_ids.isrc === a.isrc) value += 25;
  if (track.duration_ms && a.durationInMillis) {
    const delta = Math.abs(track.duration_ms - a.durationInMillis);
    if (delta <= 2500) value += 6;
    else if (delta <= 7000) value += 3;
  }
  return value;
}

async function appleFetch<T>(path: string, developerToken: string, userToken: string, init?: RequestInit) {
  const res = await fetch(`https://api.music.apple.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${developerToken}`,
      'Music-User-Token': userToken,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Apple Music API ${res.status}: ${raw.slice(0, 300)}`);
  return raw ? (JSON.parse(raw) as T) : (undefined as T);
}

async function searchApple(track: SpotifyTrack, storefront: string, developerToken: string, userToken: string) {
  const term = `${track.name} ${track.artists[0]?.name ?? ''}`.trim();
  const params = new URLSearchParams({ term, types: 'songs', limit: '10' });
  const data = await appleFetch<{ results?: { songs?: { data?: AppleSong[] } } }>(
    `/catalog/${encodeURIComponent(storefront)}/search?${params.toString()}`,
    developerToken,
    userToken,
  );
  const candidates = data.results?.songs?.data ?? [];
  if (!candidates.length) return null;
  return candidates.sort((a, b) => score(track, b) - score(track, a))[0];
}

async function addLibrarySongs(ids: string[], storefront: string, developerToken: string, userToken: string) {
  if (!ids.length) return;
  const query = new URLSearchParams();
  query.set('ids[songs]', ids.join(','));
  query.set('l', storefront);
  await appleFetch(`/me/library?${query.toString()}`, developerToken, userToken, { method: 'POST' });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      userToken?: string;
      storefront?: string;
      mode?: 'library';
      limit?: number;
    };
    if (!body.userToken) return NextResponse.json({ error: 'Apple Music authorization is required.' }, { status: 400 });
    if (!body.storefront) return NextResponse.json({ error: 'Apple Music storefront is missing.' }, { status: 400 });

    const developerToken = await getAppleDeveloperToken();
    const mode = 'library';
    const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 20);
    const spotifyTracks = await getSavedTracks();
    const slice = spotifyTracks.slice(0, limit);

    const matched: { spotifyId: string; spotifyName: string; appleId: string; appleName: string }[] = [];
    const unmatched: { spotifyId: string; name: string; artist: string }[] = [];

    // Keep catalog search sequential to avoid a burst against Apple's search endpoint.
    for (const track of slice) {
      const apple = await searchApple(track, body.storefront, developerToken, body.userToken);
      if (apple && score(track, apple) >= 16) {
        matched.push({
          spotifyId: track.id,
          spotifyName: track.name,
          appleId: apple.id,
          appleName: apple.attributes?.name ?? track.name,
        });
      } else {
        unmatched.push({ spotifyId: track.id, name: track.name, artist: track.artists[0]?.name ?? '' });
      }
    }

    await addLibrarySongs(matched.map((item) => item.appleId), body.storefront, developerToken, body.userToken);

    return NextResponse.json({
      ok: true,
      mode,
      processed: slice.length,
      matched: matched.length,
      unmatched,
      tracks: matched.slice(0, 20),
      note: mode === 'library'
        ? 'Library mode processes the newest saved tracks on each pass; repeating the pass is safe because Apple Music ignores resources already present.'
        : 'Library mode processes the newest saved songs on each pass.',
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

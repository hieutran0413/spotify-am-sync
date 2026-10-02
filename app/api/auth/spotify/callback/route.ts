import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { saveSpotifyCode } from '../../../../../lib/spotify';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) return NextResponse.redirect(new URL(`/?spotify_error=${encodeURIComponent(error)}`, request.url));

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const jar = await cookies();
  const expectedState = jar.get('spotify_oauth_state')?.value;
  jar.delete('spotify_oauth_state');

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL('/?spotify_error=invalid_state', request.url));
  }

  try {
    await saveSpotifyCode(code);
    return NextResponse.redirect(new URL('/?spotify_connected=1', request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Spotify connection failed.';
    return NextResponse.redirect(new URL(`/?spotify_error=${encodeURIComponent(message.slice(0, 180))}`, request.url));
  }
}

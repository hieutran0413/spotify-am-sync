import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { buildSpotifyAuthorizeUrl } from '../../../../lib/spotify';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Spotify credentials are not configured.' }, { status: 500 });
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const jar = await cookies();
  jar.set('spotify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/spotify',
    maxAge: 600,
  });

  return NextResponse.redirect(buildSpotifyAuthorizeUrl(state));
}

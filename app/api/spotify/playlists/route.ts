import { NextResponse } from 'next/server';
import { getPlaylists } from '../../../../lib/spotify';

export async function GET() {
  try {
    const playlists = await getPlaylists();
    return NextResponse.json({ playlists });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to read Spotify playlists.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

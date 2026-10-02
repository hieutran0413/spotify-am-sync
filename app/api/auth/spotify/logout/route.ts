import { NextResponse } from 'next/server';
import { clearSpotifySession } from '../../../../../lib/session';

export async function POST() {
  await clearSpotifySession();
  return NextResponse.json({ ok: true });
}

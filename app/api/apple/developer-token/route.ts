import { NextResponse } from 'next/server';
import { getAppleDeveloperToken } from '../../../../lib/apple';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const token = await getAppleDeveloperToken();
    return NextResponse.json({ token }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Apple Music credentials are not configured.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

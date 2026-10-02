import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/spotify';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(await getCurrentUser(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ connected: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}

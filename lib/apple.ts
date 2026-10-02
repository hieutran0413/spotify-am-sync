import { SignJWT, importPKCS8 } from 'jose';

let cached: { token: string; exp: number } | null = null;

export async function getAppleDeveloperToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - now > 300) return cached.token;

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.MUSIC_KIT_KEY_ID;
  const b64 = process.env.APPLE_PRIVATE_KEY_BASE64;
  if (!teamId || !keyId || !b64) throw new Error('Missing Apple Music developer credentials.');
  const privateKey = Buffer.from(b64, 'base64').toString('utf8');
  const key = await importPKCS8(privateKey, 'ES256');
  const exp = now + 60 * 60 * 24 * 180;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
  cached = { token, exp };
  return token;
}

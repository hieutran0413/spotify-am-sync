# Spotify → Apple Music Sync

A personal-use Next.js app that mirrors the newest songs saved in Spotify into the Apple Music library.

## What it does

- Spotify OAuth 2.0 with a server-side client secret and encrypted HttpOnly session cookie.
- Reads the newest Spotify saved tracks.
- Searches Apple Music by title/artist and scores candidates using title, artist, duration, and ISRC when available.
- Adds matched catalog songs to the Apple Music library.
- Foreground "realtime" mode: the browser runs a sync pass every 60 seconds while the tab is open.
- Apple Music private key stays server-side; Music User Token is held only in browser memory.

## Required credentials

### Spotify
Create a Spotify developer app and add this redirect URI:

`https://YOUR_VERCEL_DOMAIN/api/auth/spotify/callback`

Set:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

The app requests `user-read-private` and `user-library-read`.

### Apple Music
Create a Media Identifier / MusicKit key and keep the private `.p8` key secret. Base64 encode the `.p8` file and set:

- `APPLE_TEAM_ID`
- `MUSIC_KIT_KEY_ID`
- `APPLE_PRIVATE_KEY_BASE64`

Also set:

`NEXT_PUBLIC_APP_URL=https://YOUR_VERCEL_DOMAIN`

`APP_SESSION_SECRET=<long random secret>`

## Runtime behavior

The OAuth/session layer is server-side. Spotify refresh tokens are encrypted into an HttpOnly cookie. The browser only holds the Apple Music Music User Token in memory for the active session.

## Deploy

This repo is Vercel-ready as a Next.js App Router project.

1. Import the repository into Vercel.
2. Add the five environment variables above to Production/Preview as needed.
3. Deploy.
4. Put the production callback URI into the Spotify developer dashboard.
5. Open the deployed app and connect Spotify + Apple Music.

## Important limitation

This build deliberately uses foreground polling. Apple Music web authorization supplies a Music User Token to the browser, and the app does not persist that token in a database. A fully unattended server-side synchronizer would need durable per-user Apple Music authorization storage plus a background job system.

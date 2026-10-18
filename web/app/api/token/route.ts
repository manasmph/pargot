import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import { auth } from '@/auth';
import { AUTH_ENABLED } from '@/lib/auth-config';
import { parseInterviewSettings } from '@/lib/interview-settings';
import { DAILY_INTERVIEW_LIMIT, getTodayInterviewCount } from '@/lib/usage';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export const runtime = 'nodejs';
// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  // ── Auth + quota gate ────────────────────────────────────────────────────
  // This is the enforcement point. Minting a LiveKit JWT is what lets a
  // caller burn voice minutes, so when auth is enabled we require a signed-in
  // user and refuse once they hit their daily interview quota. When auth is
  // disabled (default / local), the endpoint is open — intended for a
  // bring-your-own-key laptop install behind no public URL.
  if (AUTH_ENABLED) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    try {
      const used = await getTodayInterviewCount(session.user.id);
      if (used >= DAILY_INTERVIEW_LIMIT) {
        return NextResponse.json(
          { error: 'daily_limit', limit: DAILY_INTERVIEW_LIMIT, used },
          { status: 429 }
        );
      }
    } catch (err) {
      // A quota-check failure shouldn't hard-block the interview; log and allow.
      console.error('[token-api] quota check failed (allowing):', err);
    }
  }

  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    // Parse room config from request body.
    const body = await req.json().catch(() => ({}));
    const roomConfig = body?.room_config
      ? RoomConfiguration.fromJson(body.room_config, { ignoreUnknownFields: true })
      : new RoomConfiguration();

    // Pre-interview settings (seniority + question types) ride on the room
    // metadata field of the JWT-signed RoomConfiguration. The Python agent
    // reads them from `ctx.room.metadata` after `ctx.connect()`.
    //
    // `parseInterviewSettings` is defensive — it always returns a valid
    // shape (falling back to defaults for missing/bad fields) so the agent
    // never sees malformed JSON or unknown enums.
    const interviewSettings = parseInterviewSettings(body?.interview_settings);
    roomConfig.metadata = JSON.stringify(interviewSettings);

    // Generate participant token
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      roomConfig
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      participantToken,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}

import { NextResponse } from "next/server";
import crypto from "crypto";
import { OPENAI_OAUTH, setOAuthState } from "@/lib/oauth-state";

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export async function POST() {
  try {
    const state = crypto.randomBytes(32).toString("hex");
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(
      crypto.createHash("sha256").update(verifier).digest()
    );

    setOAuthState(state, { verifier, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: OPENAI_OAUTH.CLIENT_ID,
      response_type: "code",
      redirect_uri: OPENAI_OAUTH.REDIRECT_URI,
      scope: OPENAI_OAUTH.SCOPES,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });

    return NextResponse.json({
      authUrl: `${OPENAI_OAUTH.AUTH_URL}?${params.toString()}`,
      state,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to start OpenAI OAuth flow" },
      { status: 500 }
    );
  }
}

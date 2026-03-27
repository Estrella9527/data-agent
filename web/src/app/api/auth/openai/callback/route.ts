import { NextRequest, NextResponse } from "next/server";
import {
  OPENAI_OAUTH,
  getOAuthState,
  deleteOAuthState,
} from "@/lib/oauth-state";

/**
 * OpenAI OAuth callback — browser redirects here after user authorizes.
 * Exchanges code for tokens, then redirects back to welcome page with result.
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/welcome?oauth_error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/welcome?oauth_error=missing_params", req.url)
    );
  }

  const flow = getOAuthState(state);
  if (!flow) {
    return NextResponse.redirect(
      new URL("/welcome?oauth_error=expired", req.url)
    );
  }

  try {
    const tokenRes = await fetch(OPENAI_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: OPENAI_OAUTH.CLIENT_ID,
        code,
        redirect_uri: OPENAI_OAUTH.REDIRECT_URI,
        code_verifier: flow.verifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("OpenAI token exchange failed:", tokenRes.status, errText);
      return NextResponse.redirect(
        new URL("/welcome?oauth_error=token_exchange_failed", req.url)
      );
    }

    const tokens = await tokenRes.json();
    deleteOAuthState(state);

    // Encode token data in URL fragment (not exposed to server logs)
    const tokenData = encodeURIComponent(JSON.stringify({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    }));

    return NextResponse.redirect(
      new URL(`/welcome?openai_oauth_success=1&token_data=${tokenData}`, req.url)
    );
  } catch (err) {
    console.error("OpenAI OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/welcome?oauth_error=server_error", req.url)
    );
  }
}

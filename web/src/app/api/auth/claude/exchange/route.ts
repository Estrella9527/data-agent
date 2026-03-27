import { NextRequest, NextResponse } from "next/server";
import {
  CLAUDE_OAUTH,
  getOAuthState,
  deleteOAuthState,
} from "@/lib/oauth-state";

/**
 * Claude OAuth — Exchange authorization code for tokens.
 * Mirrors Craft Agents' exchangeClaudeCode() with PKCE.
 */

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, state } = body;

    if (!code || !state) {
      return NextResponse.json(
        { success: false, error: "缺少授权码或状态参数" },
        { status: 400 }
      );
    }

    const flow = getOAuthState(state);
    if (!flow) {
      return NextResponse.json(
        { success: false, error: "授权已过期，请重新开始" },
        { status: 400 }
      );
    }

    // Exchange code for tokens
    const tokenRes = await fetch(CLAUDE_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "ChongmingDataAgent/0.5",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: CLAUDE_OAUTH.CLIENT_ID,
        code,
        redirect_uri: CLAUDE_OAUTH.REDIRECT_URI,
        code_verifier: flow.verifier,
        state,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", tokenRes.status, errText);
      return NextResponse.json(
        { success: false, error: "令牌交换失败，请重试" },
        { status: 400 }
      );
    }

    const tokens: TokenResponse = await tokenRes.json();
    deleteOAuthState(state);

    return NextResponse.json({
      success: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
  } catch (err) {
    console.error("OAuth exchange error:", err);
    return NextResponse.json(
      { success: false, error: "验证请求失败" },
      { status: 500 }
    );
  }
}

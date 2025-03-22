import "@std/dotenv/load";

export interface TokenConfig {
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
}

export const tokenConfig: TokenConfig = {
  accessTokenExpiry: "15m", // Short-lived access token
  refreshTokenExpiry: "7d", // Longer-lived refresh token
  issuer: "tonotes-api",
  audience: "tonotes-client",
};

const jwtSecret = Deno.env.get("JWT_SECRET_KEY");
if (!jwtSecret) {
  throw new Error("JWT_SECRET_KEY is not provided");
}

export const secretKey = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(jwtSecret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

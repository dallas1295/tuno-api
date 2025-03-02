import { JWTPayload, jwtVerify, SignJWT } from "jsr:@panva/jose";
import { redisService } from "./redisService.ts";
import "jsr:@std/dotenv/load";
const jwtSecret = Deno.env.get("JWT_SECRET_KEY");
if (!jwtSecret) {
  throw new Error("JWT_SECRET_KEY is not provided");
}

const secretKey = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(jwtSecret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);
interface TokenConfig {
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
}

const tokenConfig: TokenConfig = {
  accessTokenExpiry: "15m", // Short-lived access token
  refreshTokenExpiry: "7d", // Longer-lived refresh token
  issuer: "tonotes-api",
  audience: "tonotes-client",
};

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const tokenService = {
  generateTokenPair: async (payload: JWTPayload): Promise<TokenPair> => {
    try {
      const accessToken = await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer(tokenConfig.issuer)
        .setAudience(tokenConfig.audience)
        .setExpirationTime(tokenConfig.accessTokenExpiry)
        .sign(secretKey);

      const refreshToken = await new SignJWT({
        ...payload,
        type: "refresh",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer(tokenConfig.issuer)
        .setAudience(tokenConfig.audience)
        .setExpirationTime(tokenConfig.refreshTokenExpiry)
        .sign(secretKey);

      return {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
      };
    } catch (error) {
      console.error("Error generating tokens:", error);
      throw new Error("Failed to generate tokens");
    }
  },

  verifyToken: async (token: string): Promise<JWTPayload> => {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await tokenService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new Error("Token is blacklisted");
      }

      const { payload } = await jwtVerify(token, secretKey, {
        issuer: tokenConfig.issuer,
        audience: tokenConfig.audience,
      });

      return payload;
    } catch (error) {
      console.error("Token verification failed:", error);
      throw new Error("Invalid token");
    }
  },

  refreshAccessToken: async (refreshToken: string): Promise<string> => {
    try {
      const payload = await tokenService.verifyToken(refreshToken);

      if (payload["type"] !== "refresh") {
        throw new Error("Invalid token type");
      }

      // Generate new access token
      const { ["type"]: _tokenType, ...tokenPayload } = payload; // Remove refresh type
      return await new SignJWT(tokenPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer(tokenConfig.issuer)
        .setAudience(tokenConfig.audience)
        .setExpirationTime(tokenConfig.accessTokenExpiry)
        .sign(secretKey);
    } catch (error) {
      console.error("Error refreshing token:", error);
      throw new Error("Failed to refresh token");
    }
  },

  blacklistToken: async (
    token: string,
    tokenType: "access" | "refresh",
  ): Promise<void> => {
    try {
      const { payload } = await jwtVerify(token, secretKey);
      if (payload.exp) {
        const keyRedis = `blacklist:${tokenType}:${token}`;
        const timeDiff = payload.exp - Math.floor(Date.now() / 1000);
        await redisService.setKey(keyRedis, "true", timeDiff);
      }
    } catch (error) {
      console.error("Error blacklisting token:", error);
      throw new Error("Failed to blacklist token");
    }
  },

  isTokenBlacklisted: async (token: string): Promise<boolean> => {
    try {
      const keyRedis = `blacklist:*:${token}`;
      const keys = await redisService.getKeysByPattern(keyRedis);
      return keys.length > 0;
    } catch (error) {
      console.error("Error checking blacklist:", error);
      throw new Error("Failed to check token blacklist");
    }
  },

  blacklistUserTokens: async (userId: string): Promise<void> => {
    try {
      const pattern = `blacklist:*:${userId}:*`;
      const keys = await redisService.getKeysByPattern(pattern);
      await Promise.all(keys.map((key) => redisService.deleteKey(key)));
    } catch (error) {
      console.error("Error blacklisting user tokens:", error);
      throw new Error("Failed to blacklist user tokens");
    }
  },
};

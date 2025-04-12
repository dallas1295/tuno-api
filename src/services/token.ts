import { JWTPayload, jwtVerify, SignJWT } from "@panva/jose";
import { User } from "../models/user.ts";
import { RedisManager } from "./redis.ts";
import { secretKey, tokenConfig, TokenPair } from "../utils/token.ts";
import "@std/dotenv/load";

interface UserPayload extends JWTPayload {
  userId: string;
  username: string;
  type?: string;
}

export const tokenService = {
  generateTokenPair: async (user: User): Promise<TokenPair> => {
    const payload: UserPayload = {
      userId: user.userId,
      username: user.username,
    };
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

      const { ["type"]: _tokenType, ...tokenPayload } = payload;
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

  blacklistTokens: async (
    tokens: Array<{ token: string; type: "access" | "refresh" }>,
  ): Promise<void> => {
    try {
      await Promise.all(
        tokens.map(async ({ token, type }) => {
          const { payload } = await jwtVerify(token, secretKey);
          if (payload.exp) {
            const keyRedis = `blacklist:${type}:${token}`;
            const timeDiff = payload.exp - Math.floor(Date.now() / 1000);
            await RedisManager.setex(keyRedis, timeDiff, "true");
          }
        }),
      );
    } catch (error) {
      console.error("Error blacklisting tokens:", error);
      throw new Error("Failed to blacklist tokens");
    }
  },

  isTokenBlacklisted: async (token: string): Promise<boolean> => {
    try {
      const keyRedis = `blacklist:*:${token}`;
      const keys = await RedisManager.keys(keyRedis);
      return keys.length > 0;
    } catch (error) {
      console.error("Error checking blacklist:", error);
      throw new Error("Failed to check token blacklist");
    }
  },
  generateTempToken: async (
    userId: string,
    expiry: string,
  ): Promise<string> => {
    try {
      const tempToken = await new SignJWT({
        userId,
        type: "temp",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer(tokenConfig.issuer)
        .setAudience(tokenConfig.audience)
        .setExpirationTime(expiry)
        .sign(secretKey);

      return tempToken;
    } catch (error) {
      console.error("Error generating temporary token:", error);
      throw new Error("Failed to generate temporary token");
    }
  },

  verifyTempToken: async (
    token: string,
  ): Promise<UserPayload> => {
    try {
      const { payload } = await jwtVerify(token, secretKey, {
        issuer: tokenConfig.issuer,
        audience: tokenConfig.audience,
      });

      if (payload.type !== "temp") {
        throw new Error("Invalid temporary token");
      }

      return payload as UserPayload;
    } catch (error) {
      console.error("Temporary token verification failed:", error);
      throw new Error("Invalid temporary token");
    }
  },
};

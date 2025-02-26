import jwt from "jsonwebtoken";
import { redisService } from "./redisService";
import dotenv from "dotenv";

dotenv.config();

const secretKey: string = process.env.JWT_SECRET_KEY as string;

if (!secretKey) {
  throw new Error("Secret key is not provided");
}

export const tokenService = {
  generateToken: async (payload: string): Promise<string> => {
    return jwt.sign(payload, secretKey, { expiresIn: "1h" });
  },
  verifyToken: async (token: string): Promise<any> => {
    return jwt.verify(token, secretKey);
  },
  blacklistTokens: async (
    accessToken: string,
    refreshToken: string,
  ): Promise<void> => {
    await tokenService.blacklistSingleToken(accessToken, "access");
    await tokenService.blacklistSingleToken(refreshToken, "refresh");
  },
  blacklistSingleToken: async (
    tokenString: string,
    tokenType: string,
  ): Promise<void> => {
    const token = jwt.verify(tokenString, secretKey) as jwt.JwtPayload;
    const expirationTime = token.exp
      ? new Date(token.exp * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const key = `blacklist:${tokenType}:${tokenString}`;
    await redisService.setKey(
      key,
      "true",
      Math.floor((expirationTime.getTime() - Date.now()) / 1000),
    );
  },
  isTokenBlacklisted: async (tokenString: string): Promise<boolean> => {
    const accessKey = `blacklist:access:${tokenString}`;
    const refreshKey = `blacklist:refresh:${tokenString}`;
    const accessExists = await redisService.keyExists(accessKey);
    const refreshExists = await redisService.keyExists(refreshKey);
    return accessExists || refreshExists;
  },
};

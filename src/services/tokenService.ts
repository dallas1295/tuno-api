import {
  create,
  verify,
  decode,
  getNumericDate,
  Payload,
} from "jsr:@zaubrik/djwt";
import { redisService } from "./redisService.ts";
import "jsr:@std/dotenv/load";

const secretKey: string = Deno.env.get("JWT_SECRET_KEY") as string;

if (!secretKey) {
  throw new Error("Secret key is not provided");
}

const encoder = new TextEncoder();

async function generateCryptoKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: { name: "SHA-256" } },
    true,
    ["sign", "verify"],
  );
}

const expiryTime = getNumericDate(60 * 60);
const timeDiff = expiryTime - getNumericDate(new Date());

const key = await generateCryptoKey(secretKey);

export const tokenService: any = {
  generateToken: async (payload: string): Promise<string> => {
    return await create(
      { alg: "HS256", typ: "JWT" },
      { payload, exp: expiryTime },
      key,
    );
  },
  verifyToken: async (token: string): Promise<Payload | null> => {
    const verified = await verify(token, key);

    if (!verified) {
      throw new Error("could not verify token");
    }

    return verified;
  },
  blaclkistSingleToken: async (
    token: string,
    tokenType: string,
  ): Promise<void> => {
    try {
      const payload = await verify(token, key);
      if (payload && payload.exp) {
        const keyRedis = `blacklist:${tokenType}:${token}`;

        await redisService.setKey(keyRedis, "true", timeDiff);
      }
    } catch (error) {
      console.error(`Error blacklisting token: ${error}`);
    }
  },
};

import * as OTPAuth from "@hectorm/otpauth";

export function verifyTOTP(secret: OTPAuth.Secret, code: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: "toNotes",
      label: "toNotesAuth",
      algorithm: "SHA512",
      digits: 6,
      period: 30,
      secret: secret,
    });

    return totp.validate({ token: code }) !== null;
  } catch (error) {
    console.error("Error validating TOTP code:", error);
    return false;
  }
}

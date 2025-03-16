export interface twoFactorResponse {
  secret: string;
  QRcode: string;
  recoveryCodes: string[];
}

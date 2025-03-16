function generateRecoveryCode(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  const randomValues = new Uint32Array(10);
  crypto.getRandomValues(randomValues);
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += characters.charAt(randomValues[i] % charactersLength);
  }
  return result.toUpperCase();
}

export function generateRecoveryCodes(): string[] {
  const recoveryCodes: string[] = [];
  for (let i = 0; i < 10; i++) {
    recoveryCodes.push(generateRecoveryCode());
  }
  return recoveryCodes;
}

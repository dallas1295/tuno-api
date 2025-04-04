export interface User {
  userId: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  email: string;
  lastEmailChange?: Date;
  lastPasswordChange?: Date;
  lastUsernameChange?: Date;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  recoveryCodes?: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
  twoFactorCode?: string;
}

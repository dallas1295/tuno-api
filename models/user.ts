export interface User {
  userId: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  lastEmailChange: Date;
  lastPasswordChange: Date;
  isActive: boolean;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  recoveryCodes?: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
  two_factor_code?: string;
}

export interface UserProfile {
  username: string;
  email: string;
  created_at: Date;
}

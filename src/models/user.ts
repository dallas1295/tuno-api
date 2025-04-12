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

export interface ChangeEmailRequest {
  newEmail: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface DeleteUserRequest {
  passwordOne: string;
  passwordTwo: string;
}

export interface DisableTwoFactorRequest {
  password: string;
  totp: string;
}

export interface UserProfile {
  username: string;
  email: string;
  createdAt: Date;
}

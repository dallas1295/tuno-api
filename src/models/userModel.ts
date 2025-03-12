/**
 * @file Defines the `User`, `LoginRequest`, and `UserProfile` interfaces, representing
 * user-related data within the tonotes application.
 */

/**
 * Represents a user account within the tonotes application.
 */
export interface User {
  /**
   * A unique identifier for the user. This should be a UUID.
   */
  userId: string;

  /**
   * The user's username. This should be a unique identifier for the user.
   */
  username: string;

  /**
   * The hashed password for the user. This should *never* be stored in plain text.
   */
  passwordHash: string;

  /**
   * The date and time when the user account was created.
   */
  createdAt: Date;
  /**
   * email associate with the user account.
   */

  email: string;

  /**
   * The date and time when the user last changed their email address.
   */
  lastEmailChange?: Date;

  /**
   * The date and time when the user last changed their password.
   */
  lastPasswordChange?: Date;
  /**
   * An optional secret key used for two-factor authentication.
   */
  twoFactorSecret?: string;

  /**
   * A boolean value indicating whether two-factor authentication is enabled for the user.
   */
  twoFactorEnabled: boolean;

  /**
   * An optional array of recovery codes that can be used to bypass two-factor authentication
   * in case the user loses access to their authenticator app.  These codes should be
   * stored securely.
   */
  recoveryCodes?: string[];
}

/**
 * Represents a request to log in to the application.
 */
export interface LoginRequest {
  /**
   * The username of the user attempting to log in.
   */
  username: string;

  /**
   * The password of the user attempting to log in.
   */
  password: string;

  /**
   * An optional two-factor authentication code provided by the user.
   */
  two_factor_code?: string;
}

/**
 * Represents a user's profile information, suitable for public display.
 * Excludes sensitive information like the password hash.
 */
export interface UserProfile {
  /**
   * The user's username.
   */
  username: string;

  /**
   * The user's email address.
   */
  email: string;

  /**
   * The date and time when the user account was created.
   */
  createdAt: Date;
}

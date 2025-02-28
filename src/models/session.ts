/**
 * @file Defines the `Session` and `Activity` interfaces, representing user sessions
 * and activity logs within the tonotes application.
 */

/**
 * Represents an active user session.
 */
export interface Session {
  /**
   * A unique identifier for the session.  This should be a randomly generated UUID.
   */
  sessionId: string;

  /**
   * The ID of the user associated with this session.
   */
  userId: string;

  /**
   * The user's display name for the session.
   */
  displayName: string;

  /**
   * Information about the device used to initiate the session.  This could include
   * the operating system, browser, and other relevant details.
   */
  deviceInfo: string;

  /**
   * The geographical location of the user when the session was initiated.  This may be
   * derived from the user's IP address.
   */
  location: string;

  /**
   * The IP address from which the session was initiated.  This can be used for security
   * and auditing purposes.
   */
  ipAddress: string;

  /**
   * The date and time when the session was created.
   */
  createdAt: Date;

  /**
   * The date and time when the session is set to expire.  After this time, the session
   * will no longer be valid.
   */
  expiresAt: Date;

  /**
   * The date and time of the user's last activity within the session.  This can be used
   * to track user engagement and identify inactive sessions.
   */
  lastActive: Date;

  /**
   * A boolean value indicating whether the session is currently active.
   */
  isActive: boolean;
}

/**
 * Represents a single user activity event within a session.
 */
export interface Activity {
  /**
   * The date and time when the activity occurred.
   */
  timestamp: Date;

  /**
   * A description of the action performed by the user.  Examples include "login", "logout",
   * "note created", etc.
   */
  action: string;

  /**
   * The geographical location of the user when the activity occurred.  This may be derived
   * from the user's IP address.
   */
  location: string;

  /**
   * The IP address from which the activity was performed.
   */
  ipAddress: string;
}

export interface Session {
  sesssionId: string;
  userId: string;
  displayName: string;
  deviceInfo: string;
  location: string;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
  lastActive: Date;
  active: boolean;
}

export interface Activity {
  timestamp: Date;
  action: string;
  location: string;
  ipAddress: string;
}

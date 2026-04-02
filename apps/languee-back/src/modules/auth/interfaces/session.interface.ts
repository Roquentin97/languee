export interface SessionData {
  sessionId: string;
  userId: string;
  hashedRefreshToken: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

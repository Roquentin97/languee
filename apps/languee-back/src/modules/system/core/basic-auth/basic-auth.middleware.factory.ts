import * as crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

function safeEqual(incoming: string, expected: string): boolean {
  const hash = (value: string): Buffer =>
    crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(hash(incoming), hash(expected));
}

export function createBasicAuthMiddleware(
  user: string,
  password: string,
  realm = 'Protected',
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', `Basic realm="${realm}"`);
      res.status(401).send('Unauthorized');
      return;
    }

    const decoded = Buffer.from(
      authHeader.slice('Basic '.length),
      'base64',
    ).toString('utf8');

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      res.setHeader('WWW-Authenticate', `Basic realm="${realm}"`);
      res.status(401).send('Unauthorized');
      return;
    }

    const incomingUser = decoded.slice(0, separatorIndex);
    const incomingPassword = decoded.slice(separatorIndex + 1);

    const userMatch = safeEqual(incomingUser, user);
    const passwordMatch = safeEqual(incomingPassword, password);

    if (!userMatch || !passwordMatch) {
      res.setHeader('WWW-Authenticate', `Basic realm="${realm}"`);
      res.status(401).send('Unauthorized');
      return;
    }

    next();
  };
}

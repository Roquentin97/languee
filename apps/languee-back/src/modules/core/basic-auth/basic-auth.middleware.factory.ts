import * as crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

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

    // Use hashing to normalise lengths before timingSafeEqual
    const hashIncomingUser = crypto
      .createHash('sha256')
      .update(incomingUser)
      .digest();
    const hashExpectedUser = crypto.createHash('sha256').update(user).digest();
    const hashIncomingPassword = crypto
      .createHash('sha256')
      .update(incomingPassword)
      .digest();
    const hashExpectedPassword = crypto
      .createHash('sha256')
      .update(password)
      .digest();

    const userMatch = crypto.timingSafeEqual(
      hashIncomingUser,
      hashExpectedUser,
    );
    const passwordMatch = crypto.timingSafeEqual(
      hashIncomingPassword,
      hashExpectedPassword,
    );

    if (!userMatch || !passwordMatch) {
      res.setHeader('WWW-Authenticate', `Basic realm="${realm}"`);
      res.status(401).send('Unauthorized');
      return;
    }

    next();
  };
}

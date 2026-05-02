import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

const DEMO_USER_ID = 'demo-user-001';

/**
 * Reads the user identity from the `x-user-id` header that the Next.js
 * frontend stamps onto each API call (sourced from the NextAuth session).
 *
 * Falls back to the demo user if missing — keeps `MOCK_DATA=true` flows
 * working without auth. For production this should be replaced with
 * NextAuth JWT verification using a shared secret.
 */
export function userScope(req: Request, _res: Response, next: NextFunction): void {
  const headerId = req.header('x-user-id');
  req.userId = headerId?.trim() || DEMO_USER_ID;
  next();
}

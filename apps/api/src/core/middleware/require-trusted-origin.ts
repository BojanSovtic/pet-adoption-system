import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError } from '../errors/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for cookie-authenticated requests, together with
 * `SameSite=Lax`: state-changing requests from a browser must come from the
 * trusted frontend origin.
 *
 * Browsers always send `Origin` on cross-origin requests, so a missing header
 * means a non-browser client (curl, tests), which cannot carry a victim's
 * cookies and is allowed.
 */
export const requireTrustedOrigin = (trustedOrigin: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('Origin');

    if (SAFE_METHODS.has(req.method) || !origin || origin === trustedOrigin) {
      next();
      return;
    }

    next(new ForbiddenError('UNTRUSTED_ORIGIN'));
  };
};

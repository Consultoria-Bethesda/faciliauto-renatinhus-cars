/**
 * Authentication Middleware for Lead Dashboard
 * 
 * Extracts and validates JWT from Authorization header.
 * Attaches user and dealershipId to request context.
 * Returns 401 for invalid/missing tokens.
 * 
 * _Requirements: 7.1, 7.5_
 */

import { Request, Response, NextFunction } from 'express';
import { validateToken, getUserFromToken, AuthUser } from '../services/auth.service';
import { logger } from '../lib/logger';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            dealershipId?: string | null;
        }
    }
}

/**
 * Authentication middleware - requires valid JWT token
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.debug({ path: req.path }, 'Missing or invalid Authorization header');
            return res.status(401).json({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const user = await getUserFromToken(token);

        if (!user) {
            logger.debug({ path: req.path }, 'Invalid or expired token');
            return res.status(401).json({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Invalid or expired token',
            });
        }

        // Attach user to request
        req.user = user;
        req.dealershipId = user.dealershipId;

        next();
    } catch (error) {
        logger.error({ error, path: req.path }, 'Auth middleware error');
        return res.status(401).json({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication failed',
        });
    }
}

/**
 * Admin role middleware - requires admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
        });
    }

    if (req.user.role !== 'admin') {
        logger.warn({ userId: req.user.id, role: req.user.role, path: req.path }, 'Admin access denied');
        return res.status(403).json({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Admin access required',
        });
    }

    next();
}

/**
 * Partner role middleware - requires partner or admin role
 */
export function requirePartnerOrAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
        });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'partner') {
        logger.warn({ userId: req.user.id, role: req.user.role, path: req.path }, 'Partner access denied');
        return res.status(403).json({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Partner or admin access required',
        });
    }

    next();
}

/**
 * Optional auth middleware - attaches user if token is valid, but doesn't require it
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const user = await getUserFromToken(token);

            if (user) {
                req.user = user;
                req.dealershipId = user.dealershipId;
            }
        }

        next();
    } catch (error) {
        // Ignore errors in optional auth
        next();
    }
}

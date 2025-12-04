/**
 * Authentication Routes
 * 
 * POST /api/auth/login - authenticate and return JWT
 * POST /api/auth/logout - invalidate session
 * 
 * _Requirements: 7.1, 7.2, 7.7_
 */

import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { logger } from '../lib/logger';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Email and password are required',
            });
        }

        const result = await authService.login(email, password);

        if (!result) {
            return res.status(401).json({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Invalid email or password',
            });
        }

        logger.info({ userId: result.user.id, email }, 'User logged in');

        res.json({
            token: result.token,
            user: {
                id: result.user.id,
                name: result.user.name,
                email: result.user.email,
                role: result.user.role,
                dealershipId: result.user.dealershipId,
            },
        });
    } catch (error: any) {
        logger.error({ error }, 'Login error');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * POST /api/auth/logout
 * Invalidate user session (client-side token removal)
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
    try {
        // JWT tokens are stateless, so logout is handled client-side
        // We just log the event for audit purposes
        const user = (req as any).user;
        logger.info({ userId: user?.id }, 'User logged out');

        res.json({ success: true });
    } catch (error: any) {
        logger.error({ error }, 'Logout error');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            dealershipId: user.dealershipId,
        });
    } catch (error: any) {
        logger.error({ error }, 'Get user error');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

export default router;

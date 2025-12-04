/**
 * Metrics Routes
 * 
 * GET /api/metrics - get dashboard metrics
 * GET /api/metrics/partner - get partner-specific metrics
 * 
 * _Requirements: 5.1-5.6, 10.5, 10.6, 10.7_
 */

import { Router, Request, Response } from 'express';
import { metricsService, MetricFilters } from '../services/metrics.service';
import { requireAuth, requirePartnerOrAdmin } from '../middleware/auth.middleware';
import { logger } from '../lib/logger';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/metrics
 * Get dashboard metrics with status breakdown
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const filters: MetricFilters = {
            dealershipId: req.query.dealershipId as string,
        };

        if (req.query.startDate) {
            filters.startDate = new Date(req.query.startDate as string);
        }
        if (req.query.endDate) {
            filters.endDate = new Date(req.query.endDate as string);
        }

        const metrics = await metricsService.getDashboardMetrics(filters, user);

        res.json(metrics);
    } catch (error: any) {
        logger.error({ error }, 'Error getting metrics');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * GET /api/metrics/partner
 * Get partner-specific metrics with commission tracking
 */
router.get('/partner', requirePartnerOrAdmin, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const filters: MetricFilters = {};

        if (req.query.startDate) {
            filters.startDate = new Date(req.query.startDate as string);
        }
        if (req.query.endDate) {
            filters.endDate = new Date(req.query.endDate as string);
        }

        const metrics = await metricsService.getPartnerMetrics(filters, user);

        res.json(metrics);
    } catch (error: any) {
        logger.error({ error }, 'Error getting partner metrics');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

export default router;

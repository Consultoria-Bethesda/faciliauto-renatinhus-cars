/**
 * Sales Routes
 * 
 * POST /api/leads/:id/sale - record sale and calculate commission
 * GET /api/sales - list sales for partner view
 * PATCH /api/sales/:id/paid - mark commission as paid (admin only)
 * 
 * _Requirements: 10.3, 10.5_
 */

import { Router, Request, Response } from 'express';
import { saleService, SaleFilters } from '../services/sale.service';
import { requireAuth, requirePartnerOrAdmin, requireAdmin } from '../middleware/auth.middleware';
import { logger } from '../lib/logger';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * POST /api/leads/:leadId/sale
 * Record a sale and calculate commission
 */
router.post('/leads/:leadId/sale', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { leadId } = req.params;
        const { saleValue } = req.body;

        if (!saleValue || typeof saleValue !== 'number' || saleValue <= 0) {
            return res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Valid saleValue (positive number) is required',
            });
        }

        const sale = await saleService.createSale(leadId, saleValue, user);

        if (!sale) {
            return res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Lead not found, sale already exists, or access denied',
            });
        }

        res.status(201).json(sale);
    } catch (error: any) {
        logger.error({ error }, 'Error creating sale');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * GET /api/sales
 * List sales (for partner view)
 */
router.get('/', requirePartnerOrAdmin, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const filters: SaleFilters = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 20,
            dealershipId: req.query.dealershipId as string,
        };

        if (req.query.startDate) {
            filters.startDate = new Date(req.query.startDate as string);
        }
        if (req.query.endDate) {
            filters.endDate = new Date(req.query.endDate as string);
        }
        if (req.query.isPaid !== undefined) {
            filters.isPaid = req.query.isPaid === 'true';
        }

        const result = await saleService.findAll(filters, user);

        res.json({
            sales: result.data,
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
        });
    } catch (error: any) {
        logger.error({ error }, 'Error listing sales');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * PATCH /api/sales/:id/paid
 * Mark commission as paid (admin only)
 */
router.patch('/:id/paid', requireAdmin, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { id } = req.params;

        const sale = await saleService.markAsPaid(id, user);

        if (!sale) {
            return res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Sale not found or access denied',
            });
        }

        res.json(sale);
    } catch (error: any) {
        logger.error({ error }, 'Error marking sale as paid');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

export default router;

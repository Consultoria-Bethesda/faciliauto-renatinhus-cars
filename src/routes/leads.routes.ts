/**
 * Leads Routes
 * 
 * GET /api/leads - list leads with filters and pagination
 * GET /api/leads/:id - get lead details with timeline
 * PATCH /api/leads/:id/status - update lead status
 * GET /api/leads/export - export leads to CSV
 * 
 * _Requirements: 2.1, 2.2, 3.1-3.6, 4.2, 6.1-6.5, 8.1-8.4_
 */

import { Router, Request, Response } from 'express';
import { leadService, LeadFilters } from '../services/lead.service';
import { requireAuth } from '../middleware/auth.middleware';
import { maskLeadsPhones, maskLeadPhone } from '../utils/phone-mask';
import { logger } from '../lib/logger';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/leads
 * List leads with filters and pagination
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const filters: LeadFilters = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 20,
            status: req.query.status as string,
            dealershipId: req.query.dealershipId as string,
            search: req.query.search as string,
            vehicleId: req.query.vehicleId as string,
        };

        // Parse date filters
        if (req.query.startDate) {
            filters.startDate = new Date(req.query.startDate as string);
        }
        if (req.query.endDate) {
            filters.endDate = new Date(req.query.endDate as string);
        }

        const result = await leadService.findAll(filters, user);

        // Mask phone numbers in response
        const maskedLeads = maskLeadsPhones(result.data);

        res.json({
            leads: maskedLeads,
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
        });
    } catch (error: any) {
        logger.error({ error }, 'Error listing leads');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * GET /api/leads/export
 * Export leads to CSV file
 */
router.get('/export', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const filters: LeadFilters = {
            status: req.query.status as string,
            dealershipId: req.query.dealershipId as string,
            search: req.query.search as string,
            vehicleId: req.query.vehicleId as string,
        };

        if (req.query.startDate) {
            filters.startDate = new Date(req.query.startDate as string);
        }
        if (req.query.endDate) {
            filters.endDate = new Date(req.query.endDate as string);
        }

        const csv = await leadService.exportToCsv(filters, user);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
    } catch (error: any) {
        logger.error({ error }, 'Error exporting leads');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * GET /api/leads/:id
 * Get lead details with timeline
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { id } = req.params;

        const lead = await leadService.findById(id, user);

        if (!lead) {
            return res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Lead not found',
            });
        }

        // Get timeline
        const timeline = await leadService.getTimeline(id, user);

        // Mask phone number
        const maskedLead = maskLeadPhone(lead);

        res.json({
            ...maskedLead,
            timeline,
        });
    } catch (error: any) {
        logger.error({ error }, 'Error getting lead');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * PATCH /api/leads/:id/status
 * Update lead status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!status) {
            return res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Status is required',
            });
        }

        const validStatuses = ['pending', 'sent', 'contacted', 'converted', 'lost'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            });
        }

        const lead = await leadService.updateStatus(id, status, user, notes);

        if (!lead) {
            return res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Lead not found or access denied',
            });
        }

        // Mask phone number
        const maskedLead = maskLeadPhone(lead);

        res.json(maskedLead);
    } catch (error: any) {
        logger.error({ error }, 'Error updating lead status');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

export default router;

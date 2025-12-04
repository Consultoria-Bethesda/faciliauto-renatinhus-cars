/**
 * Dealerships Routes (Admin only)
 * 
 * GET /api/dealerships - list all dealerships
 * POST /api/dealerships - create dealership
 * PATCH /api/dealerships/:id - update dealership
 * 
 * _Requirements: 1.1, 1.4_
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { logger } from '../lib/logger';

const router = Router();

// All routes require authentication and admin role
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/dealerships
 * List all dealerships
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const dealerships = await prisma.dealership.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                cnpj: true,
                websiteUrl: true,
                logoUrl: true,
                sellerWhatsApp: true,
                isActive: true,
                commissionType: true,
                commissionRate: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        vehicles: true,
                        leads: true,
                        users: true,
                    },
                },
            },
        });

        res.json(dealerships);
    } catch (error: any) {
        logger.error({ error }, 'Error listing dealerships');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * GET /api/dealerships/:id
 * Get dealership by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dealership = await prisma.dealership.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        vehicles: true,
                        leads: true,
                        users: true,
                    },
                },
            },
        });

        if (!dealership) {
            return res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Dealership not found',
            });
        }

        res.json(dealership);
    } catch (error: any) {
        logger.error({ error }, 'Error getting dealership');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * POST /api/dealerships
 * Create new dealership
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, cnpj, websiteUrl, logoUrl, sellerWhatsApp, commissionType, commissionRate } = req.body;

        // Validation
        if (!name || !cnpj || !websiteUrl || !sellerWhatsApp) {
            return res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'Name, CNPJ, websiteUrl, and sellerWhatsApp are required',
            });
        }

        // Check for duplicate CNPJ
        const existing = await prisma.dealership.findUnique({
            where: { cnpj },
        });

        if (existing) {
            return res.status(400).json({
                status: 400,
                code: 'VALIDATION_ERROR',
                message: 'A dealership with this CNPJ already exists',
            });
        }

        const dealership = await prisma.dealership.create({
            data: {
                name,
                cnpj,
                websiteUrl,
                logoUrl,
                sellerWhatsApp,
                commissionType: commissionType || 'percentage',
                commissionRate: commissionRate || 2.0,
            },
        });

        logger.info({ dealershipId: dealership.id, name }, 'Dealership created');

        res.status(201).json(dealership);
    } catch (error: any) {
        logger.error({ error }, 'Error creating dealership');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

/**
 * PATCH /api/dealerships/:id
 * Update dealership
 */
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, cnpj, websiteUrl, logoUrl, sellerWhatsApp, isActive, commissionType, commissionRate } = req.body;

        // Check if dealership exists
        const existing = await prisma.dealership.findUnique({
            where: { id },
        });

        if (!existing) {
            return res.status(404).json({
                status: 404,
                code: 'NOT_FOUND',
                message: 'Dealership not found',
            });
        }

        // Check for duplicate CNPJ if changing
        if (cnpj && cnpj !== existing.cnpj) {
            const duplicate = await prisma.dealership.findUnique({
                where: { cnpj },
            });

            if (duplicate) {
                return res.status(400).json({
                    status: 400,
                    code: 'VALIDATION_ERROR',
                    message: 'A dealership with this CNPJ already exists',
                });
            }
        }

        const dealership = await prisma.dealership.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(cnpj !== undefined && { cnpj }),
                ...(websiteUrl !== undefined && { websiteUrl }),
                ...(logoUrl !== undefined && { logoUrl }),
                ...(sellerWhatsApp !== undefined && { sellerWhatsApp }),
                ...(isActive !== undefined && { isActive }),
                ...(commissionType !== undefined && { commissionType }),
                ...(commissionRate !== undefined && { commissionRate }),
            },
        });

        logger.info({ dealershipId: id }, 'Dealership updated');

        res.json(dealership);
    } catch (error: any) {
        logger.error({ error }, 'Error updating dealership');
        res.status(500).json({
            status: 500,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
    }
});

export default router;

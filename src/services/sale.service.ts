/**
 * Sale Service for Commission Tracking
 * 
 * Handles sale creation and commission calculation.
 * Commission rates are captured at time of sale to ensure immutability.
 * 
 * _Requirements: 10.3, 10.4, 11.2, 11.3, 11.5_
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AuthUser } from './auth.service';

export interface SaleFilters {
    page?: number;
    limit?: number;
    dealershipId?: string;
    startDate?: Date;
    endDate?: Date;
    isPaid?: boolean;
}

export interface SaleWithDetails {
    id: string;
    leadId: string;
    saleValue: number;
    commissionRate: number;
    commissionType: string;
    commissionAmount: number;
    isPaid: boolean;
    paidAt: Date | null;
    createdAt: Date;
    lead: {
        id: string;
        customerName: string;
        vehicleMarca: string;
        vehicleModelo: string;
        vehicleAno: number;
        dealership: { id: string; name: string } | null;
    };
}

export interface PaginatedSales {
    data: SaleWithDetails[];
    total: number;
    page: number;
    totalPages: number;
}

/**
 * Create a sale record with commission calculation
 * Commission rate and type are captured from dealership at time of sale
 * 
 * _Requirements: 10.3, 10.4, 11.2, 11.3_
 */
export async function createSale(
    leadId: string,
    saleValue: number,
    user: AuthUser
): Promise<SaleWithDetails | null> {
    try {
        // Get lead with dealership info
        const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            include: {
                dealership: true,
                sale: true,
            },
        });

        if (!lead) {
            logger.warn({ leadId }, 'Lead not found for sale creation');
            return null;
        }

        // Check if sale already exists
        if (lead.sale) {
            logger.warn({ leadId }, 'Sale already exists for this lead');
            return null;
        }

        // Access control for sellers
        if (user.role === 'seller' && user.dealershipId && lead.dealershipId !== user.dealershipId) {
            logger.warn({ userId: user.id, leadId }, 'Access denied for sale creation');
            return null;
        }

        // Get commission config from dealership
        const commissionType = lead.dealership?.commissionType || 'percentage';
        const commissionRate = lead.dealership?.commissionRate || 2.0;

        // Calculate commission amount
        let commissionAmount: number;
        if (commissionType === 'percentage') {
            // Percentage: saleValue × rate / 100
            commissionAmount = (saleValue * commissionRate) / 100;
        } else {
            // Fixed: use the rate as fixed amount
            commissionAmount = commissionRate;
        }

        // Create sale and update lead status in transaction
        const [sale] = await prisma.$transaction([
            prisma.sale.create({
                data: {
                    leadId,
                    saleValue,
                    commissionRate,
                    commissionType,
                    commissionAmount,
                },
                include: {
                    lead: {
                        select: {
                            id: true,
                            customerName: true,
                            vehicleMarca: true,
                            vehicleModelo: true,
                            vehicleAno: true,
                            dealership: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.lead.update({
                where: { id: leadId },
                data: { status: 'converted' },
            }),
            prisma.leadEvent.create({
                data: {
                    leadId,
                    eventType: 'status_changed',
                    previousValue: lead.status,
                    newValue: 'converted',
                    userId: user.id,
                },
            }),
        ]);

        logger.info({
            saleId: sale.id,
            leadId,
            saleValue,
            commissionAmount,
            commissionType,
            userId: user.id,
        }, 'Sale created');

        return sale as SaleWithDetails;
    } catch (error) {
        logger.error({ error, leadId, saleValue }, 'Error creating sale');
        throw error;
    }
}

/**
 * Mark a sale's commission as paid
 */
export async function markAsPaid(
    saleId: string,
    user: AuthUser
): Promise<SaleWithDetails | null> {
    try {
        // Only admin can mark as paid
        if (user.role !== 'admin') {
            logger.warn({ userId: user.id, saleId }, 'Access denied for marking sale as paid');
            return null;
        }

        const sale = await prisma.sale.update({
            where: { id: saleId },
            data: {
                isPaid: true,
                paidAt: new Date(),
            },
            include: {
                lead: {
                    select: {
                        id: true,
                        customerName: true,
                        vehicleMarca: true,
                        vehicleModelo: true,
                        vehicleAno: true,
                        dealership: { select: { id: true, name: true } },
                    },
                },
            },
        });

        logger.info({ saleId, userId: user.id }, 'Sale marked as paid');

        return sale as SaleWithDetails;
    } catch (error) {
        logger.error({ error, saleId }, 'Error marking sale as paid');
        throw error;
    }
}

/**
 * List sales with filters (for partner view)
 */
export async function findAll(
    filters: SaleFilters,
    user: AuthUser
): Promise<PaginatedSales> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Filter by dealership
    if (filters.dealershipId) {
        where.lead = { dealershipId: filters.dealershipId };
    }

    // Filter by date range
    if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
            where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
            where.createdAt.lte = filters.endDate;
        }
    }

    // Filter by payment status
    if (filters.isPaid !== undefined) {
        where.isPaid = filters.isPaid;
    }

    try {
        const [sales, total] = await Promise.all([
            prisma.sale.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    lead: {
                        select: {
                            id: true,
                            customerName: true,
                            vehicleMarca: true,
                            vehicleModelo: true,
                            vehicleAno: true,
                            dealership: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.sale.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        logger.debug({ userId: user.id, filters, total }, 'Sales fetched');

        return {
            data: sales as SaleWithDetails[],
            total,
            page,
            totalPages,
        };
    } catch (error) {
        logger.error({ error, filters }, 'Error fetching sales');
        throw error;
    }
}

export const saleService = {
    createSale,
    markAsPaid,
    findAll,
};

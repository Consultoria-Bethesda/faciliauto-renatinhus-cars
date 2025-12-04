/**
 * Metrics Service for Dashboard
 * 
 * Provides dashboard metrics, conversion rates, response times,
 * and partner-specific commission metrics.
 * 
 * _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 10.5, 10.6, 10.7_
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AuthUser } from './auth.service';

export interface MetricFilters {
    dealershipId?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface DashboardMetrics {
    totalLeads: number;
    byStatus: Record<string, number>;
    conversionRate: number;
    avgResponseTime: number;
    byDealership?: Array<{
        dealershipId: string;
        name: string;
        count: number;
        conversionRate: number;
    }>;
}

export interface PartnerMetrics {
    totalConverted: number;
    totalSalesValue: number;
    totalCommissionEarned: number;
    commissionPending: number;
    commissionPaid: number;
    byDealership: Array<{
        dealershipId: string;
        name: string;
        converted: number;
        salesValue: number;
        commission: number;
    }>;
}

/**
 * Build where clause for metrics queries based on filters and user role
 */
function buildMetricsWhereClause(filters: MetricFilters, user: AuthUser): any {
    const where: any = {};

    // Multi-tenant filtering based on user role
    if (user.role === 'seller' && user.dealershipId) {
        where.dealershipId = user.dealershipId;
    } else if (user.role === 'admin' && filters.dealershipId) {
        where.dealershipId = filters.dealershipId;
    }
    // Partners see all dealerships (no filter)

    // Date range filter
    if (filters.startDate || filters.endDate) {
        where.capturedAt = {};
        if (filters.startDate) {
            where.capturedAt.gte = filters.startDate;
        }
        if (filters.endDate) {
            where.capturedAt.lte = filters.endDate;
        }
    }

    return where;
}

/**
 * Get dashboard metrics with status breakdown
 * _Requirements: 5.1, 5.2_
 */
export async function getDashboardMetrics(
    filters: MetricFilters,
    user: AuthUser
): Promise<DashboardMetrics> {
    const where = buildMetricsWhereClause(filters, user);

    try {
        // Get total leads and status breakdown
        const [totalLeads, statusCounts, contactedLeads] = await Promise.all([
            prisma.lead.count({ where }),
            prisma.lead.groupBy({
                by: ['status'],
                where,
                _count: { status: true },
            }),
            prisma.lead.findMany({
                where: {
                    ...where,
                    contactedAt: { not: null },
                },
                select: {
                    capturedAt: true,
                    contactedAt: true,
                },
            }),
        ]);

        // Build byStatus breakdown
        const byStatus: Record<string, number> = {
            pending: 0,
            sent: 0,
            contacted: 0,
            converted: 0,
            lost: 0,
        };
        for (const item of statusCounts) {
            byStatus[item.status] = item._count.status;
        }

        // Calculate conversion rate (converted / totalLeads)
        const conversionRate = totalLeads > 0
            ? byStatus.converted / totalLeads
            : 0;

        // Calculate average response time in minutes
        const avgResponseTime = calculateAverageResponseTime(contactedLeads);

        const metrics: DashboardMetrics = {
            totalLeads,
            byStatus,
            conversionRate,
            avgResponseTime,
        };

        // Add dealership breakdown for admin users
        if (user.role === 'admin') {
            metrics.byDealership = await getDealershipBreakdown(filters);
        }

        logger.debug({ userId: user.id, filters, metrics }, 'Dashboard metrics calculated');

        return metrics;
    } catch (error) {
        logger.error({ error, userId: user.id, filters }, 'Error calculating dashboard metrics');
        throw error;
    }
}


/**
 * Calculate average response time in minutes
 * _Requirements: 5.4_
 */
function calculateAverageResponseTime(
    leads: Array<{ capturedAt: Date; contactedAt: Date | null }>
): number {
    const contactedLeads = leads.filter(l => l.contactedAt !== null);

    if (contactedLeads.length === 0) {
        return 0;
    }

    const totalMinutes = contactedLeads.reduce((sum, lead) => {
        const capturedTime = new Date(lead.capturedAt).getTime();
        const contactedTime = new Date(lead.contactedAt!).getTime();
        const diffMinutes = (contactedTime - capturedTime) / (1000 * 60);
        return sum + diffMinutes;
    }, 0);

    return totalMinutes / contactedLeads.length;
}

/**
 * Get dealership breakdown for admin users
 * _Requirements: 5.5_
 */
async function getDealershipBreakdown(
    filters: MetricFilters
): Promise<Array<{ dealershipId: string; name: string; count: number; conversionRate: number }>> {
    const dateFilter: any = {};
    if (filters.startDate || filters.endDate) {
        dateFilter.capturedAt = {};
        if (filters.startDate) {
            dateFilter.capturedAt.gte = filters.startDate;
        }
        if (filters.endDate) {
            dateFilter.capturedAt.lte = filters.endDate;
        }
    }

    // Get all dealerships with their lead counts
    const dealerships = await prisma.dealership.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            leads: {
                where: dateFilter,
                select: { status: true },
            },
        },
    });

    return dealerships.map(d => {
        const totalLeads = d.leads.length;
        const convertedLeads = d.leads.filter(l => l.status === 'converted').length;
        const conversionRate = totalLeads > 0 ? convertedLeads / totalLeads : 0;

        return {
            dealershipId: d.id,
            name: d.name,
            count: totalLeads,
            conversionRate,
        };
    });
}

/**
 * Get conversion rate for a specific dealership or overall
 * _Requirements: 5.3_
 */
export async function getConversionRate(
    dealershipId?: string,
    dateRange?: { startDate?: Date; endDate?: Date }
): Promise<number> {
    const where: any = {};

    if (dealershipId) {
        where.dealershipId = dealershipId;
    }

    if (dateRange?.startDate || dateRange?.endDate) {
        where.capturedAt = {};
        if (dateRange.startDate) {
            where.capturedAt.gte = dateRange.startDate;
        }
        if (dateRange.endDate) {
            where.capturedAt.lte = dateRange.endDate;
        }
    }

    const [totalLeads, convertedLeads] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.count({ where: { ...where, status: 'converted' } }),
    ]);

    // Handle division by zero
    if (totalLeads === 0) {
        return 0;
    }

    return convertedLeads / totalLeads;
}

/**
 * Get average response time in minutes
 * _Requirements: 5.4_
 */
export async function getAverageResponseTime(
    dealershipId?: string,
    dateRange?: { startDate?: Date; endDate?: Date }
): Promise<number> {
    const where: any = {
        contactedAt: { not: null },
    };

    if (dealershipId) {
        where.dealershipId = dealershipId;
    }

    if (dateRange?.startDate || dateRange?.endDate) {
        where.capturedAt = {};
        if (dateRange.startDate) {
            where.capturedAt.gte = dateRange.startDate;
        }
        if (dateRange.endDate) {
            where.capturedAt.lte = dateRange.endDate;
        }
    }

    const contactedLeads = await prisma.lead.findMany({
        where,
        select: {
            capturedAt: true,
            contactedAt: true,
        },
    });

    return calculateAverageResponseTime(contactedLeads);
}

/**
 * Get partner-specific metrics with commission tracking
 * _Requirements: 10.5, 10.6, 10.7_
 */
export async function getPartnerMetrics(
    filters: MetricFilters,
    user: AuthUser
): Promise<PartnerMetrics> {
    // Partners should only access this endpoint
    if (user.role !== 'partner' && user.role !== 'admin') {
        throw new Error('Access denied: Partner metrics are only available to partners and admins');
    }

    const dateFilter: any = {};
    if (filters.startDate || filters.endDate) {
        dateFilter.createdAt = {};
        if (filters.startDate) {
            dateFilter.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
            dateFilter.createdAt.lte = filters.endDate;
        }
    }

    try {
        // Get all sales with dealership info
        const sales = await prisma.sale.findMany({
            where: dateFilter,
            include: {
                lead: {
                    include: {
                        dealership: { select: { id: true, name: true } },
                    },
                },
            },
        });

        // Calculate totals
        const totalConverted = sales.length;
        const totalSalesValue = sales.reduce((sum, s) => sum + s.saleValue, 0);
        const totalCommissionEarned = sales.reduce((sum, s) => sum + s.commissionAmount, 0);
        const commissionPaid = sales
            .filter(s => s.isPaid)
            .reduce((sum, s) => sum + s.commissionAmount, 0);
        const commissionPending = totalCommissionEarned - commissionPaid;

        // Group by dealership
        const dealershipMap = new Map<string, {
            dealershipId: string;
            name: string;
            converted: number;
            salesValue: number;
            commission: number;
        }>();

        for (const sale of sales) {
            const dealershipId = sale.lead.dealershipId || 'unknown';
            const dealershipName = sale.lead.dealership?.name || 'Unknown';

            if (!dealershipMap.has(dealershipId)) {
                dealershipMap.set(dealershipId, {
                    dealershipId,
                    name: dealershipName,
                    converted: 0,
                    salesValue: 0,
                    commission: 0,
                });
            }

            const entry = dealershipMap.get(dealershipId)!;
            entry.converted += 1;
            entry.salesValue += sale.saleValue;
            entry.commission += sale.commissionAmount;
        }

        const byDealership = Array.from(dealershipMap.values());

        logger.debug({ userId: user.id, filters, totalConverted, totalCommissionEarned }, 'Partner metrics calculated');

        return {
            totalConverted,
            totalSalesValue,
            totalCommissionEarned,
            commissionPending,
            commissionPaid,
            byDealership,
        };
    } catch (error) {
        logger.error({ error, userId: user.id, filters }, 'Error calculating partner metrics');
        throw error;
    }
}

export const metricsService = {
    getDashboardMetrics,
    getConversionRate,
    getAverageResponseTime,
    getPartnerMetrics,
};

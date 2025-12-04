/**
 * Lead Service for Dashboard
 * 
 * Multi-tenant aware service for managing leads.
 * Implements filtering, pagination, ordering, and access control.
 * 
 * _Requirements: 1.3, 2.1, 2.4, 3.1-3.6, 4.2, 4.3, 6.4, 7.3_
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AuthUser } from './auth.service';

export interface LeadFilters {
    page?: number;
    limit?: number;
    status?: string;
    dealershipId?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    vehicleId?: string;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    totalPages: number;
}

export interface LeadWithDetails {
    id: string;
    dealershipId: string | null;
    customerName: string;
    customerPhone: string;
    vehicleId: string;
    vehicleMarca: string;
    vehicleModelo: string;
    vehicleAno: number;
    vehiclePreco: number;
    vehicleUrl: string | null;
    conversationId: string | null;
    conversationSummary: string | null;
    customerPreferences: string | null;
    status: string;
    sentAt: Date | null;
    contactedAt: Date | null;
    sellerPhone: string;
    capturedAt: Date;
    updatedAt: Date;
    dealership?: { id: string; name: string } | null;
    vehicle?: { id: string; fotoUrl: string | null } | null;
}


/**
 * Build Prisma where clause based on filters and user role
 */
function buildWhereClause(filters: LeadFilters, user: AuthUser): any {
    const where: any = {};

    // Multi-tenant filtering based on user role
    if (user.role === 'seller' && user.dealershipId) {
        // Sellers can only see their dealership's leads
        where.dealershipId = user.dealershipId;
    } else if (user.role === 'admin' && filters.dealershipId) {
        // Admins can filter by dealership
        where.dealershipId = filters.dealershipId;
    } else if (user.role === 'partner') {
        // Partners see all dealerships, but default to converted status
        // (handled in the calling function)
    }

    // Status filter
    if (filters.status) {
        where.status = filters.status;
    }

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

    // Search filter (customerName or customerPhone)
    if (filters.search) {
        where.OR = [
            { customerName: { contains: filters.search, mode: 'insensitive' } },
            { customerPhone: { contains: filters.search } },
        ];
    }

    // Vehicle filter
    if (filters.vehicleId) {
        where.vehicleId = filters.vehicleId;
    }

    return where;
}

/**
 * Find all leads with filters and pagination
 * Implements multi-tenant data isolation based on user role
 */
export async function findAll(
    filters: LeadFilters,
    user: AuthUser
): Promise<PaginatedResult<LeadWithDetails>> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    // Apply default filter for partners (converted status)
    const effectiveFilters = { ...filters };
    if (user.role === 'partner' && !filters.status) {
        effectiveFilters.status = 'converted';
    }

    const where = buildWhereClause(effectiveFilters, user);

    try {
        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                skip,
                take: limit,
                orderBy: { capturedAt: 'desc' },
                include: {
                    dealership: { select: { id: true, name: true } },
                    vehicle: { select: { id: true, fotoUrl: true } },
                },
            }),
            prisma.lead.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        logger.debug({ userId: user.id, filters, total, page }, 'Leads fetched');

        return {
            data: leads as LeadWithDetails[],
            total,
            page,
            totalPages,
        };
    } catch (error) {
        logger.error({ error, userId: user.id, filters }, 'Error fetching leads');
        throw error;
    }
}

/**
 * Find a lead by ID with access control
 */
export async function findById(
    id: string,
    user: AuthUser
): Promise<LeadWithDetails | null> {
    try {
        const lead = await prisma.lead.findUnique({
            where: { id },
            include: {
                dealership: { select: { id: true, name: true } },
                vehicle: { select: { id: true, fotoUrl: true } },
            },
        });

        if (!lead) return null;

        // Access control: sellers can only see their dealership's leads
        if (user.role === 'seller' && user.dealershipId && lead.dealershipId !== user.dealershipId) {
            logger.warn({ userId: user.id, leadId: id }, 'Access denied to lead');
            return null;
        }

        return lead as LeadWithDetails;
    } catch (error) {
        logger.error({ error, userId: user.id, leadId: id }, 'Error fetching lead');
        throw error;
    }
}


/**
 * Update lead status with access control
 * Creates a LeadEvent record for the status change
 * Sets contactedAt timestamp when status changes to "contacted"
 */
export async function updateStatus(
    id: string,
    status: string,
    user: AuthUser,
    notes?: string
): Promise<LeadWithDetails | null> {
    try {
        // First check access
        const existingLead = await findById(id, user);
        if (!existingLead) {
            return null;
        }

        const previousStatus = existingLead.status;
        const updateData: any = { status };

        // Set contactedAt when status changes to "contacted"
        if (status === 'contacted' && previousStatus !== 'contacted') {
            updateData.contactedAt = new Date();
        }

        // Update lead and create event in a transaction
        const [updatedLead] = await prisma.$transaction([
            prisma.lead.update({
                where: { id },
                data: updateData,
                include: {
                    dealership: { select: { id: true, name: true } },
                    vehicle: { select: { id: true, fotoUrl: true } },
                },
            }),
            prisma.leadEvent.create({
                data: {
                    leadId: id,
                    eventType: 'status_changed',
                    previousValue: previousStatus,
                    newValue: status,
                    userId: user.id,
                },
            }),
        ]);

        logger.info({ leadId: id, previousStatus, newStatus: status, userId: user.id }, 'Lead status updated');

        return updatedLead as LeadWithDetails;
    } catch (error) {
        logger.error({ error, leadId: id, status, userId: user.id }, 'Error updating lead status');
        throw error;
    }
}

/**
 * Get timeline of events for a lead
 */
export async function getTimeline(id: string, user: AuthUser) {
    try {
        // Check access first
        const lead = await findById(id, user);
        if (!lead) {
            return null;
        }

        const events = await prisma.leadEvent.findMany({
            where: { leadId: id },
            orderBy: { timestamp: 'asc' },
            include: {
                user: { select: { id: true, name: true } },
            },
        });

        return events;
    } catch (error) {
        logger.error({ error, leadId: id, userId: user.id }, 'Error fetching lead timeline');
        throw error;
    }
}

/**
 * Export leads to CSV format
 */
export async function exportToCsv(
    filters: LeadFilters,
    user: AuthUser
): Promise<string> {
    // Remove pagination for export
    const exportFilters = { ...filters, page: 1, limit: 10000 };
    const result = await findAll(exportFilters, user);

    const headers = [
        'ID',
        'Concessionária',
        'Cliente',
        'Telefone',
        'Veículo',
        'Ano',
        'Preço',
        'Status',
        'Data Captura',
        'Data Contato',
        'Preferências',
    ];

    const rows = result.data.map(lead => [
        lead.id,
        lead.dealership?.name || '',
        lead.customerName,
        lead.customerPhone,
        `${lead.vehicleMarca} ${lead.vehicleModelo}`,
        lead.vehicleAno.toString(),
        lead.vehiclePreco.toFixed(2),
        lead.status,
        lead.capturedAt.toISOString(),
        lead.contactedAt?.toISOString() || '',
        lead.customerPreferences || '',
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    logger.info({ userId: user.id, count: result.data.length }, 'Leads exported to CSV');

    return csvContent;
}

export const leadService = {
    findAll,
    findById,
    updateStatus,
    getTimeline,
    exportToCsv,
};

/**
 * Vehicle Sync Service
 * 
 * Synchronizes vehicle data from the scraper with the PostgreSQL database.
 * Handles creating new vehicles, updating existing ones, and marking removed vehicles as unavailable.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { ScrapedVehicle } from './scraper.service';
import type { Vehicle } from '@prisma/client';

/**
 * Result of a sync operation
 * Matches the design document specification
 */
export interface SyncResult {
    added: number;
    updated: number;
    removed: number;
    errors: string[];
}

/**
 * Options for sync operation
 */
export interface SyncOptions {
    /** If true, marks vehicles not in scraped data as unavailable */
    markRemovedAsUnavailable?: boolean;
    /** If true, logs detailed information about each operation */
    verbose?: boolean;
}

/**
 * Generate a unique key for a vehicle based on its identifying attributes
 * Used to match scraped vehicles with existing database records
 */
export function generateVehicleKey(vehicle: { marca: string; modelo: string; ano: number; url?: string | null }): string {
    // Primary key is URL if available (most reliable)
    if (vehicle.url) {
        return vehicle.url.toLowerCase().trim();
    }
    // Fallback to marca+modelo+ano combination
    return `${vehicle.marca}-${vehicle.modelo}-${vehicle.ano}`.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Check if two vehicles are the same based on their key attributes
 */
export function isSameVehicle(
    scraped: ScrapedVehicle,
    existing: Vehicle
): boolean {
    // Match by URL first (most reliable)
    if (scraped.url && existing.url) {
        return scraped.url.toLowerCase().trim() === existing.url.toLowerCase().trim();
    }
    // Fallback to marca+modelo+ano
    return (
        scraped.marca.toLowerCase() === existing.marca.toLowerCase() &&
        scraped.modelo.toLowerCase() === existing.modelo.toLowerCase() &&
        scraped.ano === existing.ano
    );
}

/**
 * Check if vehicle data has changed and needs update
 */
export function hasVehicleChanged(
    scraped: ScrapedVehicle,
    existing: Vehicle
): boolean {
    return (
        scraped.preco !== existing.preco ||
        scraped.km !== existing.km ||
        scraped.cor !== existing.cor ||
        scraped.combustivel !== existing.combustivel ||
        scraped.cambio !== existing.cambio ||
        scraped.carroceria !== existing.carroceria ||
        scraped.versao !== existing.versao ||
        scraped.fotoUrl !== existing.fotoUrl ||
        scraped.descricao !== existing.descricao ||
        scraped.url !== existing.url
    );
}

/**
 * Convert scraped vehicle to Prisma create/update data
 */
export function scrapedToPrismaData(scraped: ScrapedVehicle): {
    marca: string;
    modelo: string;
    versao: string | null;
    ano: number;
    km: number;
    preco: number;
    cor: string;
    combustivel: string;
    cambio: string;
    carroceria: string;
    fotoUrl: string | null;
    fotosUrls: string;
    url: string | null;
    descricao: string | null;
    disponivel: boolean;
} {
    return {
        marca: scraped.marca,
        modelo: scraped.modelo,
        versao: scraped.versao || null,
        ano: scraped.ano,
        km: scraped.km,
        preco: scraped.preco,
        cor: scraped.cor,
        combustivel: scraped.combustivel,
        cambio: scraped.cambio,
        carroceria: scraped.carroceria,
        fotoUrl: scraped.fotoUrl || null,
        fotosUrls: JSON.stringify(scraped.fotosUrls || []),
        url: scraped.url || null,
        descricao: scraped.descricao || null,
        disponivel: true,
    };
}


/**
 * Vehicle Sync Service class
 * Implements the VehicleSyncService interface from design document
 */
export class VehicleSyncService {
    /**
     * Synchronize vehicles from scraper with database
     * 
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
     * 
     * @param vehicles - Array of scraped vehicles
     * @param options - Sync options
     * @returns SyncResult with counts and errors
     */
    async syncFromScraper(
        vehicles: ScrapedVehicle[],
        options: SyncOptions = {}
    ): Promise<SyncResult> {
        const { markRemovedAsUnavailable = true, verbose = false } = options;

        const result: SyncResult = {
            added: 0,
            updated: 0,
            removed: 0,
            errors: [],
        };

        logger.info({ vehicleCount: vehicles.length }, 'Starting vehicle sync');

        try {
            // Get all existing vehicles from database
            const existingVehicles = await prisma.vehicle.findMany({
                where: { disponivel: true },
            });

            logger.info({ existingCount: existingVehicles.length }, 'Found existing vehicles in database');

            // Create a map of existing vehicles by URL for quick lookup
            const existingByUrl = new Map<string, Vehicle>();
            const existingByKey = new Map<string, Vehicle>();

            for (const vehicle of existingVehicles) {
                if (vehicle.url) {
                    existingByUrl.set(vehicle.url.toLowerCase().trim(), vehicle);
                }
                const key = generateVehicleKey(vehicle);
                existingByKey.set(key, vehicle);
            }

            // Track which existing vehicles were matched
            const matchedVehicleIds = new Set<string>();

            // Process each scraped vehicle
            for (const scraped of vehicles) {
                try {
                    // Find matching existing vehicle
                    let existing: Vehicle | undefined;

                    // Try to match by URL first
                    if (scraped.url) {
                        existing = existingByUrl.get(scraped.url.toLowerCase().trim());
                    }

                    // Fallback to key-based matching
                    if (!existing) {
                        const key = generateVehicleKey(scraped);
                        existing = existingByKey.get(key);
                    }

                    if (existing) {
                        // Vehicle exists - check if update needed
                        matchedVehicleIds.add(existing.id);

                        if (hasVehicleChanged(scraped, existing)) {
                            // Update existing vehicle (Requirement 2.2)
                            await prisma.vehicle.update({
                                where: { id: existing.id },
                                data: {
                                    ...scrapedToPrismaData(scraped),
                                    disponivel: true, // Ensure it's marked as available
                                },
                            });

                            result.updated++;

                            if (verbose) {
                                logger.debug({
                                    id: existing.id,
                                    marca: scraped.marca,
                                    modelo: scraped.modelo,
                                }, 'Vehicle updated');
                            }
                        } else {
                            // No changes needed, but ensure it's marked as available
                            if (!existing.disponivel) {
                                await prisma.vehicle.update({
                                    where: { id: existing.id },
                                    data: { disponivel: true },
                                });
                                result.updated++;
                            }
                        }
                    } else {
                        // New vehicle - create it (Requirement 2.1)
                        const created = await prisma.vehicle.create({
                            data: scrapedToPrismaData(scraped),
                        });

                        result.added++;

                        if (verbose) {
                            logger.debug({
                                id: created.id,
                                marca: scraped.marca,
                                modelo: scraped.modelo,
                                url: scraped.url,
                            }, 'Vehicle created');
                        }
                    }
                } catch (error) {
                    const errorMsg = `Failed to sync vehicle ${scraped.marca} ${scraped.modelo}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    result.errors.push(errorMsg);
                    logger.error({ error, vehicle: scraped }, 'Failed to sync vehicle');
                }
            }

            // Mark removed vehicles as unavailable (Requirement 2.3)
            if (markRemovedAsUnavailable) {
                const removedCount = await this.markRemovedAsUnavailable(
                    existingVehicles,
                    matchedVehicleIds,
                    verbose
                );
                result.removed = removedCount;
            }

            // Log sync summary (Requirement 2.5)
            logger.info({
                added: result.added,
                updated: result.updated,
                removed: result.removed,
                errors: result.errors.length,
            }, 'Vehicle sync completed');

            return result;
        } catch (error) {
            const errorMsg = `Sync operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            result.errors.push(errorMsg);
            logger.error({ error }, 'Vehicle sync failed');
            return result;
        }
    }

    /**
     * Mark vehicles that are no longer on the website as unavailable
     * Preserves the vehicle record and recommendation history
     * 
     * Requirement 2.3
     */
    private async markRemovedAsUnavailable(
        existingVehicles: Vehicle[],
        matchedIds: Set<string>,
        verbose: boolean
    ): Promise<number> {
        let removedCount = 0;

        for (const vehicle of existingVehicles) {
            if (!matchedIds.has(vehicle.id)) {
                try {
                    await prisma.vehicle.update({
                        where: { id: vehicle.id },
                        data: { disponivel: false },
                    });

                    removedCount++;

                    if (verbose) {
                        logger.debug({
                            id: vehicle.id,
                            marca: vehicle.marca,
                            modelo: vehicle.modelo,
                        }, 'Vehicle marked as unavailable');
                    }
                } catch (error) {
                    logger.error({ error, vehicleId: vehicle.id }, 'Failed to mark vehicle as unavailable');
                }
            }
        }

        if (removedCount > 0) {
            logger.info({ count: removedCount }, 'Vehicles marked as unavailable');
        }

        return removedCount;
    }

    /**
     * Mark specific vehicles as unavailable by their IDs
     * 
     * Requirement 2.3
     */
    async markUnavailable(vehicleIds: string[]): Promise<void> {
        if (vehicleIds.length === 0) return;

        logger.info({ count: vehicleIds.length }, 'Marking vehicles as unavailable');

        await prisma.vehicle.updateMany({
            where: { id: { in: vehicleIds } },
            data: { disponivel: false },
        });

        logger.info({ count: vehicleIds.length }, 'Vehicles marked as unavailable');
    }

    /**
     * Get the timestamp of the last sync operation
     * Based on the most recent vehicle update
     */
    async getLastSyncTime(): Promise<Date | null> {
        const lastUpdated = await prisma.vehicle.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
        });

        return lastUpdated?.updatedAt || null;
    }

    /**
     * Get sync statistics
     */
    async getSyncStats(): Promise<{
        totalVehicles: number;
        availableVehicles: number;
        unavailableVehicles: number;
        lastSyncTime: Date | null;
    }> {
        const [total, available, lastSync] = await Promise.all([
            prisma.vehicle.count(),
            prisma.vehicle.count({ where: { disponivel: true } }),
            this.getLastSyncTime(),
        ]);

        return {
            totalVehicles: total,
            availableVehicles: available,
            unavailableVehicles: total - available,
            lastSyncTime: lastSync,
        };
    }

    /**
     * Validate that a URL points to a valid vehicle detail page
     * 
     * Requirement 2.4
     */
    isValidVehicleUrl(url: string | null | undefined): boolean {
        if (!url) return false;

        try {
            const parsed = new URL(url);
            // Must be HTTPS or HTTP
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return false;
            }
            // Should be from the expected domain
            if (!parsed.hostname.includes('renatinhuscars.com.br')) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }
}

// Export singleton instance
export const vehicleSyncService = new VehicleSyncService();

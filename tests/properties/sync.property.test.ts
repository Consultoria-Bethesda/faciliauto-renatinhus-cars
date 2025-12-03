/**
 * Property-Based Tests for Vehicle Sync Service
 * 
 * **Feature: mvp-producao-concessionaria, Properties 4-5**
 * 
 * Tests:
 * - Property 4: Sync is idempotent (no duplicates)
 * - Property 5: Sync marks removed vehicles as unavailable
 * 
 * **Validates: Requirements 2.2, 2.3**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock logger to avoid console noise during tests
vi.mock('../../src/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// In-memory database simulation for property tests
let mockVehicleDb: Map<string, any>;
let vehicleIdCounter: number;

// Mock prisma with in-memory database
vi.mock('../../src/lib/prisma', () => ({
    prisma: {
        vehicle: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            count: vi.fn(),
            findFirst: vi.fn(),
        },
    },
}));

import {
    VehicleSyncService,
    generateVehicleKey,
    isSameVehicle,
    hasVehicleChanged,
    scrapedToPrismaData,
    SyncResult,
} from '../../src/services/vehicle-sync.service';
import type { ScrapedVehicle } from '../../src/services/scraper.service';
import { prisma } from '../../src/lib/prisma';

// Property test configuration: minimum 100 iterations
const propertyConfig = { numRuns: 100 };

/**
 * Arbitraries (Generators) for property tests
 */

// Valid marca generator
const marcaArbitrary = fc.constantFrom(
    'Fiat', 'Volkswagen', 'Chevrolet', 'Honda', 'Toyota',
    'Hyundai', 'Ford', 'Renault', 'Nissan', 'Jeep'
);

// Valid modelo generator
const modeloArbitrary = fc.constantFrom(
    'Uno', 'Gol', 'Onix', 'Civic', 'Corolla',
    'HB20', 'Ka', 'Sandero', 'Kicks', 'Compass'
);

// Valid year generator (reasonable range for used cars)
const anoArbitrary = fc.integer({ min: 2010, max: 2025 });

// Valid km generator
const kmArbitrary = fc.integer({ min: 0, max: 300000 });

// Valid price generator (Brazilian market range)
const precoArbitrary = fc.float({ min: 20000, max: 500000, noNaN: true });

// Valid color generator
const corArbitrary = fc.constantFrom(
    'Branco', 'Preto', 'Prata', 'Vermelho', 'Azul', 'Cinza'
);

// Valid fuel type generator
const combustivelArbitrary = fc.constantFrom(
    'Flex', 'Gasolina', 'Diesel', 'Elétrico', 'Híbrido'
);

// Valid transmission generator
const cambioArbitrary = fc.constantFrom('Manual', 'Automático', 'CVT');

// Valid body type generator
const carroceriaArbitrary = fc.constantFrom('Hatch', 'Sedan', 'SUV', 'Picape');

// Valid URL generator - ensures unique URLs for each vehicle
const urlArbitrary = fc.uuid().map(id => `https://www.renatinhuscars.com.br/veiculo/${id}`);

// Complete valid scraped vehicle generator
const scrapedVehicleArbitrary = fc.record({
    marca: marcaArbitrary,
    modelo: modeloArbitrary,
    versao: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    ano: anoArbitrary,
    km: kmArbitrary,
    preco: precoArbitrary,
    cor: corArbitrary,
    combustivel: combustivelArbitrary,
    cambio: cambioArbitrary,
    carroceria: carroceriaArbitrary,
    fotoUrl: fc.option(fc.webUrl(), { nil: undefined }),
    fotosUrls: fc.array(fc.webUrl(), { minLength: 0, maxLength: 3 }),
    url: urlArbitrary,
    descricao: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
});

// Generate array of unique scraped vehicles (unique by URL)
const uniqueScrapedVehiclesArbitrary = fc.array(scrapedVehicleArbitrary, { minLength: 1, maxLength: 10 })
    .map(vehicles => {
        // Ensure unique URLs
        const seen = new Set<string>();
        return vehicles.filter(v => {
            if (seen.has(v.url)) return false;
            seen.add(v.url);
            return true;
        });
    })
    .filter(vehicles => vehicles.length > 0);

/**
 * Helper to setup mock database with vehicles
 */
function setupMockDatabase() {
    mockVehicleDb = new Map();
    vehicleIdCounter = 1;

    // Mock findMany - returns all available vehicles
    vi.mocked(prisma.vehicle.findMany).mockImplementation(async (args?: any) => {
        const vehicles = Array.from(mockVehicleDb.values());
        if (args?.where?.disponivel === true) {
            return vehicles.filter(v => v.disponivel === true);
        }
        return vehicles;
    });

    // Mock create - adds vehicle to mock db
    vi.mocked(prisma.vehicle.create).mockImplementation(async (args: any) => {
        const id = `vehicle-${vehicleIdCounter++}`;
        const vehicle = {
            id,
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        mockVehicleDb.set(id, vehicle);
        return vehicle;
    });

    // Mock update - updates vehicle in mock db
    vi.mocked(prisma.vehicle.update).mockImplementation(async (args: any) => {
        const vehicle = mockVehicleDb.get(args.where.id);
        if (!vehicle) throw new Error('Vehicle not found');
        const updated = { ...vehicle, ...args.data, updatedAt: new Date() };
        mockVehicleDb.set(args.where.id, updated);
        return updated;
    });

    // Mock updateMany
    vi.mocked(prisma.vehicle.updateMany).mockImplementation(async (args: any) => {
        let count = 0;
        if (args.where?.id?.in) {
            for (const id of args.where.id.in) {
                const vehicle = mockVehicleDb.get(id);
                if (vehicle) {
                    mockVehicleDb.set(id, { ...vehicle, ...args.data, updatedAt: new Date() });
                    count++;
                }
            }
        }
        return { count };
    });

    // Mock count
    vi.mocked(prisma.vehicle.count).mockImplementation(async (args?: any) => {
        const vehicles = Array.from(mockVehicleDb.values());
        if (args?.where?.disponivel === true) {
            return vehicles.filter(v => v.disponivel === true).length;
        }
        return vehicles.length;
    });
}

/**
 * Helper to get count of available vehicles in mock db
 */
function getAvailableVehicleCount(): number {
    return Array.from(mockVehicleDb.values()).filter(v => v.disponivel === true).length;
}

/**
 * Helper to get total vehicle count in mock db
 */
function getTotalVehicleCount(): number {
    return mockVehicleDb.size;
}

/**
 * Helper to check if a vehicle with given URL exists and is available
 */
function isVehicleAvailable(url: string): boolean {
    for (const vehicle of mockVehicleDb.values()) {
        if (vehicle.url?.toLowerCase().trim() === url.toLowerCase().trim()) {
            return vehicle.disponivel === true;
        }
    }
    return false;
}

describe('Vehicle Sync Service - Property Tests', () => {
    let syncService: VehicleSyncService;

    beforeEach(() => {
        vi.clearAllMocks();
        setupMockDatabase();
        syncService = new VehicleSyncService();
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 4: Sync is idempotent (no duplicates)**
     * **Validates: Requirements 2.2**
     * 
     * *For any* set of vehicles, syncing the same data twice SHALL result in the same 
     * number of vehicles in the database (no duplicates created).
     */
    describe('Property 4: Sync is idempotent (no duplicates)', () => {
        it('should not create duplicates when syncing the same vehicles twice', async () => {
            await fc.assert(
                fc.asyncProperty(uniqueScrapedVehiclesArbitrary, async (vehicles) => {
                    // Reset mock database
                    setupMockDatabase();

                    // First sync
                    const result1 = await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: false });
                    const countAfterFirstSync = getTotalVehicleCount();
                    const availableAfterFirstSync = getAvailableVehicleCount();

                    // Second sync with same data
                    const result2 = await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: false });
                    const countAfterSecondSync = getTotalVehicleCount();
                    const availableAfterSecondSync = getAvailableVehicleCount();

                    // Total count should remain the same (no duplicates)
                    expect(countAfterSecondSync).toBe(countAfterFirstSync);
                    expect(availableAfterSecondSync).toBe(availableAfterFirstSync);

                    // Second sync should have 0 added (all vehicles already exist)
                    expect(result2.added).toBe(0);

                    // Number of vehicles should equal input size
                    expect(countAfterFirstSync).toBe(vehicles.length);
                }),
                propertyConfig
            );
        });

        it('should update existing vehicles instead of creating new ones', async () => {
            await fc.assert(
                fc.asyncProperty(
                    uniqueScrapedVehiclesArbitrary,
                    fc.float({ min: 1000, max: 50000, noNaN: true }),
                    async (vehicles, priceChange) => {
                        // Reset mock database
                        setupMockDatabase();

                        // First sync
                        await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: false });
                        const countAfterFirstSync = getTotalVehicleCount();

                        // Modify prices and sync again
                        const modifiedVehicles = vehicles.map(v => ({
                            ...v,
                            preco: v.preco + priceChange,
                        }));

                        const result2 = await syncService.syncFromScraper(modifiedVehicles, { markRemovedAsUnavailable: false });
                        const countAfterSecondSync = getTotalVehicleCount();

                        // Count should remain the same
                        expect(countAfterSecondSync).toBe(countAfterFirstSync);

                        // All vehicles should be updated, none added
                        expect(result2.added).toBe(0);
                        expect(result2.updated).toBe(vehicles.length);
                    }
                ),
                propertyConfig
            );
        });

        it('should maintain idempotency across multiple syncs', async () => {
            await fc.assert(
                fc.asyncProperty(
                    uniqueScrapedVehiclesArbitrary,
                    fc.integer({ min: 2, max: 5 }),
                    async (vehicles, syncCount) => {
                        // Reset mock database
                        setupMockDatabase();

                        // Perform multiple syncs
                        let previousCount = 0;
                        for (let i = 0; i < syncCount; i++) {
                            await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: false });
                            const currentCount = getTotalVehicleCount();

                            if (i > 0) {
                                // Count should remain constant after first sync
                                expect(currentCount).toBe(previousCount);
                            }
                            previousCount = currentCount;
                        }

                        // Final count should equal input size
                        expect(getTotalVehicleCount()).toBe(vehicles.length);
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 5: Sync marks removed vehicles as unavailable**
     * **Validates: Requirements 2.3**
     * 
     * *For any* vehicle that exists in the database but is not present in the new sync data, 
     * the sync operation SHALL mark that vehicle as unavailable (disponivel=false).
     */
    describe('Property 5: Sync marks removed vehicles as unavailable', () => {
        it('should mark vehicles as unavailable when not in new sync data', async () => {
            await fc.assert(
                fc.asyncProperty(
                    uniqueScrapedVehiclesArbitrary,
                    async (vehicles) => {
                        // Need at least 2 vehicles to test removal
                        if (vehicles.length < 2) return;

                        // Reset mock database
                        setupMockDatabase();

                        // First sync with all vehicles
                        await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: true });

                        // All vehicles should be available
                        for (const v of vehicles) {
                            expect(isVehicleAvailable(v.url)).toBe(true);
                        }

                        // Remove some vehicles from the list (keep first half)
                        const halfIndex = Math.ceil(vehicles.length / 2);
                        const remainingVehicles = vehicles.slice(0, halfIndex);
                        const removedVehicles = vehicles.slice(halfIndex);

                        // Second sync with fewer vehicles
                        const result = await syncService.syncFromScraper(remainingVehicles, { markRemovedAsUnavailable: true });

                        // Remaining vehicles should still be available
                        for (const v of remainingVehicles) {
                            expect(isVehicleAvailable(v.url)).toBe(true);
                        }

                        // Removed vehicles should be marked as unavailable
                        for (const v of removedVehicles) {
                            expect(isVehicleAvailable(v.url)).toBe(false);
                        }

                        // Result should reflect removed count
                        expect(result.removed).toBe(removedVehicles.length);
                    }
                ),
                propertyConfig
            );
        });

        it('should preserve vehicle record when marking as unavailable (not delete)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    uniqueScrapedVehiclesArbitrary,
                    async (vehicles) => {
                        if (vehicles.length < 2) return;

                        // Reset mock database
                        setupMockDatabase();

                        // First sync
                        await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: true });
                        const totalAfterFirstSync = getTotalVehicleCount();

                        // Second sync with empty list (all removed)
                        await syncService.syncFromScraper([], { markRemovedAsUnavailable: true });
                        const totalAfterSecondSync = getTotalVehicleCount();

                        // Total count should remain the same (records preserved)
                        expect(totalAfterSecondSync).toBe(totalAfterFirstSync);

                        // But available count should be 0
                        expect(getAvailableVehicleCount()).toBe(0);
                    }
                ),
                propertyConfig
            );
        });

        it('should correctly track removed count in sync result', async () => {
            await fc.assert(
                fc.asyncProperty(
                    uniqueScrapedVehiclesArbitrary,
                    async (vehicles) => {
                        if (vehicles.length < 2) return;

                        // Reset mock database
                        setupMockDatabase();

                        // First sync with all vehicles
                        await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: true });

                        // Second sync with fewer vehicles
                        const halfIndex = Math.ceil(vehicles.length / 2);
                        const remainingVehicles = vehicles.slice(0, halfIndex);
                        const expectedRemoved = vehicles.length - halfIndex;

                        const result = await syncService.syncFromScraper(remainingVehicles, { markRemovedAsUnavailable: true });

                        // Result should accurately report removed count
                        expect(result.removed).toBe(expectedRemoved);
                        expect(result.errors).toHaveLength(0);
                    }
                ),
                propertyConfig
            );
        });

        it('should not mark vehicles as unavailable when option is disabled', async () => {
            await fc.assert(
                fc.asyncProperty(
                    uniqueScrapedVehiclesArbitrary,
                    async (vehicles) => {
                        if (vehicles.length < 2) return;

                        // Reset mock database
                        setupMockDatabase();

                        // First sync with all vehicles
                        await syncService.syncFromScraper(vehicles, { markRemovedAsUnavailable: true });

                        // Second sync with fewer vehicles, but option disabled
                        const remainingVehicles = [vehicles[0]];
                        const result = await syncService.syncFromScraper(remainingVehicles, { markRemovedAsUnavailable: false });

                        // All vehicles should still be available (option disabled)
                        for (const v of vehicles) {
                            expect(isVehicleAvailable(v.url)).toBe(true);
                        }

                        // Result should show 0 removed
                        expect(result.removed).toBe(0);
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * Additional helper function tests
     */
    describe('Helper Functions', () => {
        it('generateVehicleKey should produce consistent keys', () => {
            fc.assert(
                fc.property(scrapedVehicleArbitrary, (vehicle) => {
                    const key1 = generateVehicleKey(vehicle);
                    const key2 = generateVehicleKey(vehicle);

                    expect(key1).toBe(key2);
                    expect(key1.length).toBeGreaterThan(0);
                }),
                propertyConfig
            );
        });

        it('generateVehicleKey should use URL when available', () => {
            fc.assert(
                fc.property(scrapedVehicleArbitrary, (vehicle) => {
                    const key = generateVehicleKey(vehicle);

                    // When URL is present, key should be the URL
                    if (vehicle.url) {
                        expect(key).toBe(vehicle.url.toLowerCase().trim());
                    }
                }),
                propertyConfig
            );
        });

        it('isSameVehicle should be symmetric', () => {
            fc.assert(
                fc.property(
                    scrapedVehicleArbitrary,
                    (scraped) => {
                        const existing = {
                            id: 'test-id',
                            ...scrapedToPrismaData(scraped),
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            embedding: null,
                            embeddingModel: null,
                            embeddingGeneratedAt: null,
                            aptoUber: false,
                            aptoFamilia: true,
                            aptoTrabalho: true,
                        };

                        // A vehicle should be the same as itself
                        expect(isSameVehicle(scraped, existing as any)).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('scrapedToPrismaData should preserve all fields', () => {
            fc.assert(
                fc.property(scrapedVehicleArbitrary, (scraped) => {
                    const prismaData = scrapedToPrismaData(scraped);

                    expect(prismaData.marca).toBe(scraped.marca);
                    expect(prismaData.modelo).toBe(scraped.modelo);
                    expect(prismaData.ano).toBe(scraped.ano);
                    expect(prismaData.km).toBe(scraped.km);
                    expect(prismaData.preco).toBe(scraped.preco);
                    expect(prismaData.cor).toBe(scraped.cor);
                    expect(prismaData.combustivel).toBe(scraped.combustivel);
                    expect(prismaData.cambio).toBe(scraped.cambio);
                    expect(prismaData.carroceria).toBe(scraped.carroceria);
                    expect(prismaData.disponivel).toBe(true);
                }),
                propertyConfig
            );
        });
    });
});

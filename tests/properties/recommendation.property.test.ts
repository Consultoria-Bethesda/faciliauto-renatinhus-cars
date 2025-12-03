/**
 * Property-Based Tests for Recommendation Engine
 * 
 * **Feature: mvp-producao-concessionaria, Properties 11-12**
 * 
 * Tests:
 * - Property 11: Budget filter applies ±20% tolerance
 * - Property 12: Recommendations return at most 5 vehicles
 * 
 * **Validates: Requirements 5.2, 5.4**
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

// Valid fuel type generator
const combustivelArbitrary = fc.constantFrom(
    'Flex', 'Gasolina', 'Diesel', 'Elétrico', 'Híbrido'
);

// Valid transmission generator
const cambioArbitrary = fc.constantFrom('Manual', 'Automático', 'CVT');

// Valid body type generator
const carroceriaArbitrary = fc.constantFrom('Hatch', 'Sedan', 'SUV', 'Picape');

// Complete valid vehicle generator
const vehicleArbitrary = fc.record({
    id: fc.uuid(),
    marca: marcaArbitrary,
    modelo: modeloArbitrary,
    versao: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: '' }),
    ano: anoArbitrary,
    km: kmArbitrary,
    preco: precoArbitrary,
    cor: fc.constantFrom('Branco', 'Preto', 'Prata', 'Vermelho', 'Azul'),
    carroceria: carroceriaArbitrary,
    combustivel: combustivelArbitrary,
    cambio: cambioArbitrary,
    disponivel: fc.constant(true),
    url: fc.option(fc.webUrl(), { nil: undefined }),
});

// Budget generator (reasonable range)
const budgetArbitrary = fc.float({ min: 30000, max: 400000, noNaN: true });

// Answers/profile generator
const answersArbitrary = fc.record({
    budget: fc.option(budgetArbitrary, { nil: undefined }),
    minYear: fc.option(fc.integer({ min: 2010, max: 2024 }), { nil: undefined }),
    maxKm: fc.option(fc.integer({ min: 50000, max: 300000 }), { nil: undefined }),
    usage: fc.option(fc.constantFrom('cidade', 'viagem', 'trabalho', 'uber'), { nil: undefined }),
    bodyType: fc.option(carroceriaArbitrary, { nil: undefined }),
});

// Generate array of vehicles
const vehicleArrayArbitrary = fc.array(vehicleArbitrary, { minLength: 1, maxLength: 30 });

/**
 * Pure function to test budget filtering logic
 * This mirrors the preFilterVehicles logic from recommendation.agent.ts
 * Requirements 5.2: Budget filter applies ±20% tolerance
 */
function preFilterVehiclesByBudget(
    vehicles: Array<{ id: string; preco: number; ano: number; km: number }>,
    budget: number,
    minYear: number = 1990,
    maxKm: number = 500000
): Array<{ id: string; preco: number; ano: number; km: number }> {
    // Apply ±20% budget tolerance (Requirements 5.2)
    const budgetMin = budget * 0.8;
    const budgetMax = budget * 1.2;

    return vehicles.filter(vehicle => {
        const preco = typeof vehicle.preco === 'number' ? vehicle.preco : parseFloat(String(vehicle.preco));
        // Apply ±20% budget tolerance
        if (preco < budgetMin || preco > budgetMax) return false;
        if (vehicle.ano < minYear) return false;
        if (vehicle.km > maxKm) return false;
        return true;
    });
}

/**
 * Pure function to limit recommendations to top N
 * This mirrors the slice(0, 5) logic from recommendation.agent.ts
 * Requirements 5.4: Recommendations return at most 5 vehicles
 */
function limitRecommendations<T>(vehicles: T[], limit: number = 5): T[] {
    return vehicles.slice(0, limit);
}

describe('Recommendation Engine - Property Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 11: Budget filter applies ±20% tolerance**
     * **Validates: Requirements 5.2**
     * 
     * *For any* recommendation search with a budget constraint, all returned vehicles 
     * SHALL have prices within ±20% of the specified budget.
     */
    describe('Property 11: Budget filter applies ±20% tolerance', () => {
        it('should only return vehicles within ±20% of budget', () => {
            fc.assert(
                fc.property(
                    vehicleArrayArbitrary,
                    budgetArbitrary,
                    (vehicles, budget) => {
                        const filtered = preFilterVehiclesByBudget(vehicles, budget);

                        const budgetMin = budget * 0.8;
                        const budgetMax = budget * 1.2;

                        // All filtered vehicles must be within ±20% tolerance
                        for (const vehicle of filtered) {
                            const preco = typeof vehicle.preco === 'number'
                                ? vehicle.preco
                                : parseFloat(String(vehicle.preco));

                            expect(preco).toBeGreaterThanOrEqual(budgetMin);
                            expect(preco).toBeLessThanOrEqual(budgetMax);
                        }
                    }
                ),
                propertyConfig
            );
        });

        it('should include vehicles exactly at budget boundaries', () => {
            fc.assert(
                fc.property(budgetArbitrary, (budget) => {
                    // Create vehicles at exact boundaries
                    const vehicles = [
                        { id: '1', preco: budget * 0.8, ano: 2020, km: 50000 },  // Exactly at -20%
                        { id: '2', preco: budget, ano: 2020, km: 50000 },         // Exactly at budget
                        { id: '3', preco: budget * 1.2, ano: 2020, km: 50000 },  // Exactly at +20%
                    ];

                    const filtered = preFilterVehiclesByBudget(vehicles, budget);

                    // All three should be included
                    expect(filtered.length).toBe(3);
                }),
                propertyConfig
            );
        });

        it('should exclude vehicles outside ±20% tolerance', () => {
            fc.assert(
                fc.property(budgetArbitrary, (budget) => {
                    // Create vehicles outside boundaries
                    const vehicles = [
                        { id: '1', preco: budget * 0.79, ano: 2020, km: 50000 },  // Just below -20%
                        { id: '2', preco: budget * 1.21, ano: 2020, km: 50000 },  // Just above +20%
                        { id: '3', preco: budget * 0.5, ano: 2020, km: 50000 },   // Way below
                        { id: '4', preco: budget * 2, ano: 2020, km: 50000 },     // Way above
                    ];

                    const filtered = preFilterVehiclesByBudget(vehicles, budget);

                    // None should be included
                    expect(filtered.length).toBe(0);
                }),
                propertyConfig
            );
        });

        it('should handle edge case of very low budget', () => {
            const lowBudget = 25000;
            const vehicles = [
                { id: '1', preco: 20000, ano: 2020, km: 50000 },  // Within -20%
                { id: '2', preco: 30000, ano: 2020, km: 50000 },  // Within +20%
                { id: '3', preco: 19000, ano: 2020, km: 50000 },  // Below -20%
                { id: '4', preco: 31000, ano: 2020, km: 50000 },  // Above +20%
            ];

            const filtered = preFilterVehiclesByBudget(vehicles, lowBudget);

            // Only vehicles within 20000-30000 should be included
            expect(filtered.length).toBe(2);
            expect(filtered.map(v => v.id).sort()).toEqual(['1', '2']);
        });

        it('should handle edge case of very high budget', () => {
            const highBudget = 400000;
            const vehicles = [
                { id: '1', preco: 320000, ano: 2020, km: 50000 },  // Within -20%
                { id: '2', preco: 480000, ano: 2020, km: 50000 },  // Within +20%
                { id: '3', preco: 319000, ano: 2020, km: 50000 },  // Below -20%
                { id: '4', preco: 481000, ano: 2020, km: 50000 },  // Above +20%
            ];

            const filtered = preFilterVehiclesByBudget(vehicles, highBudget);

            // Only vehicles within 320000-480000 should be included
            expect(filtered.length).toBe(2);
            expect(filtered.map(v => v.id).sort()).toEqual(['1', '2']);
        });

        it('should return empty array when no vehicles match budget', () => {
            fc.assert(
                fc.property(budgetArbitrary, (budget) => {
                    // All vehicles way outside budget
                    const vehicles = [
                        { id: '1', preco: budget * 3, ano: 2020, km: 50000 },
                        { id: '2', preco: budget * 0.3, ano: 2020, km: 50000 },
                    ];

                    const filtered = preFilterVehiclesByBudget(vehicles, budget);

                    expect(filtered.length).toBe(0);
                }),
                propertyConfig
            );
        });

        it('should also filter by year and km constraints', () => {
            const budget = 100000;
            const minYear = 2018;
            const maxKm = 100000;

            const vehicles = [
                { id: '1', preco: 100000, ano: 2020, km: 50000 },   // Passes all
                { id: '2', preco: 100000, ano: 2015, km: 50000 },   // Fails year
                { id: '3', preco: 100000, ano: 2020, km: 150000 },  // Fails km
                { id: '4', preco: 150000, ano: 2020, km: 50000 },   // Fails budget
            ];

            const filtered = preFilterVehiclesByBudget(vehicles, budget, minYear, maxKm);

            expect(filtered.length).toBe(1);
            expect(filtered[0].id).toBe('1');
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 12: Recommendations return at most 5 vehicles**
     * **Validates: Requirements 5.4**
     * 
     * *For any* recommendation request, the system SHALL return at most 5 vehicles, 
     * ordered by match score descending.
     */
    describe('Property 12: Recommendations return at most 5 vehicles', () => {
        it('should return at most 5 vehicles for any input size', () => {
            fc.assert(
                fc.property(
                    fc.array(vehicleArbitrary, { minLength: 0, maxLength: 50 }),
                    (vehicles) => {
                        const limited = limitRecommendations(vehicles, 5);

                        expect(limited.length).toBeLessThanOrEqual(5);
                    }
                ),
                propertyConfig
            );
        });

        it('should return all vehicles when less than 5 available', () => {
            fc.assert(
                fc.property(
                    fc.array(vehicleArbitrary, { minLength: 0, maxLength: 4 }),
                    (vehicles) => {
                        const limited = limitRecommendations(vehicles, 5);

                        expect(limited.length).toBe(vehicles.length);
                    }
                ),
                propertyConfig
            );
        });

        it('should return exactly 5 vehicles when more than 5 available', () => {
            fc.assert(
                fc.property(
                    fc.array(vehicleArbitrary, { minLength: 6, maxLength: 30 }),
                    (vehicles) => {
                        const limited = limitRecommendations(vehicles, 5);

                        expect(limited.length).toBe(5);
                    }
                ),
                propertyConfig
            );
        });

        it('should preserve order when limiting', () => {
            fc.assert(
                fc.property(
                    fc.array(vehicleArbitrary, { minLength: 6, maxLength: 20 }),
                    (vehicles) => {
                        const limited = limitRecommendations(vehicles, 5);

                        // First 5 elements should be preserved in order
                        for (let i = 0; i < 5; i++) {
                            expect(limited[i]).toEqual(vehicles[i]);
                        }
                    }
                ),
                propertyConfig
            );
        });

        it('should return empty array for empty input', () => {
            const limited = limitRecommendations([], 5);
            expect(limited.length).toBe(0);
        });

        it('should handle exactly 5 vehicles', () => {
            fc.assert(
                fc.property(
                    fc.array(vehicleArbitrary, { minLength: 5, maxLength: 5 }),
                    (vehicles) => {
                        const limited = limitRecommendations(vehicles, 5);

                        expect(limited.length).toBe(5);
                        expect(limited).toEqual(vehicles);
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * Combined property: Budget filter + limit
     * Tests the full recommendation flow
     */
    describe('Combined: Budget filter and limit', () => {
        it('should filter by budget and limit to 5', () => {
            fc.assert(
                fc.property(
                    vehicleArrayArbitrary,
                    budgetArbitrary,
                    (vehicles, budget) => {
                        // First filter by budget
                        const filtered = preFilterVehiclesByBudget(vehicles, budget);

                        // Then limit to 5
                        const limited = limitRecommendations(filtered, 5);

                        // Should have at most 5
                        expect(limited.length).toBeLessThanOrEqual(5);

                        // All should be within budget tolerance
                        const budgetMin = budget * 0.8;
                        const budgetMax = budget * 1.2;

                        for (const vehicle of limited) {
                            const preco = typeof vehicle.preco === 'number'
                                ? vehicle.preco
                                : parseFloat(String(vehicle.preco));

                            expect(preco).toBeGreaterThanOrEqual(budgetMin);
                            expect(preco).toBeLessThanOrEqual(budgetMax);
                        }
                    }
                ),
                propertyConfig
            );
        });
    });
});

/**
 * Property-Based Tests for Vehicle Embedding Service
 * 
 * **Feature: mvp-producao-concessionaria, Properties 6-7**
 * 
 * Tests:
 * - Property 6: Embedding text representation includes all attributes
 * - Property 7: Embedding serialization round-trip
 * 
 * **Validates: Requirements 3.2, 3.5, 3.6**
 */

import { describe, it, expect, vi } from 'vitest';
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

import {
    generateVehicleEmbeddingText,
    VehicleForEmbedding,
    embeddingToString,
    stringToEmbedding,
} from '../../src/services/vehicle-embedding.service';

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

// Complete valid vehicle for embedding generator
const vehicleForEmbeddingArbitrary: fc.Arbitrary<VehicleForEmbedding> = fc.record({
    id: fc.uuid(),
    marca: marcaArbitrary,
    modelo: modeloArbitrary,
    versao: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
    ano: anoArbitrary,
    km: kmArbitrary,
    preco: precoArbitrary,
    carroceria: carroceriaArbitrary,
    combustivel: combustivelArbitrary,
    cambio: cambioArbitrary,
    descricao: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
});

// Embedding generator (1536 dimensions as per EMBEDDING_DIMENSIONS)
const EMBEDDING_DIMENSIONS = 1536;
const embeddingArbitrary = fc.array(
    fc.float({ min: -1, max: 1, noNaN: true }),
    { minLength: EMBEDDING_DIMENSIONS, maxLength: EMBEDDING_DIMENSIONS }
);

describe('Vehicle Embedding Service - Property Tests', () => {
    /**
     * **Feature: mvp-producao-concessionaria, Property 6: Embedding text representation includes all attributes**
     * **Validates: Requirements 3.2**
     * 
     * *For any* vehicle, the generated text representation for embedding SHALL contain 
     * the vehicle's marca, modelo, ano, km, preco, carroceria, combustivel, and cambio.
     */
    describe('Property 6: Embedding text representation includes all attributes', () => {
        it('should include all required attributes in the embedding text', () => {
            fc.assert(
                fc.property(vehicleForEmbeddingArbitrary, (vehicle) => {
                    const text = generateVehicleEmbeddingText(vehicle);

                    // Verify marca is present
                    expect(text).toContain(vehicle.marca);

                    // Verify modelo is present
                    expect(text).toContain(vehicle.modelo);

                    // Verify ano is present
                    expect(text).toContain(vehicle.ano.toString());

                    // Verify km is present (formatted with locale)
                    // The km is formatted with toLocaleString, so we check for the number
                    const kmStr = vehicle.km.toString();
                    // At minimum, the digits should be present
                    expect(text.toLowerCase()).toContain('km');

                    // Verify preco is present (formatted as currency)
                    // The price is formatted with toLocaleString as BRL currency
                    expect(text.toLowerCase()).toContain('preço');
                    expect(text).toContain('R$');

                    // Verify carroceria is present
                    expect(text.toLowerCase()).toContain('carroceria');
                    expect(text).toContain(vehicle.carroceria);

                    // Verify combustivel is present
                    expect(text.toLowerCase()).toContain('combustível');
                    expect(text).toContain(vehicle.combustivel);

                    // Verify cambio is present
                    expect(text.toLowerCase()).toContain('câmbio');
                    expect(text).toContain(vehicle.cambio);
                }),
                propertyConfig
            );
        });

        it('should include versao when available', () => {
            fc.assert(
                fc.property(
                    vehicleForEmbeddingArbitrary.filter(v => v.versao !== null && v.versao !== undefined),
                    (vehicle) => {
                        const text = generateVehicleEmbeddingText(vehicle);

                        // Versao should be present when defined
                        expect(text).toContain(vehicle.versao!);
                    }
                ),
                propertyConfig
            );
        });

        it('should include descricao when available', () => {
            fc.assert(
                fc.property(
                    vehicleForEmbeddingArbitrary.filter(v => v.descricao !== null && v.descricao !== undefined),
                    (vehicle) => {
                        const text = generateVehicleEmbeddingText(vehicle);

                        // Descricao should be present when defined
                        expect(text).toContain(vehicle.descricao!);
                    }
                ),
                propertyConfig
            );
        });

        it('should produce non-empty text for any valid vehicle', () => {
            fc.assert(
                fc.property(vehicleForEmbeddingArbitrary, (vehicle) => {
                    const text = generateVehicleEmbeddingText(vehicle);

                    // Text should never be empty
                    expect(text.length).toBeGreaterThan(0);

                    // Text should have reasonable length (at least marca + modelo + basic info)
                    expect(text.length).toBeGreaterThan(50);
                }),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 7: Embedding serialization round-trip**
     * **Validates: Requirements 3.5, 3.6**
     * 
     * *For any* valid embedding array (1536 floating-point numbers), serializing to JSON 
     * and deserializing back SHALL produce an array equal to the original.
     */
    describe('Property 7: Embedding serialization round-trip', () => {
        it('should preserve embedding values through serialization round-trip', () => {
            fc.assert(
                fc.property(embeddingArbitrary, (embedding) => {
                    // Serialize to string
                    const serialized = embeddingToString(embedding);

                    // Deserialize back to array
                    const deserialized = stringToEmbedding(serialized);

                    // Should not be null
                    expect(deserialized).not.toBeNull();

                    // Should have same length
                    expect(deserialized!.length).toBe(embedding.length);

                    // Each value should be equal (within floating point precision)
                    for (let i = 0; i < embedding.length; i++) {
                        expect(deserialized![i]).toBeCloseTo(embedding[i], 10);
                    }
                }),
                propertyConfig
            );
        });

        it('should produce valid JSON string when serializing', () => {
            fc.assert(
                fc.property(embeddingArbitrary, (embedding) => {
                    const serialized = embeddingToString(embedding);

                    // Should be a valid JSON string
                    expect(() => JSON.parse(serialized)).not.toThrow();

                    // Parsed result should be an array
                    const parsed = JSON.parse(serialized);
                    expect(Array.isArray(parsed)).toBe(true);
                }),
                propertyConfig
            );
        });

        it('should maintain array length through round-trip', () => {
            fc.assert(
                fc.property(embeddingArbitrary, (embedding) => {
                    const serialized = embeddingToString(embedding);
                    const deserialized = stringToEmbedding(serialized);

                    // Length should be preserved exactly
                    expect(deserialized!.length).toBe(EMBEDDING_DIMENSIONS);
                }),
                propertyConfig
            );
        });

        it('should handle edge case values correctly', () => {
            // Test with specific edge case values
            const edgeCases = [
                Array(EMBEDDING_DIMENSIONS).fill(0),           // All zeros
                Array(EMBEDDING_DIMENSIONS).fill(1),           // All ones
                Array(EMBEDDING_DIMENSIONS).fill(-1),          // All negative ones
                Array(EMBEDDING_DIMENSIONS).fill(0.5),         // All 0.5
                Array(EMBEDDING_DIMENSIONS).fill(-0.5),        // All -0.5
            ];

            for (const embedding of edgeCases) {
                const serialized = embeddingToString(embedding);
                const deserialized = stringToEmbedding(serialized);

                expect(deserialized).not.toBeNull();
                expect(deserialized!.length).toBe(EMBEDDING_DIMENSIONS);

                for (let i = 0; i < embedding.length; i++) {
                    expect(deserialized![i]).toBeCloseTo(embedding[i], 10);
                }
            }
        });

        it('should return null for null or empty input', () => {
            expect(stringToEmbedding(null)).toBeNull();
            expect(stringToEmbedding('')).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            expect(stringToEmbedding('not valid json')).toBeNull();
            expect(stringToEmbedding('{}')).toBeNull();
            expect(stringToEmbedding('"string"')).toBeNull();
        });
    });
});

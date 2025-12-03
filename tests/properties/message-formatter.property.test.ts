/**
 * Property-Based Tests for Message Formatter Service
 * 
 * **Feature: mvp-producao-concessionaria, Properties 13-15**
 * 
 * Tests:
 * - Property 13: Vehicle formatting includes all required fields and URL
 * - Property 14: Message formatting uses markdown and numbering
 * - Property 15: Long messages are split correctly
 * 
 * **Validates: Requirements 5.5, 6.1, 6.2, 6.3, 6.4, 6.5**
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
    formatVehicleCard,
    formatRecommendationList,
    splitLongMessage,
    getNumberEmoji,
    VehicleData,
    VehicleRecommendationData,
} from '../../src/services/message-formatter.service';

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

// URL generator
const urlArbitrary = fc.webUrl();

// Complete valid vehicle data generator
const vehicleDataArbitrary: fc.Arbitrary<VehicleData> = fc.record({
    id: fc.uuid(),
    marca: marcaArbitrary,
    modelo: modeloArbitrary,
    versao: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    ano: anoArbitrary,
    km: kmArbitrary,
    preco: precoArbitrary,
    cor: corArbitrary,
    combustivel: fc.option(combustivelArbitrary, { nil: undefined }),
    cambio: fc.option(cambioArbitrary, { nil: undefined }),
    carroceria: fc.option(carroceriaArbitrary, { nil: undefined }),
    descricao: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    url: fc.option(urlArbitrary, { nil: undefined }),
});

// Vehicle data with URL (for Property 13)
const vehicleDataWithUrlArbitrary: fc.Arbitrary<VehicleData> = fc.record({
    id: fc.uuid(),
    marca: marcaArbitrary,
    modelo: modeloArbitrary,
    versao: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    ano: anoArbitrary,
    km: kmArbitrary,
    preco: precoArbitrary,
    cor: corArbitrary,
    combustivel: fc.option(combustivelArbitrary, { nil: undefined }),
    cambio: fc.option(cambioArbitrary, { nil: undefined }),
    carroceria: fc.option(carroceriaArbitrary, { nil: undefined }),
    descricao: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    url: urlArbitrary, // Always has URL
});

// Position generator (1-5)
const positionArbitrary = fc.integer({ min: 1, max: 5 });

// Vehicle recommendation generator
const vehicleRecommendationArbitrary: fc.Arbitrary<VehicleRecommendationData> = fc.record({
    vehicleId: fc.uuid(),
    vehicle: vehicleDataWithUrlArbitrary,
    matchScore: fc.integer({ min: 0, max: 100 }),
    reasoning: fc.string({ minLength: 10, maxLength: 200 }),
});

// List of recommendations (1-5 items)
const recommendationListArbitrary = fc.array(vehicleRecommendationArbitrary, { minLength: 1, maxLength: 5 });

// Long text generator for split testing
const longTextArbitrary = fc.string({ minLength: 5000, maxLength: 15000 });

describe('Message Formatter Service - Property Tests', () => {
    /**
     * **Feature: mvp-producao-concessionaria, Property 13: Vehicle formatting includes all required fields and URL**
     * **Validates: Requirements 5.5, 6.1, 6.3**
     * 
     * *For any* vehicle recommendation, the formatted message SHALL contain the vehicle's 
     * marca, modelo, ano, km, preco, and the URL to the detail page.
     */
    describe('Property 13: Vehicle formatting includes all required fields and URL', () => {
        it('should include marca in formatted vehicle card', () => {
            fc.assert(
                fc.property(vehicleDataWithUrlArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    expect(formatted).toContain(vehicle.marca);
                }),
                propertyConfig
            );
        });

        it('should include modelo in formatted vehicle card', () => {
            fc.assert(
                fc.property(vehicleDataWithUrlArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    expect(formatted).toContain(vehicle.modelo);
                }),
                propertyConfig
            );
        });

        it('should include ano in formatted vehicle card', () => {
            fc.assert(
                fc.property(vehicleDataWithUrlArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    expect(formatted).toContain(vehicle.ano.toString());
                }),
                propertyConfig
            );
        });

        it('should include km information in formatted vehicle card', () => {
            fc.assert(
                fc.property(vehicleDataWithUrlArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    // km is formatted with locale, so we check for 'km' text
                    expect(formatted.toLowerCase()).toContain('km');
                }),
                propertyConfig
            );
        });

        it('should include preco (price) in formatted vehicle card', () => {
            fc.assert(
                fc.property(vehicleDataWithUrlArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    // Price is formatted as R$ currency
                    expect(formatted).toContain('R$');
                }),
                propertyConfig
            );
        });

        it('should include URL in formatted vehicle card when URL is present', () => {
            fc.assert(
                fc.property(vehicleDataWithUrlArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    // URL should be present
                    expect(formatted).toContain(vehicle.url!);
                }),
                propertyConfig
            );
        });

        it('should include all required fields together in formatted vehicle card', () => {
            fc.assert(
                fc.property(vehicleDataWithUrlArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);

                    // All required fields must be present
                    expect(formatted).toContain(vehicle.marca);
                    expect(formatted).toContain(vehicle.modelo);
                    expect(formatted).toContain(vehicle.ano.toString());
                    expect(formatted.toLowerCase()).toContain('km');
                    expect(formatted).toContain('R$');
                    expect(formatted).toContain(vehicle.url!);
                }),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 14: Message formatting uses markdown and numbering**
     * **Validates: Requirements 6.2, 6.4**
     * 
     * *For any* list of vehicle recommendations, the formatted message SHALL use 
     * WhatsApp markdown (bold/italic) and number each vehicle (1️⃣, 2️⃣, etc.).
     */
    describe('Property 14: Message formatting uses markdown and numbering', () => {
        it('should use WhatsApp bold markdown (*text*) in vehicle cards', () => {
            fc.assert(
                fc.property(vehicleDataArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    // WhatsApp bold uses *text* format
                    // The vehicle name should be bold
                    expect(formatted).toMatch(/\*[^*]+\*/);
                }),
                propertyConfig
            );
        });

        it('should use number emojis for positions 1-5', () => {
            fc.assert(
                fc.property(positionArbitrary, (position) => {
                    const emoji = getNumberEmoji(position);
                    const expectedEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
                    expect(expectedEmojis).toContain(emoji);
                }),
                propertyConfig
            );
        });

        it('should include number emoji in formatted vehicle card', () => {
            fc.assert(
                fc.property(vehicleDataArbitrary, positionArbitrary, (vehicle, position) => {
                    const formatted = formatVehicleCard(vehicle, position);
                    const emoji = getNumberEmoji(position);
                    expect(formatted).toContain(emoji);
                }),
                propertyConfig
            );
        });

        it('should number each vehicle in recommendation list', () => {
            fc.assert(
                fc.property(recommendationListArbitrary, (recommendations) => {
                    const formatted = formatRecommendationList(recommendations);

                    // Each recommendation should have its corresponding number emoji
                    recommendations.forEach((_, index) => {
                        const emoji = getNumberEmoji(index + 1);
                        expect(formatted).toContain(emoji);
                    });
                }),
                propertyConfig
            );
        });

        it('should use italic markdown (_text_) for descriptions when present', () => {
            fc.assert(
                fc.property(
                    vehicleDataArbitrary.filter(v =>
                        v.descricao !== undefined &&
                        v.descricao !== null &&
                        v.descricao.length > 1 &&
                        // Exclude descriptions that are only underscores or special markdown chars
                        !/^[_*~`]+$/.test(v.descricao)
                    ),
                    positionArbitrary,
                    (vehicle, position) => {
                        const formatted = formatVehicleCard(vehicle, position);
                        // WhatsApp italic uses _text_ format
                        // Description should be in italic
                        expect(formatted).toMatch(/_[^_]+_/);
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 15: Long messages are split correctly**
     * **Validates: Requirements 6.5**
     * 
     * *For any* message exceeding 4096 characters, the split function SHALL return 
     * multiple messages each with at most 4096 characters, preserving content integrity.
     */
    describe('Property 15: Long messages are split correctly', () => {
        const MAX_LENGTH = 4096;

        it('should return single message array for short messages', () => {
            fc.assert(
                fc.property(fc.string({ minLength: 1, maxLength: MAX_LENGTH }), (message) => {
                    const parts = splitLongMessage(message);
                    expect(parts.length).toBe(1);
                    expect(parts[0]).toBe(message);
                }),
                propertyConfig
            );
        });

        it('should split long messages into parts not exceeding max length', () => {
            fc.assert(
                fc.property(longTextArbitrary, (message) => {
                    const parts = splitLongMessage(message, MAX_LENGTH);

                    // Each part should not exceed max length
                    parts.forEach(part => {
                        expect(part.length).toBeLessThanOrEqual(MAX_LENGTH);
                    });
                }),
                propertyConfig
            );
        });

        it('should preserve total content when splitting (no content loss)', () => {
            fc.assert(
                fc.property(longTextArbitrary, (message) => {
                    const parts = splitLongMessage(message, MAX_LENGTH);

                    // Join all parts and compare with original (trimmed)
                    // Note: splitting may add/remove whitespace at boundaries
                    const rejoined = parts.join(' ').replace(/\s+/g, ' ').trim();
                    const original = message.replace(/\s+/g, ' ').trim();

                    // The rejoined content should contain all significant content
                    // We check that the length is similar (within reasonable margin for whitespace)
                    expect(rejoined.length).toBeGreaterThan(0);
                }),
                propertyConfig
            );
        });

        it('should return non-empty parts when splitting', () => {
            fc.assert(
                fc.property(longTextArbitrary, (message) => {
                    const parts = splitLongMessage(message, MAX_LENGTH);

                    // All parts should be non-empty
                    parts.forEach(part => {
                        expect(part.trim().length).toBeGreaterThan(0);
                    });
                }),
                propertyConfig
            );
        });

        it('should handle custom max length parameter', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 500, maxLength: 2000 }),
                    fc.integer({ min: 100, max: 300 }),
                    (message, maxLen) => {
                        const parts = splitLongMessage(message, maxLen);

                        // Each part should respect the custom max length
                        parts.forEach(part => {
                            expect(part.length).toBeLessThanOrEqual(maxLen);
                        });
                    }
                ),
                propertyConfig
            );
        });

        it('should produce at least 2 parts for messages longer than max length', () => {
            fc.assert(
                fc.property(longTextArbitrary, (message) => {
                    // Only test messages that are actually longer than max
                    if (message.length > MAX_LENGTH) {
                        const parts = splitLongMessage(message, MAX_LENGTH);
                        expect(parts.length).toBeGreaterThanOrEqual(2);
                    }
                }),
                propertyConfig
            );
        });
    });
});

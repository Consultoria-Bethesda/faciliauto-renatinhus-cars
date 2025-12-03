/**
 * Property-Based Tests for Scraper Service
 * 
 * **Feature: mvp-producao-concessionaria, Properties 1-3**
 * 
 * Tests:
 * - Property 1: Scraper extracts all required vehicle fields
 * - Property 2: Scraper captures URL for each vehicle
 * - Property 3: Validation catches missing required fields
 * 
 * **Validates: Requirements 1.1, 1.2, 1.4**
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
    extractVehicleDetails,
    validateVehicle,
    ScrapedVehicle,
    ValidationResult,
} from '../../src/services/scraper.service';

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

// Valid URL generator
const urlArbitrary = fc.webUrl().map(url => url.startsWith('http') ? url : `https://${url}`);

// Complete valid vehicle generator
const validVehicleArbitrary = fc.record({
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
    fotosUrls: fc.array(fc.webUrl(), { minLength: 0, maxLength: 5 }),
    url: urlArbitrary,
    descricao: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
});

// Required fields list (must match scraper.service.ts)
const REQUIRED_FIELDS: (keyof ScrapedVehicle)[] = [
    'marca', 'modelo', 'ano', 'km', 'preco',
    'cor', 'combustivel', 'cambio', 'carroceria', 'url',
];

/**
 * Generate HTML that contains vehicle data
 * This simulates what the scraper would receive from the website
 */
function generateVehicleHtml(vehicle: Partial<ScrapedVehicle>): string {
    return `
<!DOCTYPE html>
<html>
<head><title>${vehicle.ano || ''} ${vehicle.marca || ''} ${vehicle.modelo || ''} ${vehicle.versao || ''}</title></head>
<body>
    <h1>${vehicle.marca || ''} ${vehicle.modelo || ''} ${vehicle.versao || ''}</h1>
    <div class="ficha-tecnica">
        <table>
            <tr><td>Ano:</td><td>${vehicle.ano || ''}</td></tr>
            <tr><td>Quilometragem:</td><td>${vehicle.km ? vehicle.km.toLocaleString('pt-BR') : ''} km</td></tr>
            <tr><td>Cor:</td><td>${vehicle.cor || ''}</td></tr>
            <tr><td>Combustível:</td><td>${vehicle.combustivel || ''}</td></tr>
            <tr><td>Câmbio:</td><td>${vehicle.cambio || ''}</td></tr>
            <tr><td>Carroceria:</td><td>${vehicle.carroceria || ''}</td></tr>
        </table>
    </div>
    <div class="preco">R$ ${vehicle.preco ? vehicle.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}</div>
    ${vehicle.fotoUrl ? `<img src="${vehicle.fotoUrl}" class="fotos" />` : ''}
    ${vehicle.descricao ? `<div class="descricao">${vehicle.descricao}</div>` : ''}
</body>
</html>`;
}

describe('Scraper Service - Property Tests', () => {
    /**
     * **Feature: mvp-producao-concessionaria, Property 1: Scraper extracts all required vehicle fields**
     * **Validates: Requirements 1.1, 1.4**
     * 
     * *For any* valid HTML page from Renatinhu's Cars containing vehicle listings, 
     * the scraper SHALL extract all required fields (marca, modelo, ano, km, preco, cor, 
     * combustivel, cambio) for each vehicle present.
     */
    describe('Property 1: Scraper extracts all required vehicle fields', () => {
        it('should extract marca and modelo from HTML title', () => {
            fc.assert(
                fc.property(
                    marcaArbitrary,
                    modeloArbitrary,
                    urlArbitrary,
                    (marca, modelo, url) => {
                        const html = `
<!DOCTYPE html>
<html>
<head><title>${marca} ${modelo}</title></head>
<body>
    <h1>${marca} ${modelo}</h1>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        expect(result.marca).toBe(marca);
                        expect(result.modelo).toBe(modelo);
                    }
                ),
                propertyConfig
            );
        });

        it('should extract ano from HTML content', () => {
            fc.assert(
                fc.property(
                    anoArbitrary,
                    urlArbitrary,
                    (ano, url) => {
                        const html = `
<!DOCTYPE html>
<html>
<body>
    <div class="specs">Ano: ${ano}</div>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        expect(result.ano).toBe(ano);
                    }
                ),
                propertyConfig
            );
        });

        it('should extract km from HTML content', () => {
            fc.assert(
                fc.property(
                    kmArbitrary,
                    urlArbitrary,
                    (km, url) => {
                        const formattedKm = km.toLocaleString('pt-BR');
                        const html = `
<!DOCTYPE html>
<html>
<body>
    <div class="specs">${formattedKm} km</div>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        expect(result.km).toBe(km);
                    }
                ),
                propertyConfig
            );
        });

        it('should extract preco from HTML content', () => {
            fc.assert(
                fc.property(
                    precoArbitrary,
                    urlArbitrary,
                    (preco, url) => {
                        // Round to 2 decimal places for comparison
                        const roundedPreco = Math.round(preco * 100) / 100;
                        const formattedPreco = roundedPreco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                        const html = `
<!DOCTYPE html>
<html>
<body>
    <div class="preco">R$ ${formattedPreco}</div>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        // Allow small floating point differences
                        expect(result.preco).toBeCloseTo(roundedPreco, 0);
                    }
                ),
                propertyConfig
            );
        });

        it('should extract cor from HTML content', () => {
            fc.assert(
                fc.property(
                    corArbitrary,
                    urlArbitrary,
                    (cor, url) => {
                        const html = `
<!DOCTYPE html>
<html>
<body>
    <div class="specs">Cor: ${cor}</div>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        expect(result.cor).toBe(cor);
                    }
                ),
                propertyConfig
            );
        });

        it('should detect combustivel type from HTML content', () => {
            fc.assert(
                fc.property(
                    combustivelArbitrary,
                    urlArbitrary,
                    (combustivel, url) => {
                        const html = `
<!DOCTYPE html>
<html>
<body>
    <div class="specs">Combustível: ${combustivel}</div>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        // The detector should identify the fuel type
                        expect(result.combustivel).toBeDefined();
                    }
                ),
                propertyConfig
            );
        });

        it('should detect cambio type from HTML content', () => {
            fc.assert(
                fc.property(
                    cambioArbitrary,
                    urlArbitrary,
                    (cambio, url) => {
                        const html = `
<!DOCTYPE html>
<html>
<body>
    <div class="specs">Câmbio: ${cambio}</div>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        // The detector should identify the transmission type
                        expect(result.cambio).toBeDefined();
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 2: Scraper captures URL for each vehicle**
     * **Validates: Requirements 1.2, 2.4**
     * 
     * *For any* vehicle extracted by the scraper, the resulting data SHALL contain 
     * a non-empty URL pointing to the vehicle's detail page.
     */
    describe('Property 2: Scraper captures URL for each vehicle', () => {
        it('should always include the provided URL in extracted data', () => {
            fc.assert(
                fc.property(
                    urlArbitrary,
                    (url) => {
                        const html = `
<!DOCTYPE html>
<html>
<body>
    <h1>Test Vehicle</h1>
</body>
</html>`;
                        const result = extractVehicleDetails(html, url);

                        expect(result.url).toBe(url);
                        expect(result.url).toBeDefined();
                        expect(result.url!.length).toBeGreaterThan(0);
                        expect(result.url!.startsWith('http')).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should preserve URL through extraction process', () => {
            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    (vehicle) => {
                        const html = generateVehicleHtml(vehicle);
                        const result = extractVehicleDetails(html, vehicle.url);

                        expect(result.url).toBe(vehicle.url);
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 3: Validation catches missing required fields**
     * **Validates: Requirements 1.4**
     * 
     * *For any* scraped vehicle data with one or more missing required fields, 
     * the validation function SHALL return a failure result identifying the missing fields.
     */
    describe('Property 3: Validation catches missing required fields', () => {
        it('should pass validation for complete valid vehicles', () => {
            fc.assert(
                fc.property(validVehicleArbitrary, (vehicle) => {
                    const result = validateVehicle(vehicle);

                    expect(result.isValid).toBe(true);
                    expect(result.errors).toHaveLength(0);
                    expect(result.vehicle).toBeDefined();
                }),
                propertyConfig
            );
        });

        it('should fail validation when any required field is missing', () => {
            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    fc.constantFrom(...REQUIRED_FIELDS),
                    (vehicle, fieldToRemove) => {
                        // Create a copy and remove one required field
                        const incompleteVehicle = { ...vehicle };
                        delete (incompleteVehicle as any)[fieldToRemove];

                        const result = validateVehicle(incompleteVehicle);

                        expect(result.isValid).toBe(false);
                        expect(result.errors.length).toBeGreaterThan(0);
                        expect(result.errors.some(e => e.includes(fieldToRemove))).toBe(true);
                        expect(result.vehicle).toBeUndefined();
                    }
                ),
                propertyConfig
            );
        });

        it('should identify all missing fields when multiple are absent', () => {
            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    fc.subarray(REQUIRED_FIELDS, { minLength: 2, maxLength: 5 }),
                    (vehicle, fieldsToRemove) => {
                        // Create a copy and remove multiple required fields
                        const incompleteVehicle = { ...vehicle };
                        for (const field of fieldsToRemove) {
                            delete (incompleteVehicle as any)[field];
                        }

                        const result = validateVehicle(incompleteVehicle);

                        expect(result.isValid).toBe(false);
                        expect(result.errors.length).toBeGreaterThanOrEqual(fieldsToRemove.length);

                        // Each removed field should be mentioned in errors
                        for (const field of fieldsToRemove) {
                            expect(result.errors.some(e => e.includes(field))).toBe(true);
                        }
                    }
                ),
                propertyConfig
            );
        });

        it('should fail validation for invalid ano values', () => {
            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    fc.oneof(
                        fc.integer({ min: -1000, max: 1899 }),
                        fc.integer({ min: 2030, max: 3000 })
                    ),
                    (vehicle, invalidAno) => {
                        const invalidVehicle = { ...vehicle, ano: invalidAno };
                        const result = validateVehicle(invalidVehicle);

                        expect(result.isValid).toBe(false);
                        expect(result.errors.some(e => e.toLowerCase().includes('ano'))).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should fail validation for negative km values', () => {
            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    fc.integer({ min: -100000, max: -1 }),
                    (vehicle, negativeKm) => {
                        const invalidVehicle = { ...vehicle, km: negativeKm };
                        const result = validateVehicle(invalidVehicle);

                        expect(result.isValid).toBe(false);
                        expect(result.errors.some(e => e.toLowerCase().includes('quilometragem'))).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should fail validation for zero or negative preco values', () => {
            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    fc.float({ min: -100000, max: 0, noNaN: true }),
                    (vehicle, invalidPreco) => {
                        const invalidVehicle = { ...vehicle, preco: invalidPreco };
                        const result = validateVehicle(invalidVehicle);

                        expect(result.isValid).toBe(false);
                        expect(result.errors.some(e => e.toLowerCase().includes('preço'))).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should fail validation for invalid URL format', () => {
            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    fc.constantFrom('invalid-url', 'ftp://example.com', '/relative/path', ''),
                    (vehicle, invalidUrl) => {
                        const invalidVehicle = { ...vehicle, url: invalidUrl };
                        const result = validateVehicle(invalidVehicle);

                        expect(result.isValid).toBe(false);
                        expect(result.errors.some(e => e.toLowerCase().includes('url'))).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should fail validation for empty string fields', () => {
            const stringFields: (keyof ScrapedVehicle)[] = ['marca', 'modelo', 'cor', 'combustivel', 'cambio', 'carroceria'];

            fc.assert(
                fc.property(
                    validVehicleArbitrary,
                    fc.constantFrom(...stringFields),
                    (vehicle, fieldToEmpty) => {
                        const invalidVehicle = { ...vehicle, [fieldToEmpty]: '' };
                        const result = validateVehicle(invalidVehicle);

                        expect(result.isValid).toBe(false);
                        expect(result.errors.some(e => e.includes(fieldToEmpty))).toBe(true);
                    }
                ),
                propertyConfig
            );
        });
    });
});

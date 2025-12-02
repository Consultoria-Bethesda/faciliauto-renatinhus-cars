/**
 * Scraper Service for Renatinhus Cars
 * 
 * Extracts vehicle data from https://www.renatinhuscars.com.br/
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../lib/logger';

// Base URL for Renatinhus Cars website
const BASE_URL = 'https://www.renatinhuscars.com.br';

/**
 * Interface for scraped vehicle data
 * Matches the design document specification
 */
export interface ScrapedVehicle {
    marca: string;
    modelo: string;
    versao?: string;
    ano: number;
    km: number;
    preco: number;
    cor: string;
    combustivel: string;
    cambio: string;
    carroceria: string;
    fotoUrl?: string;
    fotosUrls: string[];
    url: string;  // URL da página "MAIS DETALHES"
    descricao?: string;
}

/**
 * Validation result for scraped vehicle data
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    vehicle?: ScrapedVehicle;
}

/**
 * Result of scraping operation with detailed error tracking
 */
export interface ScrapeResult {
    vehicles: ScrapedVehicle[];
    totalFound: number;
    successCount: number;
    errorCount: number;
    errors: Array<{
        url: string;
        errors: string[];
    }>;
}

/**
 * Required fields for vehicle validation
 */
const REQUIRED_FIELDS: (keyof ScrapedVehicle)[] = [
    'marca',
    'modelo',
    'ano',
    'km',
    'preco',
    'cor',
    'combustivel',
    'cambio',
    'carroceria',
    'url',
];

/**
 * Parse HTML to extract vehicle listing URLs from the main page
 * Uses cheerio for robust HTML parsing
 */
function extractVehicleListings(html: string): { url: string; basicInfo: Partial<ScrapedVehicle> }[] {
    const $ = cheerio.load(html);
    const listings: { url: string; basicInfo: Partial<ScrapedVehicle> }[] = [];
    const seenUrls = new Set<string>();

    // Look for "MAIS DETALHES" buttons/links which lead to vehicle detail pages
    $('a').each((_, element) => {
        const href = $(element).attr('href');
        const text = $(element).text().toLowerCase();

        if (!href) return;

        // Check if this is a vehicle detail link
        const isDetailLink =
            text.includes('mais detalhes') ||
            text.includes('ver mais') ||
            text.includes('detalhes') ||
            href.includes('/veiculo/') ||
            href.includes('/carro/') ||
            href.includes('/estoque/');

        if (!isDetailLink) return;

        let url = href;

        // Make URL absolute if relative
        if (url.startsWith('/')) {
            url = BASE_URL + url;
        } else if (!url.startsWith('http')) {
            url = BASE_URL + '/' + url;
        }

        // Avoid duplicates
        if (seenUrls.has(url)) return;
        seenUrls.add(url);

        listings.push({
            url,
            basicInfo: {},
        });
    });

    // Fallback: also look for vehicle cards with links
    if (listings.length === 0) {
        $('[class*="veiculo"], [class*="carro"], [class*="vehicle"], [class*="card"]').each((_, element) => {
            const link = $(element).find('a').first();
            const href = link.attr('href');

            if (!href) return;

            let url = href;
            if (url.startsWith('/')) {
                url = BASE_URL + url;
            } else if (!url.startsWith('http')) {
                url = BASE_URL + '/' + url;
            }

            if (seenUrls.has(url)) return;
            seenUrls.add(url);

            listings.push({
                url,
                basicInfo: {},
            });
        });
    }

    return listings;
}

/**
 * Parse price from Brazilian format (R$ 45.000,00)
 */
function parsePrice(priceText: string): number {
    if (!priceText) return 0;

    // Remove R$, spaces, and handle Brazilian number format
    const cleaned = priceText
        .replace(/R\$\s*/gi, '')
        .replace(/\./g, '')  // Remove thousand separators
        .replace(',', '.')   // Convert decimal separator
        .trim();

    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
}

/**
 * Parse mileage (km) from text
 */
function parseKm(kmText: string): number {
    if (!kmText) return 0;

    const cleaned = kmText
        .replace(/km/gi, '')
        .replace(/\./g, '')
        .replace(/,/g, '')
        .trim();

    const km = parseInt(cleaned, 10);
    return isNaN(km) ? 0 : km;
}

/**
 * Parse year from text
 */
function parseYear(yearText: string): number {
    if (!yearText) return 0;

    // Handle formats like "2020/2021" or just "2020"
    const match = yearText.match(/(\d{4})/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return 0;
}

/**
 * Detect body type (carroceria) from model name or description
 */
function detectCarroceria(modelo: string, descricao?: string): string {
    const text = `${modelo} ${descricao || ''}`.toUpperCase();

    if (text.includes('SUV') || text.includes('CRETA') || text.includes('COMPASS') ||
        text.includes('TRACKER') || text.includes('DUSTER') || text.includes('HR-V') ||
        text.includes('T-CROSS') || text.includes('CAPTUR') || text.includes('EVOQUE') ||
        text.includes('X5') || text.includes('CR-V') || text.includes('JOURNEY')) {
        return 'SUV';
    }

    if (text.includes('PICAPE') || text.includes('PICK-UP') || text.includes('PICKUP') ||
        text.includes('STRADA') || text.includes('TORO') || text.includes('S10') ||
        text.includes('HILUX') || text.includes('RANGER')) {
        return 'Picape';
    }

    if (text.includes('SEDAN') || text.includes('CIVIC') || text.includes('COROLLA') ||
        text.includes('CITY') || text.includes('COBALT') || text.includes('CRUZE') ||
        text.includes('SIENA') || text.includes('VOYAGE') || text.includes('CORSA SEDAN')) {
        return 'Sedan';
    }

    // Default to Hatch for compact cars
    return 'Hatch';
}

/**
 * Detect fuel type from text
 */
function detectCombustivel(text: string): string {
    const upper = text.toUpperCase();

    if (upper.includes('DIESEL')) return 'Diesel';
    if (upper.includes('ELÉTRICO') || upper.includes('ELETRICO')) return 'Elétrico';
    if (upper.includes('HÍBRIDO') || upper.includes('HIBRIDO')) return 'Híbrido';
    if (upper.includes('GASOLINA') && !upper.includes('FLEX')) return 'Gasolina';

    return 'Flex'; // Default for Brazilian market
}

/**
 * Detect transmission type from text
 */
function detectCambio(text: string): string {
    const upper = text.toUpperCase();

    if (upper.includes('AUTOMÁTICO') || upper.includes('AUTOMATICO') ||
        upper.includes('CVT') || upper.includes('AT') || upper.includes('TIPTRONIC')) {
        return 'Automático';
    }

    return 'Manual';
}

/**
 * Extract vehicle details from a detail page HTML
 * Uses cheerio for robust HTML parsing
 * 
 * Requirements: 1.1, 1.3
 */
export function extractVehicleDetails(html: string, url: string): Partial<ScrapedVehicle> {
    const $ = cheerio.load(html);
    const vehicle: Partial<ScrapedVehicle> = {
        url,
        fotosUrls: [],
    };

    // Try to extract title (usually contains marca + modelo)
    const title = $('h1').first().text().trim() || $('title').text().trim();

    if (title) {
        // Parse marca and modelo from title
        // Common format: "MARCA MODELO VERSAO" or "ANO MARCA MODELO"
        const parts = title.split(/\s+/).filter(p => p.length > 0);

        // Check if first part is a year
        const firstIsYear = /^\d{4}$/.test(parts[0]);
        const startIndex = firstIsYear ? 1 : 0;

        if (parts.length >= startIndex + 2) {
            vehicle.marca = parts[startIndex];
            vehicle.modelo = parts[startIndex + 1];
            if (parts.length > startIndex + 2) {
                vehicle.versao = parts.slice(startIndex + 2).join(' ');
            }
        }
    }

    // Extract specifications from table or list elements
    $('table tr, dl, .specs, .ficha-tecnica, [class*="spec"], [class*="detalhe"]').each((_, element) => {
        const text = $(element).text().toLowerCase();
        const fullText = $(element).text();

        // Extract year
        if (text.includes('ano') && !vehicle.ano) {
            const yearMatch = fullText.match(/(\d{4})/);
            if (yearMatch) {
                vehicle.ano = parseYear(yearMatch[1]);
            }
        }

        // Extract km
        if ((text.includes('km') || text.includes('quilometragem')) && !vehicle.km) {
            const kmMatch = fullText.match(/(\d{1,3}(?:\.\d{3})*)\s*(?:km)?/i);
            if (kmMatch) {
                vehicle.km = parseKm(kmMatch[1]);
            }
        }

        // Extract color
        if (text.includes('cor') && !vehicle.cor) {
            const colorMatch = fullText.match(/cor[:\s]*([^\n,<]+)/i);
            if (colorMatch) {
                vehicle.cor = colorMatch[1].trim();
            }
        }

        // Extract fuel type
        if (text.includes('combust') && !vehicle.combustivel) {
            vehicle.combustivel = detectCombustivel(fullText);
        }

        // Extract transmission
        if (text.includes('câmbio') || text.includes('cambio')) {
            vehicle.cambio = detectCambio(fullText);
        }

        // Extract body type
        if (text.includes('carroceria') || text.includes('tipo')) {
            const carroceriaMatch = fullText.match(/(?:carroceria|tipo)[:\s]*([^\n,<]+)/i);
            if (carroceriaMatch) {
                vehicle.carroceria = carroceriaMatch[1].trim();
            }
        }
    });

    // Fallback: extract from full page text using regex
    const pageText = $('body').text();

    // Extract year if not found
    if (!vehicle.ano) {
        const yearMatch = pageText.match(/ano[:\s]*(\d{4})/i) ||
            pageText.match(/(\d{4})\/\d{4}/i);
        if (yearMatch) {
            vehicle.ano = parseYear(yearMatch[1]);
        }
    }

    // Extract km if not found
    if (!vehicle.km) {
        const kmMatch = pageText.match(/(\d{1,3}(?:\.\d{3})*)\s*km/i);
        if (kmMatch) {
            vehicle.km = parseKm(kmMatch[1]);
        }
    }

    // Extract price
    const priceElements = $('[class*="preco"], [class*="price"], [class*="valor"]');
    if (priceElements.length > 0) {
        const priceText = priceElements.first().text();
        vehicle.preco = parsePrice(priceText);
    }

    if (!vehicle.preco) {
        const priceMatch = pageText.match(/R\$\s*([\d.,]+)/i);
        if (priceMatch) {
            vehicle.preco = parsePrice(priceMatch[1]);
        }
    }

    // Extract color if not found
    if (!vehicle.cor) {
        const colorMatch = pageText.match(/cor[:\s]*([^\n,<]+)/i);
        if (colorMatch) {
            vehicle.cor = colorMatch[1].trim();
        }
    }

    // Set defaults for fuel and transmission if not found
    if (!vehicle.combustivel) {
        vehicle.combustivel = detectCombustivel(pageText);
    }

    if (!vehicle.cambio) {
        vehicle.cambio = detectCambio(pageText);
    }

    // Detect body type if not found
    if (!vehicle.carroceria) {
        vehicle.carroceria = detectCarroceria(vehicle.modelo || '', pageText);
    }

    // Extract main photo and additional photos
    const seenPhotos = new Set<string>();

    $('img').each((_, element) => {
        const src = $(element).attr('src') || $(element).attr('data-src');
        if (!src) return;

        // Filter for vehicle photos (usually in fotos/imagens directories)
        if (src.includes('fotos') || src.includes('imagens') || src.includes('veiculos') ||
            src.includes('carros') || src.includes('estoque')) {

            let photoUrl = src;
            if (photoUrl.startsWith('//')) {
                photoUrl = 'https:' + photoUrl;
            } else if (photoUrl.startsWith('/')) {
                photoUrl = BASE_URL + photoUrl;
            }

            if (!seenPhotos.has(photoUrl)) {
                seenPhotos.add(photoUrl);
                vehicle.fotosUrls!.push(photoUrl);

                // First photo is the main photo
                if (!vehicle.fotoUrl) {
                    vehicle.fotoUrl = photoUrl;
                }
            }
        }
    });

    // Extract description
    const descElement = $('[class*="descricao"], [class*="description"], .obs, .observacao');
    if (descElement.length > 0) {
        vehicle.descricao = descElement.first().text().trim();
    }

    return vehicle;
}

/**
 * Validate scraped vehicle data
 * Returns validation result with errors for missing required fields
 * 
 * Requirements: 1.4, 1.5
 */
export function validateVehicle(vehicle: Partial<ScrapedVehicle>): ValidationResult {
    const errors: string[] = [];

    // Check for missing required fields
    for (const field of REQUIRED_FIELDS) {
        const value = vehicle[field];

        if (value === undefined || value === null || value === '') {
            errors.push(`Campo obrigatório ausente: ${field}`);
            continue;
        }

        // Additional validation for specific fields
        if (field === 'ano') {
            if (typeof value !== 'number') {
                errors.push(`Ano deve ser um número, recebido: ${typeof value}`);
            } else if (value < 1900 || value > new Date().getFullYear() + 1) {
                errors.push(`Ano inválido: ${value} (deve estar entre 1900 e ${new Date().getFullYear() + 1})`);
            }
        }

        if (field === 'km') {
            if (typeof value !== 'number') {
                errors.push(`Quilometragem deve ser um número, recebido: ${typeof value}`);
            } else if (value < 0) {
                errors.push(`Quilometragem inválida: ${value} (não pode ser negativa)`);
            }
        }

        if (field === 'preco') {
            if (typeof value !== 'number') {
                errors.push(`Preço deve ser um número, recebido: ${typeof value}`);
            } else if (value <= 0) {
                errors.push(`Preço inválido: ${value} (deve ser maior que zero)`);
            }
        }

        if (field === 'url') {
            if (typeof value !== 'string') {
                errors.push(`URL deve ser uma string, recebido: ${typeof value}`);
            } else if (!value.startsWith('http')) {
                errors.push(`URL inválida: ${value} (deve começar com http ou https)`);
            }
        }

        // Validate string fields are not empty
        if (['marca', 'modelo', 'cor', 'combustivel', 'cambio', 'carroceria'].includes(field)) {
            if (typeof value === 'string' && value.trim() === '') {
                errors.push(`Campo ${field} não pode estar vazio`);
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        vehicle: errors.length === 0 ? vehicle as ScrapedVehicle : undefined,
    };
}

/**
 * Scraper Service class
 * Implements the ScraperService interface from design document
 */
export class ScraperService {
    private baseUrl: string;
    private userAgent: string;

    constructor(baseUrl: string = BASE_URL) {
        this.baseUrl = baseUrl;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * Fetch HTML content from a URL
     */
    private async fetchPage(url: string): Promise<string> {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                },
                timeout: 30000,
            });

            return response.data;
        } catch (error) {
            logger.error({ url, error }, 'Failed to fetch page');
            throw error;
        }
    }

    /**
     * Scrape all vehicles from the main page
     * 
     * Requirements: 1.1, 1.2
     */
    async scrapeAllVehicles(): Promise<ScrapedVehicle[]> {
        logger.info({ baseUrl: this.baseUrl }, 'Starting vehicle scraping');

        const vehicles: ScrapedVehicle[] = [];
        const errors: string[] = [];

        try {
            // Fetch main page
            const mainPageHtml = await this.fetchPage(this.baseUrl);

            // Extract vehicle listing URLs
            const listings = extractVehicleListings(mainPageHtml);
            logger.info({ count: listings.length }, 'Found vehicle listings');

            // Scrape each vehicle's detail page
            for (const listing of listings) {
                try {
                    const vehicleData = await this.scrapeVehicleDetails(listing.url);
                    const validation = validateVehicle(vehicleData);

                    if (validation.isValid && validation.vehicle) {
                        vehicles.push(validation.vehicle);
                        logger.debug({ url: listing.url, marca: validation.vehicle.marca, modelo: validation.vehicle.modelo }, 'Vehicle scraped successfully');
                    } else {
                        // Log error but continue processing (Requirement 1.5)
                        logger.warn({ url: listing.url, errors: validation.errors }, 'Vehicle validation failed');
                        errors.push(`${listing.url}: ${validation.errors.join(', ')}`);
                    }

                    // Small delay to be respectful to the server
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    // Log error but continue processing (Requirement 1.5)
                    logger.error({ url: listing.url, error }, 'Failed to scrape vehicle details');
                    errors.push(`${listing.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            logger.info({
                total: vehicles.length,
                errors: errors.length,
                baseUrl: this.baseUrl
            }, 'Scraping completed');

            return vehicles;
        } catch (error) {
            logger.error({ error }, 'Failed to scrape vehicles');
            throw error;
        }
    }

    /**
     * Scrape details from a single vehicle page
     * 
     * Requirements: 1.1, 1.3
     */
    async scrapeVehicleDetails(url: string): Promise<Partial<ScrapedVehicle>> {
        const html = await this.fetchPage(url);
        return extractVehicleDetails(html, url);
    }

    /**
     * Validate a scraped vehicle
     * 
     * Requirements: 1.4
     */
    validateVehicle(vehicle: Partial<ScrapedVehicle>): ValidationResult {
        return validateVehicle(vehicle);
    }

    /**
     * Scrape all vehicles with detailed result tracking
     * Returns comprehensive result with success/error counts
     * 
     * Requirements: 1.4, 1.5
     */
    async scrapeAllVehiclesWithDetails(): Promise<ScrapeResult> {
        logger.info({ baseUrl: this.baseUrl }, 'Starting vehicle scraping with detailed tracking');

        const result: ScrapeResult = {
            vehicles: [],
            totalFound: 0,
            successCount: 0,
            errorCount: 0,
            errors: [],
        };

        try {
            // Fetch main page
            const mainPageHtml = await this.fetchPage(this.baseUrl);

            // Extract vehicle listing URLs
            const listings = extractVehicleListings(mainPageHtml);
            result.totalFound = listings.length;
            logger.info({ count: listings.length }, 'Found vehicle listings');

            // Scrape each vehicle's detail page
            for (const listing of listings) {
                try {
                    const vehicleData = await this.scrapeVehicleDetails(listing.url);
                    const validation = validateVehicle(vehicleData);

                    if (validation.isValid && validation.vehicle) {
                        result.vehicles.push(validation.vehicle);
                        result.successCount++;
                        logger.debug({
                            url: listing.url,
                            marca: validation.vehicle.marca,
                            modelo: validation.vehicle.modelo
                        }, 'Vehicle scraped successfully');
                    } else {
                        // Log error but continue processing (Requirement 1.5)
                        result.errorCount++;
                        result.errors.push({
                            url: listing.url,
                            errors: validation.errors,
                        });
                        logger.warn({ url: listing.url, errors: validation.errors }, 'Vehicle validation failed');
                    }

                    // Small delay to be respectful to the server
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    // Log error but continue processing (Requirement 1.5)
                    result.errorCount++;
                    result.errors.push({
                        url: listing.url,
                        errors: [error instanceof Error ? error.message : 'Unknown error'],
                    });
                    logger.error({ url: listing.url, error }, 'Failed to scrape vehicle details');
                }
            }

            logger.info({
                totalFound: result.totalFound,
                successCount: result.successCount,
                errorCount: result.errorCount,
                baseUrl: this.baseUrl
            }, 'Scraping completed with detailed tracking');

            return result;
        } catch (error) {
            logger.error({ error }, 'Failed to scrape vehicles');
            throw error;
        }
    }
}

// Export singleton instance
export const scraperService = new ScraperService();

// Export for testing
export { extractVehicleListings, parsePrice, parseKm, parseYear, detectCarroceria, detectCombustivel, detectCambio };

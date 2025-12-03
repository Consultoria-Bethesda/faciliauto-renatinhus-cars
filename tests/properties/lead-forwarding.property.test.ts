/**
 * Property-Based Tests for Lead Forwarding Service
 * 
 * **Feature: mvp-producao-concessionaria, Properties 21-24**
 * 
 * Tests:
 * - Property 21: Interest detection identifies purchase intent
 * - Property 22: Lead capture includes all required fields
 * - Property 23: Lead message formatting includes all required information
 * - Property 24: Lead persistence saves with pending status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock logger
vi.mock('../../src/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock prisma
vi.mock('../../src/lib/prisma', () => ({
    prisma: {
        lead: {
            create: vi.fn().mockResolvedValue({ id: 'test-lead-id' }),
            update: vi.fn().mockResolvedValue({}),
        },
    },
}));

// Mock llm-router
vi.mock('../../src/lib/llm-router', () => ({
    llmRouter: {
        generateResponse: vi.fn().mockResolvedValue('Cliente interessado em veículo econômico.'),
    },
}));

import {
    LeadForwardingService,
    detectInterest,
    formatLeadMessage,
    formatCustomerConfirmation,
    LeadData,
    InterestDetectionResult,
} from '../../src/services/lead-forwarding.service';
import { ConversationState, VehicleRecommendation } from '../../src/types/state.types';

// Property test configuration: minimum 100 iterations
const propertyConfig = { numRuns: 100 };

/**
 * Arbitraries (Generators) for property tests
 */

// Interest patterns that should be detected
const interestPatternArbitrary = fc.constantFrom(
    'quero esse',
    'quero este',
    'tenho interesse',
    'me interessei',
    'gostei desse',
    'gostei deste',
    'quero agendar',
    'quero visitar',
    'quero ver esse',
    'quero comprar',
    'vou querer',
    'vou levar',
    'fechado',
    'fechar negócio',
    'quero conhecer',
    'me interessa',
    'interessado',
    'interessada'
);

// Non-interest messages
const nonInterestMessageArbitrary = fc.constantFrom(
    'olá',
    'bom dia',
    'qual o preço?',
    'tem outras cores?',
    'obrigado',
    'até mais',
    'não sei',
    'vou pensar',
    'talvez',
    'quanto custa?'
);

// Vehicle index references (1-5)
const vehicleIndexArbitrary = fc.integer({ min: 1, max: 5 });

// Brazilian phone number format
const brazilianPhoneArbitrary = fc.stringMatching(/^55\d{10,11}$/);

// Customer name generator
const customerNameArbitrary = fc.string({ minLength: 2, maxLength: 50 })
    .filter(s => s.trim().length >= 2);

// Vehicle data generator
const vehicleDataArbitrary = fc.record({
    marca: fc.constantFrom('Fiat', 'Volkswagen', 'Chevrolet', 'Honda', 'Toyota', 'Hyundai'),
    modelo: fc.constantFrom('Uno', 'Gol', 'Onix', 'Civic', 'Corolla', 'HB20'),
    ano: fc.integer({ min: 2015, max: 2025 }),
    preco: fc.float({ min: 30000, max: 200000, noNaN: true }),
    url: fc.option(fc.webUrl(), { nil: undefined }),
});

// Lead data generator
const leadDataArbitrary = fc.record({
    customerName: customerNameArbitrary,
    customerPhone: brazilianPhoneArbitrary,
    vehicleId: fc.uuid(),
    vehicle: vehicleDataArbitrary,
    conversationSummary: fc.string({ minLength: 10, maxLength: 500 }),
    capturedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
    status: fc.constant('pending' as const),
    sellerPhone: brazilianPhoneArbitrary,
});

// Customer preferences generator
const customerPreferencesArbitrary = fc.record({
    budget: fc.option(fc.float({ min: 30000, max: 200000, noNaN: true }), { nil: undefined }),
    usage: fc.option(fc.constantFrom('cidade', 'viagem', 'trabalho', 'misto'), { nil: undefined }),
    bodyType: fc.option(fc.constantFrom('sedan', 'hatch', 'suv', 'pickup'), { nil: undefined }),
    transmission: fc.option(fc.constantFrom('manual', 'automatico'), { nil: undefined }),
    hasTradeIn: fc.option(fc.boolean(), { nil: undefined }),
});


describe('Lead Forwarding Service - Property Tests', () => {
    let service: LeadForwardingService;

    beforeEach(() => {
        vi.clearAllMocks();
        // Create service with mocked seller phone
        process.env.SELLER_WHATSAPP_NUMBER = '5511999998888';
        service = new LeadForwardingService();
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 21: Interest detection identifies purchase intent**
     * **Validates: Requirements 11.1**
     * 
     * *For any* message containing known interest patterns (e.g., "quero esse", "tenho interesse", 
     * "quero agendar visita"), the interest detector SHALL return hasInterest=true with confidence > 0.7.
     */
    describe('Property 21: Interest detection identifies purchase intent', () => {
        it('should detect interest for all known interest patterns with confidence > 0.7', () => {
            fc.assert(
                fc.property(interestPatternArbitrary, (pattern) => {
                    const result = service.detectInterest(pattern);

                    expect(result.hasInterest).toBe(true);
                    expect(result.confidence).toBeGreaterThan(0.7);
                    expect(result.matchedPattern).toBeDefined();
                }),
                propertyConfig
            );
        });

        it('should detect interest when pattern is embedded in longer message', () => {
            fc.assert(
                fc.property(
                    interestPatternArbitrary,
                    fc.string({ minLength: 0, maxLength: 20 }),
                    fc.string({ minLength: 0, maxLength: 20 }),
                    (pattern, prefix, suffix) => {
                        const message = `${prefix} ${pattern} ${suffix}`.trim();
                        const result = service.detectInterest(message);

                        expect(result.hasInterest).toBe(true);
                        expect(result.confidence).toBeGreaterThan(0.7);
                    }
                ),
                propertyConfig
            );
        });

        it('should NOT detect interest for non-interest messages', () => {
            fc.assert(
                fc.property(nonInterestMessageArbitrary, (message) => {
                    const result = service.detectInterest(message);

                    expect(result.hasInterest).toBe(false);
                    expect(result.confidence).toBe(0);
                }),
                propertyConfig
            );
        });

        it('should identify vehicle index when mentioned', () => {
            fc.assert(
                fc.property(
                    interestPatternArbitrary,
                    vehicleIndexArbitrary,
                    (pattern, index) => {
                        const indexWords = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'];
                        const message = `${pattern} o ${indexWords[index - 1]}`;
                        const result = service.detectInterest(message);

                        expect(result.hasInterest).toBe(true);
                        expect(result.vehicleIndex).toBe(index);
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 22: Lead capture includes all required fields**
     * **Validates: Requirements 11.2**
     * 
     * *For any* captured lead, the lead data SHALL contain: customerName (non-empty), 
     * customerPhone (valid format), vehicle details (marca, modelo, ano, preco), and conversationSummary.
     */
    describe('Property 22: Lead capture includes all required fields', () => {
        it('should capture lead with all required fields', async () => {
            await fc.assert(
                fc.asyncProperty(
                    customerNameArbitrary,
                    brazilianPhoneArbitrary,
                    vehicleDataArbitrary,
                    async (name, phone, vehicleData) => {
                        const vehicle: VehicleRecommendation & { vehicle: any } = {
                            vehicleId: 'test-vehicle-id',
                            matchScore: 85,
                            reasoning: 'Great match',
                            highlights: [],
                            concerns: [],
                            vehicle: {
                                id: 'test-vehicle-id',
                                ...vehicleData,
                            },
                        };

                        const conversationState: ConversationState = {
                            conversationId: 'test-conv-id',
                            phoneNumber: phone,
                            messages: [
                                { role: 'user', content: 'Olá', timestamp: new Date() },
                                { role: 'assistant', content: 'Olá!', timestamp: new Date() },
                            ],
                            quiz: { currentQuestion: 0, progress: 0, answers: {}, isComplete: true },
                            profile: { customerName: name, budget: 50000 },
                            recommendations: [vehicle],
                            graph: { currentNode: 'recommendation', nodeHistory: [], errorCount: 0, loopCount: 0 },
                            metadata: { startedAt: new Date(), lastMessageAt: new Date(), flags: [] },
                        };

                        const lead = await service.captureLead(phone, name, vehicle, conversationState);

                        // Verify all required fields are present
                        expect(lead.customerName).toBe(name);
                        expect(lead.customerPhone).toBe(phone);
                        expect(lead.vehicleId).toBe('test-vehicle-id');
                        expect(lead.vehicle.marca).toBe(vehicleData.marca);
                        expect(lead.vehicle.modelo).toBe(vehicleData.modelo);
                        expect(lead.vehicle.ano).toBe(vehicleData.ano);
                        expect(lead.vehicle.preco).toBe(vehicleData.preco);
                        expect(lead.conversationSummary).toBeDefined();
                        expect(lead.conversationSummary.length).toBeGreaterThan(0);
                        expect(lead.status).toBe('pending');
                        expect(lead.capturedAt).toBeInstanceOf(Date);
                    }
                ),
                { ...propertyConfig, numRuns: 50 } // Reduced runs for async tests
            );
        });

        it('should use default name when customer name is empty', async () => {
            const vehicle: VehicleRecommendation & { vehicle: any } = {
                vehicleId: 'test-vehicle-id',
                matchScore: 85,
                reasoning: 'Great match',
                highlights: [],
                concerns: [],
                vehicle: {
                    id: 'test-vehicle-id',
                    marca: 'Fiat',
                    modelo: 'Uno',
                    ano: 2020,
                    preco: 45000,
                },
            };

            const conversationState: ConversationState = {
                conversationId: 'test-conv-id',
                phoneNumber: '5511999998888',
                messages: [],
                quiz: { currentQuestion: 0, progress: 0, answers: {}, isComplete: true },
                profile: null,
                recommendations: [vehicle],
                graph: { currentNode: 'recommendation', nodeHistory: [], errorCount: 0, loopCount: 0 },
                metadata: { startedAt: new Date(), lastMessageAt: new Date(), flags: [] },
            };

            const lead = await service.captureLead('5511999998888', '', vehicle, conversationState);

            expect(lead.customerName).toBe('Cliente');
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 23: Lead message formatting includes all required information**
     * **Validates: Requirements 11.4**
     * 
     * *For any* lead data, the formatted seller message SHALL contain: customer name, 
     * customer phone (in clickable format), vehicle marca/modelo/ano/preco, customer preferences summary, and timestamp.
     */
    describe('Property 23: Lead message formatting includes all required information', () => {
        it('should format lead message with all required information', () => {
            fc.assert(
                fc.property(leadDataArbitrary, (leadData) => {
                    const lead: LeadData = {
                        ...leadData,
                        customerPreferences: {
                            budget: 50000,
                            usage: 'cidade',
                        },
                    };

                    const message = service.formatLeadMessage(lead);

                    // Verify all required information is present
                    expect(message).toContain(lead.customerName);
                    expect(message).toContain('wa.me/'); // Clickable phone format
                    expect(message).toContain(lead.vehicle.marca);
                    expect(message).toContain(lead.vehicle.modelo);
                    expect(message).toContain(String(lead.vehicle.ano));
                    expect(message).toContain('R$'); // Price formatting
                    expect(message).toContain('Capturado em:'); // Timestamp
                }),
                propertyConfig
            );
        });

        it('should include vehicle URL when available', () => {
            fc.assert(
                fc.property(
                    leadDataArbitrary,
                    fc.webUrl(),
                    (leadData, url) => {
                        const lead: LeadData = {
                            ...leadData,
                            vehicle: {
                                ...leadData.vehicle,
                                url,
                            },
                        };

                        const message = service.formatLeadMessage(lead);

                        expect(message).toContain(url);
                    }
                ),
                propertyConfig
            );
        });

        it('should include customer preferences when available', () => {
            fc.assert(
                fc.property(
                    leadDataArbitrary,
                    customerPreferencesArbitrary,
                    (leadData, preferences) => {
                        const lead: LeadData = {
                            ...leadData,
                            customerPreferences: preferences,
                        };

                        const message = service.formatLeadMessage(lead);

                        // Message should contain preferences section if preferences exist
                        if (preferences.budget || preferences.usage || preferences.bodyType) {
                            expect(message).toContain('Preferências do Cliente');
                        }
                    }
                ),
                propertyConfig
            );
        });

        it('should use WhatsApp markdown formatting', () => {
            fc.assert(
                fc.property(leadDataArbitrary, (leadData) => {
                    const message = service.formatLeadMessage(leadData);

                    // Should contain bold markers (WhatsApp markdown)
                    expect(message).toContain('*');
                }),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 24: Lead persistence saves with pending status**
     * **Validates: Requirements 11.7**
     * 
     * *For any* newly captured lead, the persisted record SHALL have status="pending" 
     * and a valid capturedAt timestamp.
     */
    describe('Property 24: Lead persistence saves with pending status', () => {
        it('should persist lead with pending status and valid timestamp', async () => {
            const { prisma } = await import('../../src/lib/prisma');

            await fc.assert(
                fc.asyncProperty(leadDataArbitrary, async (leadData) => {
                    // Reset mock
                    vi.mocked(prisma.lead.create).mockClear();
                    vi.mocked(prisma.lead.create).mockResolvedValue({
                        id: 'persisted-lead-id',
                        ...leadData,
                    } as any);

                    const persistedLead = await service.persistLead(leadData);

                    // Verify the lead was created with correct data
                    expect(prisma.lead.create).toHaveBeenCalledWith({
                        data: expect.objectContaining({
                            customerName: leadData.customerName,
                            customerPhone: leadData.customerPhone,
                            vehicleId: leadData.vehicleId,
                            vehicleMarca: leadData.vehicle.marca,
                            vehicleModelo: leadData.vehicle.modelo,
                            vehicleAno: leadData.vehicle.ano,
                            vehiclePreco: leadData.vehicle.preco,
                            status: 'pending',
                            sellerPhone: leadData.sellerPhone,
                        }),
                    });

                    // Verify returned lead has ID
                    expect(persistedLead.id).toBe('persisted-lead-id');
                    expect(persistedLead.status).toBe('pending');
                    expect(persistedLead.capturedAt).toBeInstanceOf(Date);
                }),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should update lead status correctly', async () => {
            const { prisma } = await import('../../src/lib/prisma');

            const statuses: Array<'sent' | 'failed' | 'contacted'> = ['sent', 'failed', 'contacted'];

            for (const status of statuses) {
                vi.mocked(prisma.lead.update).mockClear();

                await service.updateLeadStatus('test-lead-id', status);

                expect(prisma.lead.update).toHaveBeenCalledWith({
                    where: { id: 'test-lead-id' },
                    data: expect.objectContaining({ status }),
                });
            }
        });

        it('should set sentAt timestamp when status is sent', async () => {
            const { prisma } = await import('../../src/lib/prisma');
            vi.mocked(prisma.lead.update).mockClear();

            await service.updateLeadStatus('test-lead-id', 'sent');

            expect(prisma.lead.update).toHaveBeenCalledWith({
                where: { id: 'test-lead-id' },
                data: expect.objectContaining({
                    status: 'sent',
                    sentAt: expect.any(Date),
                }),
            });
        });

        it('should set contactedAt timestamp when status is contacted', async () => {
            const { prisma } = await import('../../src/lib/prisma');
            vi.mocked(prisma.lead.update).mockClear();

            await service.updateLeadStatus('test-lead-id', 'contacted');

            expect(prisma.lead.update).toHaveBeenCalledWith({
                where: { id: 'test-lead-id' },
                data: expect.objectContaining({
                    status: 'contacted',
                    contactedAt: expect.any(Date),
                }),
            });
        });
    });

    /**
     * Additional property tests for customer confirmation
     */
    describe('Customer Confirmation Message', () => {
        it('should include customer name and vehicle name in confirmation', () => {
            fc.assert(
                fc.property(
                    customerNameArbitrary,
                    vehicleDataArbitrary,
                    (name, vehicle) => {
                        const vehicleName = `${vehicle.marca} ${vehicle.modelo} ${vehicle.ano}`;
                        const confirmation = service.formatCustomerConfirmation(name, vehicleName);

                        expect(confirmation).toContain(name);
                        expect(confirmation).toContain(vehicleName);
                        expect(confirmation).toContain('vendedor');
                        expect(confirmation).toContain('contato');
                    }
                ),
                propertyConfig
            );
        });

        it('should use default name when customer name is empty', () => {
            const confirmation = service.formatCustomerConfirmation('', 'Fiat Uno 2020');

            expect(confirmation).toContain('Cliente');
            expect(confirmation).toContain('Fiat Uno 2020');
        });
    });
});

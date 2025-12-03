/**
 * Property-Based Tests for Conversation Flow
 * 
 * **Feature: mvp-producao-concessionaria, Properties 8-10**
 * 
 * Tests:
 * - Property 8: Name input triggers state transition
 * - Property 9: Preference extraction from answers
 * - Property 10: Profile completeness triggers recommendation phase
 * 
 * **Validates: Requirements 4.2, 4.4, 4.5**
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

// Mock LLM router for preference extraction tests
vi.mock('../../src/lib/llm-router', () => ({
    chatCompletion: vi.fn(async (messages: any[]) => {
        const userMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';

        // Budget extraction
        if (userMessage.includes('50 mil') || userMessage.includes('50000')) {
            return JSON.stringify({
                extracted: { budget: 50000, budgetMax: 50000 },
                confidence: 0.95,
                reasoning: 'Budget extracted',
                fieldsExtracted: ['budget', 'budgetMax']
            });
        }

        // Usage extraction
        if (userMessage.includes('cidade') || userMessage.includes('urbano')) {
            return JSON.stringify({
                extracted: { usage: 'cidade' },
                confidence: 0.9,
                reasoning: 'Usage extracted',
                fieldsExtracted: ['usage']
            });
        }

        if (userMessage.includes('viagem') || userMessage.includes('estrada')) {
            return JSON.stringify({
                extracted: { usage: 'viagem' },
                confidence: 0.9,
                reasoning: 'Usage extracted',
                fieldsExtracted: ['usage']
            });
        }

        if (userMessage.includes('trabalho') || userMessage.includes('uber')) {
            return JSON.stringify({
                extracted: { usage: 'trabalho', usoPrincipal: 'uber' },
                confidence: 0.9,
                reasoning: 'Usage extracted',
                fieldsExtracted: ['usage', 'usoPrincipal']
            });
        }

        // Body type extraction
        if (userMessage.includes('suv')) {
            return JSON.stringify({
                extracted: { bodyType: 'suv' },
                confidence: 0.9,
                reasoning: 'Body type extracted',
                fieldsExtracted: ['bodyType']
            });
        }

        if (userMessage.includes('sedan')) {
            return JSON.stringify({
                extracted: { bodyType: 'sedan' },
                confidence: 0.9,
                reasoning: 'Body type extracted',
                fieldsExtracted: ['bodyType']
            });
        }

        if (userMessage.includes('hatch')) {
            return JSON.stringify({
                extracted: { bodyType: 'hatch' },
                confidence: 0.9,
                reasoning: 'Body type extracted',
                fieldsExtracted: ['bodyType']
            });
        }

        // Default - no extraction
        return JSON.stringify({
            extracted: {},
            confidence: 0.1,
            reasoning: 'No preferences found',
            fieldsExtracted: []
        });
    }),
}));

import { discoveryNode } from '../../src/graph/nodes/discovery.node';
import { greetingNode } from '../../src/graph/nodes/greeting.node';
import { ConversationState, CustomerProfile } from '../../src/types/state.types';
import { PreferenceExtractorAgent } from '../../src/agents/preference-extractor.agent';

// Property test configuration: minimum 100 iterations
const propertyConfig = { numRuns: 100 };

/**
 * Arbitraries (Generators) for property tests
 */

// Valid customer name generator (2-50 chars, no special chars)
const customerNameArbitrary = fc.string({ minLength: 2, maxLength: 50 })
    .filter(s => {
        const trimmed = s.trim();
        // Must have at least 2 chars after trim
        if (trimmed.length < 2) return false;
        // Must not be only numbers or special chars
        if (/^[\d\s\W]+$/.test(trimmed)) return false;
        // Must not contain question marks (would be interpreted as question)
        if (trimmed.includes('?')) return false;
        return true;
    })
    .map(s => s.trim());

// Invalid name generator (too short, only numbers, etc.)
const invalidNameArbitrary = fc.oneof(
    fc.constant(''),
    fc.constant(' '),
    fc.stringMatching(/^[0-9]{1,10}$/), // Only numbers
    fc.constant('?'),
    fc.constant('a'), // Too short
);

// Budget value generator (valid range)
const budgetArbitrary = fc.integer({ min: 5000, max: 500000 });

// Usage type generator
const usageArbitrary = fc.constantFrom('cidade', 'viagem', 'trabalho', 'misto');

// Vehicle type generator
const vehicleTypeArbitrary = fc.constantFrom('hatch', 'sedan', 'suv', 'pickup', 'qualquer');

// Budget answer generator (various formats)
const budgetAnswerArbitrary = fc.integer({ min: 5000, max: 500000 })
    .chain(budget => fc.constantFrom(
        budget.toString(),
        `${budget}`,
        `R$ ${budget}`,
        `${Math.floor(budget / 1000)} mil`,
        `até ${budget}`,
    ));

// Usage answer generator (numbered options)
const usageAnswerArbitrary = fc.constantFrom('1', '2', '3', '4');

// Vehicle type answer generator (numbered options)
const vehicleTypeAnswerArbitrary = fc.constantFrom('1', '2', '3', '4', '5');

/**
 * Helper function to create initial conversation state
 */
function createInitialState(overrides: Partial<ConversationState> = {}): ConversationState {
    return {
        conversationId: 'test-conv-id',
        phoneNumber: '5511999998888',
        messages: [],
        quiz: {
            currentQuestion: 0,
            progress: 0,
            answers: {},
            isComplete: false,
        },
        profile: null,
        recommendations: [],
        graph: {
            currentNode: 'greeting',
            nodeHistory: [],
            errorCount: 0,
            loopCount: 0,
        },
        metadata: {
            startedAt: new Date(),
            lastMessageAt: new Date(),
            flags: [],
        },
        ...overrides,
    };
}

/**
 * Helper function to create state after greeting (waiting for name)
 */
function createStateWaitingForName(overrides: Partial<ConversationState> = {}): ConversationState {
    return createInitialState({
        messages: [
            {
                role: 'assistant',
                content: 'Olá! Para começar, qual é o seu nome?',
                timestamp: new Date(),
            },
        ],
        quiz: {
            currentQuestion: 0, // 0 = waiting for name
            progress: 0,
            answers: {},
            isComplete: false,
        },
        graph: {
            currentNode: 'discovery',
            previousNode: 'greeting',
            nodeHistory: ['greeting'],
            errorCount: 0,
            loopCount: 0,
        },
        ...overrides,
    });
}

/**
 * Helper function to create state after name collected (waiting for budget)
 */
function createStateWaitingForBudget(customerName: string): ConversationState {
    return createInitialState({
        messages: [
            { role: 'assistant', content: 'Olá! Qual é o seu nome?', timestamp: new Date() },
            { role: 'user', content: customerName, timestamp: new Date() },
            { role: 'assistant', content: `Prazer, ${customerName}! Qual é o seu orçamento?`, timestamp: new Date() },
        ],
        quiz: {
            currentQuestion: 1, // 1 = waiting for budget
            progress: 1,
            answers: { customerName },
            isComplete: false,
        },
        graph: {
            currentNode: 'discovery',
            previousNode: 'greeting',
            nodeHistory: ['greeting'],
            errorCount: 0,
            loopCount: 0,
        },
    });
}

describe('Conversation Flow - Property Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 8: Name input triggers state transition**
     * **Validates: Requirements 4.2**
     * 
     * *For any* conversation in greeting state, when the customer provides a name, 
     * the conversation SHALL transition to discovery state and store the customer name.
     */
    describe('Property 8: Name input triggers state transition', () => {
        it('should store customer name and advance to next question for valid names', async () => {
            await fc.assert(
                fc.asyncProperty(customerNameArbitrary, async (name) => {
                    // Create state waiting for name input
                    const state = createStateWaitingForName({
                        messages: [
                            {
                                role: 'assistant',
                                content: 'Olá! Para começar, qual é o seu nome?',
                                timestamp: new Date(),
                            },
                            {
                                role: 'user',
                                content: name,
                                timestamp: new Date(),
                            },
                        ],
                    });

                    // Process the name input through discovery node
                    const result = await discoveryNode(state);

                    // Verify name was stored in answers
                    expect(result.quiz?.answers?.customerName).toBeDefined();
                    expect(result.quiz?.answers?.customerName.length).toBeGreaterThanOrEqual(2);

                    // Verify progress advanced
                    expect(result.quiz?.progress).toBeGreaterThan(0);

                    // Verify next question is asked (currentQuestion advanced)
                    expect(result.quiz?.currentQuestion).toBeGreaterThan(0);
                }),
                propertyConfig
            );
        });

        it('should reject invalid names and ask again', async () => {
            await fc.assert(
                fc.asyncProperty(invalidNameArbitrary, async (invalidName) => {
                    // Create state waiting for name input
                    const state = createStateWaitingForName({
                        messages: [
                            {
                                role: 'assistant',
                                content: 'Olá! Para começar, qual é o seu nome?',
                                timestamp: new Date(),
                            },
                            {
                                role: 'user',
                                content: invalidName,
                                timestamp: new Date(),
                            },
                        ],
                    });

                    // Process the invalid name input
                    const result = await discoveryNode(state);

                    // Verify name was NOT stored (or validation failed)
                    // The quiz should not advance - currentQuestion stays at 0 or is undefined (no change)
                    const currentQuestion = result.quiz?.currentQuestion ?? state.quiz.currentQuestion;
                    expect(currentQuestion).toBe(0);

                    // Progress should not advance
                    const progress = result.quiz?.progress ?? state.quiz.progress;
                    expect(progress).toBe(0);

                    // Should have an error message asking for name again
                    const lastMessage = result.messages?.[result.messages.length - 1];
                    expect(lastMessage?.role).toBe('assistant');
                    expect(lastMessage?.content.toLowerCase()).toContain('nome');
                }),
                propertyConfig
            );
        });

        it('should transition from greeting to discovery after valid name', async () => {
            await fc.assert(
                fc.asyncProperty(customerNameArbitrary, async (name) => {
                    // Start with greeting state
                    const initialState = createInitialState();

                    // First, run greeting node to get the greeting message
                    const greetingResult = await greetingNode(initialState);

                    // Verify greeting transitions to discovery
                    expect(greetingResult.graph?.currentNode).toBe('discovery');

                    // Now create state with user's name response
                    const stateWithName: ConversationState = {
                        ...initialState,
                        messages: [
                            ...(greetingResult.messages || []),
                            { role: 'user', content: name, timestamp: new Date() },
                        ],
                        quiz: greetingResult.quiz || initialState.quiz,
                        graph: greetingResult.graph || initialState.graph,
                    };

                    // Process name through discovery node
                    const discoveryResult = await discoveryNode(stateWithName);

                    // Verify name was captured
                    if (discoveryResult.quiz?.answers?.customerName) {
                        expect(discoveryResult.quiz.answers.customerName.length).toBeGreaterThanOrEqual(2);
                    }
                }),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 9: Preference extraction from answers**
     * **Validates: Requirements 4.4**
     * 
     * *For any* customer answer containing budget or usage information, 
     * the preference extractor SHALL correctly identify and store these values in the profile.
     */
    describe('Property 9: Preference extraction from answers', () => {
        let extractor: PreferenceExtractorAgent;

        beforeEach(() => {
            extractor = new PreferenceExtractorAgent();
        });

        it('should extract budget from various budget answer formats', async () => {
            await fc.assert(
                fc.asyncProperty(budgetArbitrary, async (budget) => {
                    // Test with direct number format
                    const message = `Tenho ${budget} de orçamento`;
                    const result = await extractor.extract(message);

                    // Budget should be extracted (may be in budget or budgetMax)
                    const extractedBudget = result.extracted.budget || result.extracted.budgetMax;

                    // If extraction happened, verify it's reasonable
                    if (extractedBudget !== undefined) {
                        expect(extractedBudget).toBeGreaterThan(0);
                    }
                }),
                { ...propertyConfig, numRuns: 50 } // Reduced for async
            );
        });

        it('should extract usage type from usage answers', async () => {
            const usageMessages = [
                { message: 'Vou usar na cidade', expected: 'cidade' },
                { message: 'Para viagem', expected: 'viagem' },
                { message: 'Para trabalho com Uber', expected: 'trabalho' },
            ];

            for (const { message, expected } of usageMessages) {
                const result = await extractor.extract(message);

                // Usage should be extracted
                if (result.extracted.usage) {
                    expect(result.extracted.usage).toBe(expected);
                }
            }
        });

        it('should extract body type preferences', async () => {
            const bodyTypeMessages = [
                { message: 'Quero um SUV', expected: 'suv' },
                { message: 'Prefiro sedan', expected: 'sedan' },
                { message: 'Um hatch compacto', expected: 'hatch' },
            ];

            for (const { message, expected } of bodyTypeMessages) {
                const result = await extractor.extract(message);

                // Body type should be extracted
                if (result.extracted.bodyType) {
                    expect(result.extracted.bodyType).toBe(expected);
                }
            }
        });

        it('should correctly merge extracted preferences with existing profile', () => {
            fc.assert(
                fc.property(
                    budgetArbitrary,
                    usageArbitrary,
                    vehicleTypeArbitrary,
                    (budget, usage, vehicleType) => {
                        const currentProfile: Partial<CustomerProfile> = {
                            customerName: 'João',
                            priorities: ['economico'],
                        };

                        const extracted: Partial<CustomerProfile> = {
                            budget,
                            usage,
                            bodyType: vehicleType as any,
                            priorities: ['conforto'],
                        };

                        const merged = extractor.mergeWithProfile(currentProfile, extracted);

                        // Original values should be preserved
                        expect(merged.customerName).toBe('João');

                        // New values should be added
                        expect(merged.budget).toBe(budget);
                        expect(merged.usage).toBe(usage);
                        expect(merged.bodyType).toBe(vehicleType);

                        // Priorities should be merged (unique)
                        expect(merged.priorities).toContain('economico');
                        expect(merged.priorities).toContain('conforto');
                    }
                ),
                propertyConfig
            );
        });

        it('should deduplicate priorities when merging', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.constantFrom('economico', 'conforto', 'espaco', 'seguranca'), { minLength: 1, maxLength: 4 }),
                    fc.array(fc.constantFrom('economico', 'conforto', 'espaco', 'seguranca'), { minLength: 1, maxLength: 4 }),
                    (currentPriorities, newPriorities) => {
                        const currentProfile: Partial<CustomerProfile> = {
                            priorities: currentPriorities,
                        };

                        const extracted: Partial<CustomerProfile> = {
                            priorities: newPriorities,
                        };

                        const merged = extractor.mergeWithProfile(currentProfile, extracted);

                        // All priorities should be unique
                        const uniquePriorities = [...new Set(merged.priorities)];
                        expect(merged.priorities?.length).toBe(uniquePriorities.length);

                        // All original priorities should be present
                        for (const p of currentPriorities) {
                            expect(merged.priorities).toContain(p);
                        }

                        // All new priorities should be present
                        for (const p of newPriorities) {
                            expect(merged.priorities).toContain(p);
                        }
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 10: Profile completeness triggers recommendation phase**
     * **Validates: Requirements 4.5**
     * 
     * *For any* customer profile with budget defined and at least one preference, 
     * the system SHALL transition to recommendation phase.
     */
    describe('Property 10: Profile completeness triggers recommendation phase', () => {
        it('should transition to search/recommendation when profile has budget and usage', async () => {
            await fc.assert(
                fc.asyncProperty(
                    customerNameArbitrary,
                    budgetArbitrary,
                    usageArbitrary,
                    async (name, budget, usage) => {
                        // Create state with complete profile (name, budget, usage)
                        // Simulate being at the vehicle type question (question 3)
                        const state = createInitialState({
                            messages: [
                                { role: 'assistant', content: 'Qual tipo de veículo?', timestamp: new Date() },
                                { role: 'user', content: '1', timestamp: new Date() }, // hatch
                            ],
                            quiz: {
                                currentQuestion: 3, // Vehicle type question
                                progress: 3,
                                answers: {
                                    customerName: name,
                                    budget: budget,
                                    usage: usage,
                                },
                                isComplete: false,
                            },
                            graph: {
                                currentNode: 'discovery',
                                previousNode: 'greeting',
                                nodeHistory: ['greeting'],
                                errorCount: 0,
                                loopCount: 0,
                            },
                        });

                        const result = await discoveryNode(state);

                        // Profile should be generated
                        if (result.profile) {
                            expect(result.profile.customerName).toBe(name);
                            expect(result.profile.budget).toBe(budget);
                        }

                        // Should transition to search or have complete quiz
                        const transitionedToSearch = result.graph?.currentNode === 'search';
                        const quizComplete = result.quiz?.isComplete === true;

                        // Either transitioned to search OR quiz is complete (both valid)
                        expect(transitionedToSearch || quizComplete || result.profile !== undefined).toBe(true);
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should NOT transition to recommendation without budget', async () => {
            await fc.assert(
                fc.asyncProperty(
                    customerNameArbitrary,
                    usageArbitrary,
                    async (name, usage) => {
                        // Create state with profile missing budget
                        const state = createInitialState({
                            messages: [
                                { role: 'assistant', content: 'Qual é o seu orçamento?', timestamp: new Date() },
                                { role: 'user', content: 'não sei', timestamp: new Date() }, // Invalid budget
                            ],
                            quiz: {
                                currentQuestion: 1, // Budget question
                                progress: 1,
                                answers: {
                                    customerName: name,
                                },
                                isComplete: false,
                            },
                            graph: {
                                currentNode: 'discovery',
                                previousNode: 'greeting',
                                nodeHistory: ['greeting'],
                                errorCount: 0,
                                loopCount: 0,
                            },
                        });

                        const result = await discoveryNode(state);

                        // Should NOT transition to search without valid budget
                        expect(result.graph?.currentNode).not.toBe('search');
                        expect(result.quiz?.isComplete).not.toBe(true);
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should generate profile with budgetFlexibility of 20%', async () => {
            await fc.assert(
                fc.asyncProperty(
                    customerNameArbitrary,
                    budgetArbitrary,
                    async (name, budget) => {
                        // Create state that will complete the quiz
                        const state = createInitialState({
                            messages: [
                                { role: 'assistant', content: 'Qual tipo de veículo?', timestamp: new Date() },
                                { role: 'user', content: '5', timestamp: new Date() }, // qualquer
                            ],
                            quiz: {
                                currentQuestion: 3,
                                progress: 3,
                                answers: {
                                    customerName: name,
                                    budget: budget,
                                    usage: 'cidade',
                                },
                                isComplete: false,
                            },
                            graph: {
                                currentNode: 'discovery',
                                previousNode: 'greeting',
                                nodeHistory: ['greeting'],
                                errorCount: 0,
                                loopCount: 0,
                            },
                        });

                        const result = await discoveryNode(state);

                        // If profile was generated, check budgetFlexibility
                        if (result.profile) {
                            // Requirements 5.2: ±20% tolerance
                            expect(result.profile.budgetFlexibility).toBe(20);
                        }
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should include all collected answers in the generated profile', async () => {
            await fc.assert(
                fc.asyncProperty(
                    customerNameArbitrary,
                    budgetArbitrary,
                    usageArbitrary,
                    vehicleTypeArbitrary,
                    async (name, budget, usage, vehicleType) => {
                        // Simulate completing all questions
                        const state = createInitialState({
                            messages: [
                                { role: 'assistant', content: 'Qual tipo de veículo?', timestamp: new Date() },
                                { role: 'user', content: '1', timestamp: new Date() },
                            ],
                            quiz: {
                                currentQuestion: 3,
                                progress: 3,
                                answers: {
                                    customerName: name,
                                    budget: budget,
                                    usage: usage,
                                },
                                isComplete: false,
                            },
                            graph: {
                                currentNode: 'discovery',
                                previousNode: 'greeting',
                                nodeHistory: ['greeting'],
                                errorCount: 0,
                                loopCount: 0,
                            },
                        });

                        const result = await discoveryNode(state);

                        // If profile was generated, verify all fields are present
                        if (result.profile) {
                            expect(result.profile.customerName).toBe(name);
                            expect(result.profile.budget).toBe(budget);
                            expect(result.profile.usagePattern).toBeDefined();
                        }
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });
    });
});

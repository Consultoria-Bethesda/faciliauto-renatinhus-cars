/**
 * Property-Based Tests for Webhook Signature Validation
 * 
 * **Feature: mvp-producao-concessionaria, Property 16**
 * 
 * Tests:
 * - Property 16: Webhook signature validation
 * 
 * **Validates: Requirements 8.1**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import crypto from 'crypto';

// Mock logger to avoid console noise during tests
vi.mock('../../src/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock env to control app secret
vi.mock('../../src/config/env', () => ({
    env: {
        META_WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
        META_WHATSAPP_TOKEN: 'test-token',
        META_APP_SECRET: 'test-app-secret-key-12345',
        META_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
    },
}));

// Property test configuration: minimum 100 iterations
const propertyConfig = { numRuns: 100 };

/**
 * Helper function to generate valid HMAC-SHA256 signature
 */
function generateValidSignature(payload: string, secret: string): string {
    const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    return `sha256=${hash}`;
}

/**
 * Helper function to generate invalid signature (wrong hash)
 */
function generateInvalidSignature(payload: string, wrongSecret: string): string {
    const hash = crypto
        .createHmac('sha256', wrongSecret)
        .update(payload)
        .digest('hex');
    return `sha256=${hash}`;
}

/**
 * Arbitraries (Generators) for property tests
 */

// Valid JSON payload generator (simulating Meta webhook payloads)
const webhookPayloadArbitrary = fc.record({
    object: fc.constant('whatsapp_business_account'),
    entry: fc.array(
        fc.record({
            id: fc.string({ minLength: 10, maxLength: 20 }),
            changes: fc.array(
                fc.record({
                    value: fc.record({
                        messaging_product: fc.constant('whatsapp'),
                        metadata: fc.record({
                            display_phone_number: fc.stringMatching(/^55\d{10,11}$/),
                            phone_number_id: fc.string({ minLength: 10, maxLength: 20 }),
                        }),
                        messages: fc.option(
                            fc.array(
                                fc.record({
                                    from: fc.stringMatching(/^55\d{10,11}$/),
                                    id: fc.string({ minLength: 20, maxLength: 40 }),
                                    timestamp: fc.integer({ min: 1600000000, max: 2000000000 }).map(String),
                                    text: fc.record({
                                        body: fc.string({ minLength: 1, maxLength: 500 }),
                                    }),
                                    type: fc.constant('text'),
                                }),
                                { minLength: 1, maxLength: 3 }
                            ),
                            { nil: undefined }
                        ),
                    }),
                    field: fc.constant('messages'),
                }),
                { minLength: 1, maxLength: 2 }
            ),
        }),
        { minLength: 1, maxLength: 2 }
    ),
}).map(obj => JSON.stringify(obj));

// App secret generator (valid secrets)
const appSecretArbitrary = fc.string({ minLength: 16, maxLength: 64 });

// Random string payload generator
const randomPayloadArbitrary = fc.string({ minLength: 10, maxLength: 1000 });

// Invalid signature format generator
const invalidSignatureFormatArbitrary = fc.oneof(
    fc.constant(''),
    fc.constant('invalid'),
    fc.constant('md5=abc123'),
    fc.constant('sha256'),
    fc.constant('sha256='),
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('sha256=')),
);

describe('Webhook Signature Validation - Property Tests', () => {
    let WhatsAppMetaService: any;
    let service: any;

    beforeEach(async () => {
        // Clear module cache to ensure fresh import with mocked env
        vi.resetModules();

        // Re-import with mocks applied
        const module = await import('../../src/services/whatsapp-meta.service');
        WhatsAppMetaService = module.WhatsAppMetaService;
        service = new WhatsAppMetaService();

        // Override the appSecret for testing
        (service as any).appSecret = 'test-app-secret-key-12345';
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    /**
     * **Feature: mvp-producao-concessionaria, Property 16: Webhook signature validation**
     * **Validates: Requirements 8.1**
     * 
     * *For any* incoming webhook request, the signature validation SHALL return true 
     * only if the signature matches the expected HMAC-SHA256 of the payload.
     */
    describe('Property 16: Webhook signature validation', () => {
        it('should return true for valid signatures with correct HMAC-SHA256', () => {
            fc.assert(
                fc.property(
                    webhookPayloadArbitrary,
                    appSecretArbitrary,
                    (payload, secret) => {
                        // Set the secret for this test
                        (service as any).appSecret = secret;

                        // Generate valid signature
                        const validSignature = generateValidSignature(payload, secret);

                        // Validate
                        const result = service.validateWebhookSignature(validSignature, payload);

                        expect(result).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should return false for signatures with wrong secret', () => {
            fc.assert(
                fc.property(
                    webhookPayloadArbitrary,
                    appSecretArbitrary,
                    appSecretArbitrary.filter(s => s.length > 0),
                    (payload, correctSecret, wrongSecret) => {
                        // Ensure secrets are different
                        fc.pre(correctSecret !== wrongSecret);

                        // Set the correct secret
                        (service as any).appSecret = correctSecret;

                        // Generate signature with wrong secret
                        const invalidSignature = generateInvalidSignature(payload, wrongSecret);

                        // Validate should fail
                        const result = service.validateWebhookSignature(invalidSignature, payload);

                        expect(result).toBe(false);
                    }
                ),
                propertyConfig
            );
        });

        it('should return false for modified payloads', () => {
            fc.assert(
                fc.property(
                    webhookPayloadArbitrary,
                    appSecretArbitrary,
                    fc.string({ minLength: 1, maxLength: 50 }),
                    (payload, secret, modification) => {
                        // Set the secret
                        (service as any).appSecret = secret;

                        // Generate valid signature for original payload
                        const validSignature = generateValidSignature(payload, secret);

                        // Modify the payload
                        const modifiedPayload = payload + modification;

                        // Validate with modified payload should fail
                        const result = service.validateWebhookSignature(validSignature, modifiedPayload);

                        expect(result).toBe(false);
                    }
                ),
                propertyConfig
            );
        });

        it('should return false for missing signature', () => {
            fc.assert(
                fc.property(
                    webhookPayloadArbitrary,
                    appSecretArbitrary,
                    (payload, secret) => {
                        // Set the secret
                        (service as any).appSecret = secret;

                        // Validate with undefined signature
                        const result = service.validateWebhookSignature(undefined, payload);

                        expect(result).toBe(false);
                    }
                ),
                propertyConfig
            );
        });

        it('should return false for invalid signature format', () => {
            fc.assert(
                fc.property(
                    webhookPayloadArbitrary,
                    appSecretArbitrary,
                    invalidSignatureFormatArbitrary,
                    (payload, secret, invalidSignature) => {
                        // Set the secret
                        (service as any).appSecret = secret;

                        // Validate with invalid format
                        const result = service.validateWebhookSignature(invalidSignature, payload);

                        expect(result).toBe(false);
                    }
                ),
                propertyConfig
            );
        });

        it('should be deterministic - same inputs always produce same result', () => {
            fc.assert(
                fc.property(
                    webhookPayloadArbitrary,
                    appSecretArbitrary,
                    (payload, secret) => {
                        // Set the secret
                        (service as any).appSecret = secret;

                        // Generate valid signature
                        const validSignature = generateValidSignature(payload, secret);

                        // Validate multiple times
                        const result1 = service.validateWebhookSignature(validSignature, payload);
                        const result2 = service.validateWebhookSignature(validSignature, payload);
                        const result3 = service.validateWebhookSignature(validSignature, payload);

                        // All results should be the same
                        expect(result1).toBe(result2);
                        expect(result2).toBe(result3);
                        expect(result1).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should handle random payloads correctly', () => {
            fc.assert(
                fc.property(
                    randomPayloadArbitrary,
                    appSecretArbitrary,
                    (payload, secret) => {
                        // Set the secret
                        (service as any).appSecret = secret;

                        // Generate valid signature
                        const validSignature = generateValidSignature(payload, secret);

                        // Validate
                        const result = service.validateWebhookSignature(validSignature, payload);

                        expect(result).toBe(true);
                    }
                ),
                propertyConfig
            );
        });

        it('should reject signatures with truncated hash', () => {
            fc.assert(
                fc.property(
                    webhookPayloadArbitrary,
                    appSecretArbitrary,
                    fc.integer({ min: 1, max: 63 }),
                    (payload, secret, truncateLength) => {
                        // Set the secret
                        (service as any).appSecret = secret;

                        // Generate valid signature and truncate the hash
                        const validSignature = generateValidSignature(payload, secret);
                        const truncatedSignature = validSignature.substring(0, 7 + truncateLength); // 'sha256=' is 7 chars

                        // Validate with truncated signature should fail
                        const result = service.validateWebhookSignature(truncatedSignature, payload);

                        expect(result).toBe(false);
                    }
                ),
                propertyConfig
            );
        });
    });
});

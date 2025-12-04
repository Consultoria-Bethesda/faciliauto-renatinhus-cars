/**
 * Property-Based Tests for Audio Messages Feature
 * 
 * **Feature: audio-messages**
 * 
 * Tests:
 * - Property 1: Audio Processing Pipeline Integrity
 * - Property 2: File Size Validation
 * - Property 3: Transcription Timeout Enforcement
 * - Property 4: Audio Response Formatting
 * - Property 5: Audio Logging Completeness
 * - Property 6: Audio Message Storage Compliance
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.5, 6.1, 6.2, 6.3**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { GroqTranscriptionProvider } from '../../src/services/groq-transcription.provider';
import { WhatsAppMetaService } from '../../src/services/whatsapp-meta.service';
import { formatAudioResponse, truncateWithEllipsis } from '../../src/services/message-formatter.service';
import { maskPhoneNumber } from '../../src/utils/audio-logger';
import type { AudioMetadata, TranscriptionResult } from '../../src/services/transcription.service';

// Mock logger to avoid console noise during tests
vi.mock('../../src/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock env to provide test configuration
vi.mock('../../src/config/env', () => ({
    env: {
        GROQ_API_KEY: 'test-api-key',
        NODE_ENV: 'test',
        META_WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
        META_WHATSAPP_TOKEN: 'test-token',
        META_APP_SECRET: 'test-secret',
    },
}));

// Mock MessageHandlerV2 to prevent database connection attempts
vi.mock('../../src/services/message-handler-v2.service', () => ({
    MessageHandlerV2: class MockMessageHandlerV2 {
        handleMessage = vi.fn().mockResolvedValue('Mocked response');
        storeAudioMessage = vi.fn().mockResolvedValue({ id: 'mocked-message-id' });
    },
}));

// Property test configuration: minimum 100 iterations
const propertyConfig = { numRuns: 100 };

/**
 * Arbitraries (Generators) for property tests
 */

// Audio metadata generator
const audioMetadataArbitrary = (fileSize?: number): fc.Arbitrary<AudioMetadata> =>
    fc.record({
        mediaId: fc.uuid(),
        mimeType: fc.constantFrom('audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'),
        fileSize: fileSize !== undefined ? fc.constant(fileSize) : fc.integer({ min: 1, max: 50 * 1024 * 1024 }),
        duration: fc.option(fc.integer({ min: 1, max: 300 }), { nil: undefined }),
    });

// File size that exceeds 16MB limit
const oversizedFileSizeArbitrary = fc.integer({ min: 16 * 1024 * 1024 + 1, max: 50 * 1024 * 1024 });

// File size within 16MB limit
const validFileSizeArbitrary = fc.integer({ min: 1, max: 16 * 1024 * 1024 });

// Buffer generator with specific size
const bufferWithSizeArbitrary = (size: number): fc.Arbitrary<Buffer> =>
    fc.constant(Buffer.alloc(size));

describe('Audio Messages - Property Tests', () => {
    let provider: GroqTranscriptionProvider;

    beforeEach(() => {
        provider = new GroqTranscriptionProvider();
        vi.clearAllMocks();
    });

    /**
     * **Feature: audio-messages, Property 1: Audio Processing Pipeline Integrity**
     * **Validates: Requirements 1.1, 1.3, 1.5**
     * 
     * *For any* valid audio message received from WhatsApp, the system SHALL download 
     * the audio, pass it to the transcription service, and forward the resulting text 
     * to the message handler, producing a response.
     */
    describe('Property 1: Audio Processing Pipeline Integrity', () => {
        // Generator for valid transcribed text (non-empty strings)
        const validTranscribedTextArbitrary = fc.string({ minLength: 1, maxLength: 500 })
            .filter(s => s.trim().length > 0);

        // Generator for valid bot responses
        const validBotResponseArbitrary = fc.string({ minLength: 1, maxLength: 1000 })
            .filter(s => s.trim().length > 0);

        // Generator for valid audio metadata
        const validAudioMetadataArbitrary = fc.record({
            mediaId: fc.uuid(),
            mimeType: fc.constantFrom('audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'),
            fileSize: fc.integer({ min: 1, max: 16 * 1024 * 1024 }), // Valid size (up to 16MB)
        });

        // Generator for phone numbers (Brazilian format)
        const phoneNumberArbitrary = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 11, maxLength: 13 })
            .map(digits => '55' + digits.join(''));

        it('should process valid audio through the complete pipeline: download -> validate -> transcribe -> handle', async () => {
            await fc.assert(
                fc.asyncProperty(
                    validAudioMetadataArbitrary,
                    validTranscribedTextArbitrary,
                    validBotResponseArbitrary,
                    phoneNumberArbitrary,
                    async (audioMeta, transcribedText, botResponse, phoneNumber) => {
                        // Track pipeline stages
                        let downloadCalled = false;
                        let transcribeCalled = false;
                        let messageHandlerCalled = false;
                        let sendMessageCalled = false;
                        let capturedTranscribedText = '';
                        let capturedResponse = '';

                        // Create service with mocked dependencies
                        const service = new WhatsAppMetaService();

                        // Mock downloadMedia
                        // @ts-expect-error - mocking private method for testing
                        service.downloadMedia = vi.fn().mockImplementation(async (mediaId: string) => {
                            downloadCalled = true;
                            expect(mediaId).toBe(audioMeta.mediaId);
                            return Buffer.alloc(audioMeta.fileSize);
                        });

                        // Mock transcription service methods
                        // @ts-expect-error - accessing private property for testing
                        service.transcriptionService.transcribe = vi.fn().mockImplementation(async (_buffer: Buffer, _metadata: AudioMetadata): Promise<TranscriptionResult> => {
                            transcribeCalled = true;
                            return {
                                success: true,
                                text: transcribedText,
                                duration: 10,
                                language: 'pt',
                            };
                        });
                        // @ts-expect-error - accessing private property for testing
                        service.transcriptionService.validateAudio = vi.fn().mockReturnValue({ valid: true });

                        // Mock message handler
                        // @ts-expect-error - accessing private property for testing
                        service.messageHandler = {
                            handleMessage: vi.fn().mockImplementation(async (phone: string, text: string) => {
                                messageHandlerCalled = true;
                                capturedTranscribedText = text;
                                expect(phone).toBe(phoneNumber);
                                expect(text).toBe(transcribedText);
                                return botResponse;
                            }),
                            storeAudioMessage: vi.fn().mockResolvedValue({ id: 'stored-message-id', conversationId: 'test-conversation-id' }),
                            storeOutgoingMessage: vi.fn().mockResolvedValue(undefined),
                        };

                        // Mock sendMessage
                        // @ts-expect-error - mocking method for testing
                        service.sendMessage = vi.fn().mockImplementation(async (to: string, text: string) => {
                            sendMessageCalled = true;
                            capturedResponse = text;
                            expect(to).toBe(phoneNumber);
                        });

                        // Mock markMessageAsRead (private method)
                        // @ts-expect-error - mocking private method for testing
                        service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                        // Create a valid audio message
                        const message = {
                            from: phoneNumber,
                            id: 'test-message-id',
                            timestamp: Date.now().toString(),
                            type: 'audio',
                            audio: {
                                id: audioMeta.mediaId,
                                mime_type: audioMeta.mimeType,
                            },
                        };

                        // Execute the pipeline
                        await service.handleAudioMessage(message);

                        // Verify all pipeline stages were executed in order
                        expect(downloadCalled).toBe(true);
                        expect(transcribeCalled).toBe(true);
                        expect(messageHandlerCalled).toBe(true);
                        expect(sendMessageCalled).toBe(true);

                        // Verify the transcribed text was forwarded to message handler
                        expect(capturedTranscribedText).toBe(transcribedText);

                        // Verify the response contains the bot response
                        expect(capturedResponse).toContain(botResponse);

                        // Verify the response contains the audio indicator
                        expect(capturedResponse).toContain('🎤');
                    }
                ),
                { ...propertyConfig, numRuns: 50 } // Fewer runs for async tests
            );
        });

        it('should forward transcribed text unchanged to message handler', async () => {
            await fc.assert(
                fc.asyncProperty(
                    validTranscribedTextArbitrary,
                    phoneNumberArbitrary,
                    async (transcribedText, phoneNumber) => {
                        let capturedText = '';

                        const service = new WhatsAppMetaService();

                        // @ts-expect-error - mocking private method for testing
                        service.downloadMedia = vi.fn().mockResolvedValue(Buffer.alloc(1000));

                        // @ts-expect-error - accessing private property for testing
                        service.transcriptionService = {
                            transcribe: vi.fn().mockResolvedValue({
                                success: true,
                                text: transcribedText,
                                duration: 5,
                                language: 'pt',
                            }),
                            validateAudio: vi.fn().mockReturnValue({ valid: true }),
                        };

                        // @ts-expect-error - accessing private property for testing
                        service.messageHandler = {
                            handleMessage: vi.fn().mockImplementation(async (_phone: string, text: string) => {
                                capturedText = text;
                                return 'Bot response';
                            }),
                            storeAudioMessage: vi.fn().mockResolvedValue({ id: 'stored-message-id', conversationId: 'test-conversation-id' }),
                            storeOutgoingMessage: vi.fn().mockResolvedValue(undefined),
                        };

                        // @ts-expect-error - mocking method for testing
                        service.sendMessage = vi.fn().mockResolvedValue(undefined);
                        // @ts-expect-error - mocking private method for testing
                        service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                        const message = {
                            from: phoneNumber,
                            id: 'test-id',
                            timestamp: Date.now().toString(),
                            type: 'audio',
                            audio: { id: 'media-id', mime_type: 'audio/ogg' },
                        };

                        await service.handleAudioMessage(message);

                        // The transcribed text should be forwarded unchanged
                        expect(capturedText).toBe(transcribedText);
                    }
                ),
                propertyConfig
            );
        });

        it('should produce a response for any valid audio that transcribes successfully', async () => {
            await fc.assert(
                fc.asyncProperty(
                    validTranscribedTextArbitrary,
                    validBotResponseArbitrary,
                    phoneNumberArbitrary,
                    async (transcribedText, botResponse, phoneNumber) => {
                        let responseSent = false;
                        let sentResponse = '';

                        const service = new WhatsAppMetaService();

                        // @ts-expect-error - mocking private method for testing
                        service.downloadMedia = vi.fn().mockResolvedValue(Buffer.alloc(1000));

                        // @ts-expect-error - accessing private property for testing
                        service.transcriptionService = {
                            transcribe: vi.fn().mockResolvedValue({
                                success: true,
                                text: transcribedText,
                                duration: 5,
                                language: 'pt',
                            }),
                            validateAudio: vi.fn().mockReturnValue({ valid: true }),
                        };

                        // @ts-expect-error - accessing private property for testing
                        service.messageHandler = {
                            handleMessage: vi.fn().mockResolvedValue(botResponse),
                            storeAudioMessage: vi.fn().mockResolvedValue({ id: 'stored-message-id', conversationId: 'test-conversation-id' }),
                            storeOutgoingMessage: vi.fn().mockResolvedValue(undefined),
                        };

                        // @ts-expect-error - mocking method for testing
                        service.sendMessage = vi.fn().mockImplementation(async (_to: string, text: string) => {
                            responseSent = true;
                            sentResponse = text;
                        });
                        // @ts-expect-error - mocking private method for testing
                        service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                        const message = {
                            from: phoneNumber,
                            id: 'test-id',
                            timestamp: Date.now().toString(),
                            type: 'audio',
                            audio: { id: 'media-id', mime_type: 'audio/ogg' },
                        };

                        await service.handleAudioMessage(message);

                        // A response should always be sent for valid audio
                        expect(responseSent).toBe(true);
                        expect(sentResponse.length).toBeGreaterThan(0);
                        // Response should contain the bot's response
                        expect(sentResponse).toContain(botResponse);
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: audio-messages, Property 2: File Size Validation**
     * **Validates: Requirements 1.2**
     * 
     * *For any* audio buffer with size greater than 16MB, the validateAudio function 
     * SHALL return `{ valid: false, error: { code: 'SIZE_EXCEEDED' } }`.
     */
    describe('Property 2: File Size Validation', () => {
        it('should reject audio files larger than 16MB', () => {
            fc.assert(
                fc.property(
                    oversizedFileSizeArbitrary,
                    fc.uuid(),
                    fc.constantFrom('audio/ogg', 'audio/mpeg', 'audio/mp4'),
                    (fileSize, mediaId, mimeType) => {
                        // Create a buffer with the oversized file size
                        const buffer = Buffer.alloc(fileSize);
                        const metadata: AudioMetadata = {
                            mediaId,
                            mimeType,
                            fileSize,
                        };

                        const result = provider.validateAudio(buffer, metadata);

                        // Should be invalid with SIZE_EXCEEDED error
                        expect(result.valid).toBe(false);
                        expect(result.error).toBeDefined();
                        expect(result.error?.code).toBe('SIZE_EXCEEDED');
                    }
                ),
                propertyConfig
            );
        });

        it('should accept audio files of exactly 16MB or smaller', () => {
            fc.assert(
                fc.property(
                    validFileSizeArbitrary,
                    fc.uuid(),
                    fc.constantFrom('audio/ogg', 'audio/mpeg', 'audio/mp4'),
                    (fileSize, mediaId, mimeType) => {
                        // Create a buffer with valid file size
                        const buffer = Buffer.alloc(fileSize);
                        const metadata: AudioMetadata = {
                            mediaId,
                            mimeType,
                            fileSize,
                        };

                        const result = provider.validateAudio(buffer, metadata);

                        // Should be valid
                        expect(result.valid).toBe(true);
                        expect(result.error).toBeUndefined();
                    }
                ),
                propertyConfig
            );
        });

        it('should use buffer length when fileSize is not provided in metadata', () => {
            fc.assert(
                fc.property(
                    oversizedFileSizeArbitrary,
                    fc.uuid(),
                    fc.constantFrom('audio/ogg', 'audio/mpeg', 'audio/mp4'),
                    (bufferSize, mediaId, mimeType) => {
                        // Create a buffer with oversized length
                        const buffer = Buffer.alloc(bufferSize);
                        const metadata: AudioMetadata = {
                            mediaId,
                            mimeType,
                            // fileSize not provided - should use buffer.length
                        };

                        const result = provider.validateAudio(buffer, metadata);

                        // Should be invalid because buffer.length exceeds limit
                        expect(result.valid).toBe(false);
                        expect(result.error?.code).toBe('SIZE_EXCEEDED');
                    }
                ),
                propertyConfig
            );
        });

        it('should validate boundary case at exactly 16MB', () => {
            const exactLimit = 16 * 1024 * 1024;
            const buffer = Buffer.alloc(exactLimit);
            const metadata: AudioMetadata = {
                mediaId: 'test-media-id',
                mimeType: 'audio/ogg',
                fileSize: exactLimit,
            };

            const result = provider.validateAudio(buffer, metadata);

            // Exactly 16MB should be valid
            expect(result.valid).toBe(true);
        });

        it('should reject files just over 16MB limit', () => {
            const justOverLimit = 16 * 1024 * 1024 + 1;
            const buffer = Buffer.alloc(justOverLimit);
            const metadata: AudioMetadata = {
                mediaId: 'test-media-id',
                mimeType: 'audio/ogg',
                fileSize: justOverLimit,
            };

            const result = provider.validateAudio(buffer, metadata);

            // Just over 16MB should be invalid
            expect(result.valid).toBe(false);
            expect(result.error?.code).toBe('SIZE_EXCEEDED');
        });
    });


    /**
     * **Feature: audio-messages, Property 3: Transcription Timeout Enforcement**
     * **Validates: Requirements 1.4**
     * 
     * *For any* transcription request, if the Groq API does not respond within 30 seconds,
     * the transcribe function SHALL return a result with `error.code === 'TIMEOUT'`.
     */
    describe('Property 3: Transcription Timeout Enforcement', () => {
        it('should return TIMEOUT error when API takes longer than 30 seconds', async () => {
            // Mock the Groq client to simulate a slow response
            const mockGroqClient = {
                audio: {
                    transcriptions: {
                        create: vi.fn().mockImplementation(async (_params: unknown, options: { signal?: AbortSignal }) => {
                            // Wait for abort signal or a very long time
                            return new Promise((_, reject) => {
                                if (options?.signal) {
                                    options.signal.addEventListener('abort', () => {
                                        const error = new Error('Aborted');
                                        error.name = 'AbortError';
                                        reject(error);
                                    });
                                }
                                // Never resolve naturally - wait for abort
                            });
                        }),
                    },
                },
            };

            // Create provider with mocked client
            const testProvider = new GroqTranscriptionProvider();
            // @ts-expect-error - accessing private property for testing
            testProvider.groqClient = mockGroqClient;
            // @ts-expect-error - reduce timeout for faster tests
            testProvider.TIMEOUT_MS = 100; // 100ms for testing

            const buffer = Buffer.from('test audio data');
            const metadata: AudioMetadata = {
                mediaId: 'test-media-id',
                mimeType: 'audio/ogg',
                fileSize: buffer.length,
            };

            const result = await testProvider.transcribe(buffer, metadata);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe('TIMEOUT');
        });

        it('should complete successfully when API responds within timeout', async () => {
            // Mock the Groq client to simulate a fast response
            const mockGroqClient = {
                audio: {
                    transcriptions: {
                        create: vi.fn().mockResolvedValue({
                            text: 'Transcribed text',
                            duration: 5,
                            language: 'pt',
                        }),
                    },
                },
            };

            // Create provider with mocked client
            const testProvider = new GroqTranscriptionProvider();
            // @ts-expect-error - accessing private property for testing
            testProvider.groqClient = mockGroqClient;

            const buffer = Buffer.from('test audio data');
            const metadata: AudioMetadata = {
                mediaId: 'test-media-id',
                mimeType: 'audio/ogg',
                fileSize: buffer.length,
            };

            const result = await testProvider.transcribe(buffer, metadata);

            expect(result.success).toBe(true);
            expect(result.text).toBe('Transcribed text');
            expect(result.error).toBeUndefined();
        });

        it('should handle timeout consistently across different audio sizes', () => {
            fc.assert(
                fc.asyncProperty(
                    validFileSizeArbitrary.filter(size => size <= 1024 * 1024), // Limit to 1MB for test performance
                    fc.uuid(),
                    fc.constantFrom('audio/ogg', 'audio/mpeg', 'audio/mp4'),
                    async (fileSize, mediaId, mimeType) => {
                        // Mock the Groq client to simulate timeout
                        const mockGroqClient = {
                            audio: {
                                transcriptions: {
                                    create: vi.fn().mockImplementation(async (_params: unknown, options: { signal?: AbortSignal }) => {
                                        return new Promise((_, reject) => {
                                            if (options?.signal) {
                                                options.signal.addEventListener('abort', () => {
                                                    const error = new Error('Aborted');
                                                    error.name = 'AbortError';
                                                    reject(error);
                                                });
                                            }
                                        });
                                    }),
                                },
                            },
                        };

                        const testProvider = new GroqTranscriptionProvider();
                        // @ts-expect-error - accessing private property for testing
                        testProvider.groqClient = mockGroqClient;
                        // @ts-expect-error - reduce timeout for faster tests
                        testProvider.TIMEOUT_MS = 50; // 50ms for testing

                        const buffer = Buffer.alloc(Math.min(fileSize, 1024)); // Use small buffer for test
                        const metadata: AudioMetadata = {
                            mediaId,
                            mimeType,
                            fileSize,
                        };

                        const result = await testProvider.transcribe(buffer, metadata);

                        // Should timeout consistently regardless of file size
                        expect(result.success).toBe(false);
                        expect(result.error?.code).toBe('TIMEOUT');
                    }
                ),
                { ...propertyConfig, numRuns: 20 } // Fewer runs for async tests
            );
        });
    });

    /**
     * **Feature: audio-messages, Property 4: Audio Response Formatting**
     * **Validates: Requirements 2.1, 2.2, 2.3**
     * 
     * *For any* successful transcription and bot response, the formatted output SHALL contain 
     * the audio indicator emoji, a quoted preview of the transcription (max 100 chars with 
     * ellipsis if truncated), and the complete bot response.
     */
    describe('Property 4: Audio Response Formatting', () => {
        // Generator for transcription text (any non-empty string)
        const transcriptionArbitrary = fc.string({ minLength: 1, maxLength: 500 })
            .filter(s => s.trim().length > 0);

        // Generator for bot response (any non-empty string)
        const botResponseArbitrary = fc.string({ minLength: 1, maxLength: 1000 })
            .filter(s => s.trim().length > 0);

        // Generator for short transcriptions (≤100 chars)
        const shortTranscriptionArbitrary = fc.string({ minLength: 1, maxLength: 100 })
            .filter(s => s.trim().length > 0);

        // Generator for long transcriptions (>100 chars)
        const longTranscriptionArbitrary = fc.string({ minLength: 101, maxLength: 500 })
            .filter(s => s.trim().length > 0);

        it('should always contain the audio indicator emoji (🎤)', () => {
            fc.assert(
                fc.property(
                    transcriptionArbitrary,
                    botResponseArbitrary,
                    (transcription, botResponse) => {
                        const result = formatAudioResponse(transcription, botResponse);

                        // Requirement 2.3: Response must contain audio indicator emoji
                        expect(result).toContain('🎤');
                    }
                ),
                propertyConfig
            );
        });

        it('should always contain the complete bot response', () => {
            fc.assert(
                fc.property(
                    transcriptionArbitrary,
                    botResponseArbitrary,
                    (transcription, botResponse) => {
                        const result = formatAudioResponse(transcription, botResponse);

                        // The complete bot response must be present in the output
                        expect(result).toContain(botResponse);
                    }
                ),
                propertyConfig
            );
        });

        it('should include transcription preview in quotes', () => {
            fc.assert(
                fc.property(
                    transcriptionArbitrary,
                    botResponseArbitrary,
                    (transcription, botResponse) => {
                        const result = formatAudioResponse(transcription, botResponse);

                        // Requirement 2.1: Response must include transcription preview
                        // The preview should be wrapped in quotes with italic formatting
                        expect(result).toContain('_"');
                        expect(result).toContain('"_');
                    }
                ),
                propertyConfig
            );
        });

        it('should not truncate transcriptions of 100 characters or less', () => {
            fc.assert(
                fc.property(
                    shortTranscriptionArbitrary,
                    botResponseArbitrary,
                    (transcription, botResponse) => {
                        const result = formatAudioResponse(transcription, botResponse);

                        // Short transcriptions should appear in full without ellipsis
                        expect(result).toContain(transcription);
                        // Should not have ellipsis after the transcription
                        expect(result).not.toContain(transcription + '...');
                    }
                ),
                propertyConfig
            );
        });

        it('should truncate transcriptions longer than 100 characters with ellipsis', () => {
            fc.assert(
                fc.property(
                    longTranscriptionArbitrary,
                    botResponseArbitrary,
                    (transcription, botResponse) => {
                        const result = formatAudioResponse(transcription, botResponse);

                        // Requirement 2.2: Long transcriptions should be truncated to 100 chars with ellipsis
                        const expectedPreview = transcription.substring(0, 100) + '...';
                        expect(result).toContain(expectedPreview);

                        // The full transcription should NOT be present
                        expect(result).not.toContain(`"${transcription}"`);
                    }
                ),
                propertyConfig
            );
        });

        it('should format response with correct structure: emoji, preview, then bot response', () => {
            fc.assert(
                fc.property(
                    transcriptionArbitrary,
                    botResponseArbitrary,
                    (transcription, botResponse) => {
                        const result = formatAudioResponse(transcription, botResponse);

                        // Check structure: 🎤 _"preview"_\n\nbotResponse
                        const emojiIndex = result.indexOf('🎤');
                        const previewStartIndex = result.indexOf('_"');
                        const previewEndIndex = result.indexOf('"_');

                        // Find the bot response after the preview section (after '"_\n\n')
                        const previewSectionEnd = result.indexOf('"_\n\n');
                        const botResponseIndex = previewSectionEnd !== -1
                            ? result.indexOf(botResponse, previewSectionEnd + 4)
                            : -1;

                        // Emoji should come first
                        expect(emojiIndex).toBe(0);

                        // Preview should come after emoji
                        expect(previewStartIndex).toBeGreaterThan(emojiIndex);

                        // Preview end should come after preview start
                        expect(previewEndIndex).toBeGreaterThan(previewStartIndex);

                        // Bot response should appear after the preview section
                        expect(botResponseIndex).toBeGreaterThanOrEqual(previewSectionEnd + 4);
                    }
                ),
                propertyConfig
            );
        });

        it('should have double newline separator between preview and bot response', () => {
            fc.assert(
                fc.property(
                    transcriptionArbitrary,
                    botResponseArbitrary,
                    (transcription, botResponse) => {
                        const result = formatAudioResponse(transcription, botResponse);

                        // There should be a double newline before the bot response
                        expect(result).toContain('"_\n\n');
                    }
                ),
                propertyConfig
            );
        });

        it('truncateWithEllipsis should preserve text at or under max length', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 0, maxLength: 100 }),
                    (text) => {
                        const result = truncateWithEllipsis(text, 100);

                        // Text at or under limit should be unchanged
                        expect(result).toBe(text);
                    }
                ),
                propertyConfig
            );
        });

        it('truncateWithEllipsis should truncate text over max length and add ellipsis', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 101, maxLength: 500 }),
                    (text) => {
                        const result = truncateWithEllipsis(text, 100);

                        // Result should be exactly 103 chars (100 + "...")
                        expect(result.length).toBe(103);

                        // Should end with ellipsis
                        expect(result).toMatch(/\.\.\.$/);

                        // Should start with first 100 chars of original
                        expect(result.substring(0, 100)).toBe(text.substring(0, 100));
                    }
                ),
                propertyConfig
            );
        });
    });

    /**
     * **Feature: audio-messages, Property 5: Audio Logging Completeness**
     * **Validates: Requirements 3.5, 6.1**
     * 
     * *For any* audio message processed (success or failure), the system SHALL log an entry 
     * containing: mediaId, fileSize, duration (if available), and error details (if failed).
     */
    describe('Property 5: Audio Logging Completeness', () => {
        // Generator for phone numbers (Brazilian format)
        const phoneNumberArbitrary = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 11, maxLength: 13 })
            .map(digits => '55' + digits.join(''));

        // Generator for valid audio metadata
        const validAudioMetadataArbitrary = fc.record({
            mediaId: fc.uuid(),
            mimeType: fc.constantFrom('audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'),
            fileSize: fc.integer({ min: 1, max: 16 * 1024 * 1024 }),
            duration: fc.option(fc.integer({ min: 1, max: 300 }), { nil: undefined }),
        });

        // Generator for transcription results (success)
        const successTranscriptionArbitrary = fc.record({
            success: fc.constant(true),
            text: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
            duration: fc.option(fc.integer({ min: 1, max: 300 }), { nil: undefined }),
            language: fc.option(fc.constantFrom('pt', 'en', 'es'), { nil: undefined }),
        });

        // Generator for transcription results (failure)
        const failureTranscriptionArbitrary = fc.record({
            success: fc.constant(false),
            error: fc.record({
                code: fc.constantFrom('DOWNLOAD_FAILED', 'SIZE_EXCEEDED', 'TRANSCRIPTION_FAILED', 'POOR_QUALITY', 'TIMEOUT'),
                message: fc.string({ minLength: 1, maxLength: 100 }),
            }),
        });

        it('should mask phone numbers correctly - showing first 8 chars followed by ****', () => {
            fc.assert(
                fc.property(
                    phoneNumberArbitrary,
                    (phoneNumber) => {
                        const masked = maskPhoneNumber(phoneNumber);

                        // Should show first 8 characters
                        expect(masked.substring(0, 8)).toBe(phoneNumber.substring(0, 8));

                        // Should end with ****
                        expect(masked).toMatch(/\*\*\*\*$/);

                        // Should be exactly 12 characters (8 + 4 asterisks)
                        expect(masked.length).toBe(12);

                        // Should not contain the full phone number
                        if (phoneNumber.length > 8) {
                            expect(masked).not.toBe(phoneNumber);
                        }
                    }
                ),
                propertyConfig
            );
        });

        it('should handle short phone numbers gracefully', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 0, maxLength: 8 }),
                    (shortPhone) => {
                        const masked = maskPhoneNumber(shortPhone);

                        // Short phone numbers should return just ****
                        expect(masked).toBe('****');
                    }
                ),
                propertyConfig
            );
        });

        it('should log mediaId for all audio processing events', () => {
            fc.assert(
                fc.asyncProperty(
                    validAudioMetadataArbitrary,
                    phoneNumberArbitrary,
                    async (audioMeta, phoneNumber) => {
                        const loggedEntries: Array<Record<string, unknown>> = [];

                        // Import and mock the logger
                        const { logger } = await import('../../src/lib/logger');
                        const originalInfo = logger.info;
                        const originalError = logger.error;
                        const originalWarn = logger.warn;
                        const originalDebug = logger.debug;

                        // Capture all log calls
                        logger.info = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.error = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.warn = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.debug = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });

                        try {
                            const service = new WhatsAppMetaService();

                            // @ts-expect-error - mocking private method for testing
                            service.downloadMedia = vi.fn().mockResolvedValue(Buffer.alloc(audioMeta.fileSize));

                            // @ts-expect-error - accessing private property for testing
                            service.transcriptionService = {
                                transcribe: vi.fn().mockResolvedValue({
                                    success: true,
                                    text: 'Test transcription',
                                    duration: audioMeta.duration,
                                    language: 'pt',
                                }),
                                validateAudio: vi.fn().mockReturnValue({ valid: true }),
                            };

                            // @ts-expect-error - accessing private property for testing
                            service.messageHandler = {
                                handleMessage: vi.fn().mockResolvedValue('Bot response'),
                            };

                            // @ts-expect-error - mocking method for testing
                            service.sendMessage = vi.fn().mockResolvedValue(undefined);
                            // @ts-expect-error - mocking private method for testing
                            service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                            const message = {
                                from: phoneNumber,
                                id: 'test-message-id',
                                timestamp: Date.now().toString(),
                                type: 'audio',
                                audio: {
                                    id: audioMeta.mediaId,
                                    mime_type: audioMeta.mimeType,
                                },
                            };

                            await service.handleAudioMessage(message);

                            // Check that at least one log entry contains the mediaId
                            const hasMediaId = loggedEntries.some(entry => entry.mediaId === audioMeta.mediaId);
                            expect(hasMediaId).toBe(true);
                        } finally {
                            // Restore original logger methods
                            logger.info = originalInfo;
                            logger.error = originalError;
                            logger.warn = originalWarn;
                            logger.debug = originalDebug;
                        }
                    }
                ),
                { ...propertyConfig, numRuns: 20 }
            );
        });

        it('should log fileSize for successful audio processing', () => {
            fc.assert(
                fc.asyncProperty(
                    validAudioMetadataArbitrary,
                    phoneNumberArbitrary,
                    async (audioMeta, phoneNumber) => {
                        const loggedEntries: Array<Record<string, unknown>> = [];

                        const { logger } = await import('../../src/lib/logger');
                        const originalInfo = logger.info;
                        const originalError = logger.error;
                        const originalWarn = logger.warn;
                        const originalDebug = logger.debug;

                        logger.info = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.error = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.warn = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.debug = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });

                        try {
                            const service = new WhatsAppMetaService();

                            // @ts-expect-error - mocking private method for testing
                            service.downloadMedia = vi.fn().mockResolvedValue(Buffer.alloc(audioMeta.fileSize));

                            // @ts-expect-error - accessing private property for testing
                            service.transcriptionService = {
                                transcribe: vi.fn().mockResolvedValue({
                                    success: true,
                                    text: 'Test transcription',
                                    duration: audioMeta.duration,
                                    language: 'pt',
                                }),
                                validateAudio: vi.fn().mockReturnValue({ valid: true }),
                            };

                            // @ts-expect-error - accessing private property for testing
                            service.messageHandler = {
                                handleMessage: vi.fn().mockResolvedValue('Bot response'),
                            };

                            // @ts-expect-error - mocking method for testing
                            service.sendMessage = vi.fn().mockResolvedValue(undefined);
                            // @ts-expect-error - mocking private method for testing
                            service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                            const message = {
                                from: phoneNumber,
                                id: 'test-message-id',
                                timestamp: Date.now().toString(),
                                type: 'audio',
                                audio: {
                                    id: audioMeta.mediaId,
                                    mime_type: audioMeta.mimeType,
                                },
                            };

                            await service.handleAudioMessage(message);

                            // Check that at least one log entry contains fileSize
                            const hasFileSize = loggedEntries.some(entry =>
                                entry.fileSize === audioMeta.fileSize ||
                                entry.fileSizeMB !== undefined
                            );
                            expect(hasFileSize).toBe(true);
                        } finally {
                            logger.info = originalInfo;
                            logger.error = originalError;
                            logger.warn = originalWarn;
                            logger.debug = originalDebug;
                        }
                    }
                ),
                { ...propertyConfig, numRuns: 20 }
            );
        });

        it('should log error details when transcription fails', () => {
            fc.assert(
                fc.asyncProperty(
                    validAudioMetadataArbitrary,
                    failureTranscriptionArbitrary,
                    phoneNumberArbitrary,
                    async (audioMeta, failureResult, phoneNumber) => {
                        const loggedEntries: Array<Record<string, unknown>> = [];

                        const { logger } = await import('../../src/lib/logger');
                        const originalInfo = logger.info;
                        const originalError = logger.error;
                        const originalWarn = logger.warn;
                        const originalDebug = logger.debug;

                        logger.info = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.error = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.warn = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.debug = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });

                        try {
                            const service = new WhatsAppMetaService();

                            // @ts-expect-error - mocking private method for testing
                            service.downloadMedia = vi.fn().mockResolvedValue(Buffer.alloc(audioMeta.fileSize));

                            // @ts-expect-error - accessing private property for testing
                            service.transcriptionService = {
                                transcribe: vi.fn().mockResolvedValue(failureResult),
                                validateAudio: vi.fn().mockReturnValue({ valid: true }),
                            };

                            // @ts-expect-error - accessing private property for testing
                            service.messageHandler = {
                                handleMessage: vi.fn().mockResolvedValue('Bot response'),
                            };

                            // @ts-expect-error - mocking method for testing
                            service.sendMessage = vi.fn().mockResolvedValue(undefined);
                            // @ts-expect-error - mocking private method for testing
                            service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                            const message = {
                                from: phoneNumber,
                                id: 'test-message-id',
                                timestamp: Date.now().toString(),
                                type: 'audio',
                                audio: {
                                    id: audioMeta.mediaId,
                                    mime_type: audioMeta.mimeType,
                                },
                            };

                            await service.handleAudioMessage(message);

                            // Check that error details are logged
                            const hasErrorDetails = loggedEntries.some(entry =>
                                entry.error === failureResult.error.code ||
                                entry.errorMessage !== undefined
                            );
                            expect(hasErrorDetails).toBe(true);
                        } finally {
                            logger.info = originalInfo;
                            logger.error = originalError;
                            logger.warn = originalWarn;
                            logger.debug = originalDebug;
                        }
                    }
                ),
                { ...propertyConfig, numRuns: 20 }
            );
        });

        it('should mask phone numbers in all log entries', () => {
            fc.assert(
                fc.asyncProperty(
                    validAudioMetadataArbitrary,
                    phoneNumberArbitrary.filter(p => p.length > 8),
                    async (audioMeta, phoneNumber) => {
                        const loggedEntries: Array<Record<string, unknown>> = [];

                        const { logger } = await import('../../src/lib/logger');
                        const originalInfo = logger.info;
                        const originalError = logger.error;
                        const originalWarn = logger.warn;
                        const originalDebug = logger.debug;

                        logger.info = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.error = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.warn = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.debug = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });

                        try {
                            const service = new WhatsAppMetaService();

                            // @ts-expect-error - mocking private method for testing
                            service.downloadMedia = vi.fn().mockResolvedValue(Buffer.alloc(audioMeta.fileSize));

                            // @ts-expect-error - accessing private property for testing
                            service.transcriptionService = {
                                transcribe: vi.fn().mockResolvedValue({
                                    success: true,
                                    text: 'Test transcription',
                                    duration: audioMeta.duration,
                                    language: 'pt',
                                }),
                                validateAudio: vi.fn().mockReturnValue({ valid: true }),
                            };

                            // @ts-expect-error - accessing private property for testing
                            service.messageHandler = {
                                handleMessage: vi.fn().mockResolvedValue('Bot response'),
                            };

                            // @ts-expect-error - mocking method for testing
                            service.sendMessage = vi.fn().mockResolvedValue(undefined);
                            // @ts-expect-error - mocking private method for testing
                            service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                            const message = {
                                from: phoneNumber,
                                id: 'test-message-id',
                                timestamp: Date.now().toString(),
                                type: 'audio',
                                audio: {
                                    id: audioMeta.mediaId,
                                    mime_type: audioMeta.mimeType,
                                },
                            };

                            await service.handleAudioMessage(message);

                            // Check that no log entry contains the full phone number
                            const entriesWithPhone = loggedEntries.filter(entry =>
                                entry.phoneNumber !== undefined ||
                                entry.from !== undefined ||
                                entry.to !== undefined
                            );

                            for (const entry of entriesWithPhone) {
                                const phoneField = entry.phoneNumber || entry.from || entry.to;
                                if (typeof phoneField === 'string') {
                                    // Phone should be masked (not equal to original)
                                    expect(phoneField).not.toBe(phoneNumber);
                                    // Should end with ****
                                    expect(phoneField).toMatch(/\*\*\*\*$/);
                                }
                            }
                        } finally {
                            logger.info = originalInfo;
                            logger.error = originalError;
                            logger.warn = originalWarn;
                            logger.debug = originalDebug;
                        }
                    }
                ),
                { ...propertyConfig, numRuns: 20 }
            );
        });

        it('should log duration when available in transcription result', () => {
            fc.assert(
                fc.asyncProperty(
                    validAudioMetadataArbitrary,
                    fc.integer({ min: 1, max: 300 }), // duration in seconds
                    phoneNumberArbitrary,
                    async (audioMeta, duration, phoneNumber) => {
                        const loggedEntries: Array<Record<string, unknown>> = [];

                        const { logger } = await import('../../src/lib/logger');
                        const originalInfo = logger.info;
                        const originalError = logger.error;
                        const originalWarn = logger.warn;
                        const originalDebug = logger.debug;

                        logger.info = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.error = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.warn = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });
                        logger.debug = vi.fn().mockImplementation((obj: unknown) => {
                            if (typeof obj === 'object' && obj !== null) {
                                loggedEntries.push(obj as Record<string, unknown>);
                            }
                        });

                        try {
                            const service = new WhatsAppMetaService();

                            // @ts-expect-error - mocking private method for testing
                            service.downloadMedia = vi.fn().mockResolvedValue(Buffer.alloc(audioMeta.fileSize));

                            // @ts-expect-error - accessing private property for testing
                            service.transcriptionService = {
                                transcribe: vi.fn().mockResolvedValue({
                                    success: true,
                                    text: 'Test transcription',
                                    duration: duration,
                                    language: 'pt',
                                }),
                                validateAudio: vi.fn().mockReturnValue({ valid: true }),
                            };

                            // @ts-expect-error - accessing private property for testing
                            service.messageHandler = {
                                handleMessage: vi.fn().mockResolvedValue('Bot response'),
                            };

                            // @ts-expect-error - mocking method for testing
                            service.sendMessage = vi.fn().mockResolvedValue(undefined);
                            // @ts-expect-error - mocking private method for testing
                            service.markMessageAsRead = vi.fn().mockResolvedValue(undefined);

                            const message = {
                                from: phoneNumber,
                                id: 'test-message-id',
                                timestamp: Date.now().toString(),
                                type: 'audio',
                                audio: {
                                    id: audioMeta.mediaId,
                                    mime_type: audioMeta.mimeType,
                                },
                            };

                            await service.handleAudioMessage(message);

                            // Check that duration is logged when available
                            const hasDuration = loggedEntries.some(entry => entry.duration === duration);
                            expect(hasDuration).toBe(true);
                        } finally {
                            logger.info = originalInfo;
                            logger.error = originalError;
                            logger.warn = originalWarn;
                            logger.debug = originalDebug;
                        }
                    }
                ),
                { ...propertyConfig, numRuns: 20 }
            );
        });
    });

    /**
     * **Feature: audio-messages, Property 6: Audio Message Storage Compliance**
     * **Validates: Requirements 6.2, 6.3**
     * 
     * *For any* transcribed audio message stored in the database, the record SHALL have 
     * messageType='audio', SHALL contain the transcription text, and SHALL NOT contain 
     * raw audio binary data.
     */
    describe('Property 6: Audio Message Storage Compliance', () => {
        // Generator for valid transcription text
        const transcriptionArbitrary = fc.string({ minLength: 1, maxLength: 500 })
            .filter(s => s.trim().length > 0);

        // Generator for phone numbers (Brazilian format)
        const phoneNumberArbitrary = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 11, maxLength: 13 })
            .map(digits => '55' + digits.join(''));

        // Generator for audio metadata
        const audioMetadataArbitrary = fc.record({
            duration: fc.option(fc.integer({ min: 1, max: 300 }), { nil: undefined }),
            fileSize: fc.option(fc.integer({ min: 1, max: 16 * 1024 * 1024 }), { nil: undefined }),
            language: fc.option(fc.constantFrom('pt', 'en', 'es'), { nil: undefined }),
        });

        it('should store audio messages with messageType="audio"', () => {
            fc.assert(
                fc.asyncProperty(
                    transcriptionArbitrary,
                    phoneNumberArbitrary,
                    audioMetadataArbitrary,
                    async (transcription, phoneNumber, metadata) => {
                        // Track what gets stored
                        let storedData: any = null;

                        // Mock prisma
                        const mockPrisma = {
                            conversation: {
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn().mockResolvedValue({ id: 'test-conv-id' }),
                            },
                            message: {
                                create: vi.fn().mockImplementation(async (args: any) => {
                                    storedData = args.data;
                                    return { id: 'test-msg-id', ...args.data };
                                }),
                            },
                            event: {
                                create: vi.fn().mockResolvedValue({}),
                            },
                        };

                        // Import and mock prisma
                        vi.doMock('../../src/lib/prisma', () => ({
                            prisma: mockPrisma,
                            DatabaseError: class extends Error { },
                            isDatabaseError: () => false,
                            getDatabaseErrorMessage: () => 'Database error',
                            logDatabaseError: vi.fn(),
                        }));

                        // Import MessageHandlerV2 after mocking
                        const { MessageHandlerV2 } = await import('../../src/services/message-handler-v2.service');
                        const handler = new MessageHandlerV2();

                        // Call storeAudioMessage
                        await handler.storeAudioMessage(phoneNumber, transcription, metadata, 'incoming');

                        // Verify messageType is 'audio' (Requirement 6.2)
                        expect(storedData).not.toBeNull();
                        expect(storedData.messageType).toBe('audio');

                        vi.doUnmock('../../src/lib/prisma');
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should include transcription in audioMetadata', () => {
            fc.assert(
                fc.asyncProperty(
                    transcriptionArbitrary,
                    phoneNumberArbitrary,
                    audioMetadataArbitrary,
                    async (transcription, phoneNumber, metadata) => {
                        let storedData: any = null;

                        const mockPrisma = {
                            conversation: {
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn().mockResolvedValue({ id: 'test-conv-id' }),
                            },
                            message: {
                                create: vi.fn().mockImplementation(async (args: any) => {
                                    storedData = args.data;
                                    return { id: 'test-msg-id', ...args.data };
                                }),
                            },
                            event: {
                                create: vi.fn().mockResolvedValue({}),
                            },
                        };

                        vi.doMock('../../src/lib/prisma', () => ({
                            prisma: mockPrisma,
                            DatabaseError: class extends Error { },
                            isDatabaseError: () => false,
                            getDatabaseErrorMessage: () => 'Database error',
                            logDatabaseError: vi.fn(),
                        }));

                        const { MessageHandlerV2 } = await import('../../src/services/message-handler-v2.service');
                        const handler = new MessageHandlerV2();

                        await handler.storeAudioMessage(phoneNumber, transcription, metadata, 'incoming');

                        // Verify audioMetadata contains transcription (Requirement 6.2)
                        expect(storedData).not.toBeNull();
                        expect(storedData.audioMetadata).toBeDefined();
                        expect(storedData.audioMetadata.transcription).toBe(transcription);

                        vi.doUnmock('../../src/lib/prisma');
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should NOT store raw audio binary data', () => {
            fc.assert(
                fc.asyncProperty(
                    transcriptionArbitrary,
                    phoneNumberArbitrary,
                    audioMetadataArbitrary,
                    async (transcription, phoneNumber, metadata) => {
                        let storedData: any = null;

                        const mockPrisma = {
                            conversation: {
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn().mockResolvedValue({ id: 'test-conv-id' }),
                            },
                            message: {
                                create: vi.fn().mockImplementation(async (args: any) => {
                                    storedData = args.data;
                                    return { id: 'test-msg-id', ...args.data };
                                }),
                            },
                            event: {
                                create: vi.fn().mockResolvedValue({}),
                            },
                        };

                        vi.doMock('../../src/lib/prisma', () => ({
                            prisma: mockPrisma,
                            DatabaseError: class extends Error { },
                            isDatabaseError: () => false,
                            getDatabaseErrorMessage: () => 'Database error',
                            logDatabaseError: vi.fn(),
                        }));

                        const { MessageHandlerV2 } = await import('../../src/services/message-handler-v2.service');
                        const handler = new MessageHandlerV2();

                        await handler.storeAudioMessage(phoneNumber, transcription, metadata, 'incoming');

                        // Verify no raw audio binary is stored (Requirement 6.3)
                        expect(storedData).not.toBeNull();

                        // Check that audioMetadata does not contain any Buffer or binary data
                        const audioMeta = storedData.audioMetadata;
                        expect(audioMeta).toBeDefined();

                        // Ensure no binary/buffer fields exist
                        expect(audioMeta.audioBuffer).toBeUndefined();
                        expect(audioMeta.rawAudio).toBeUndefined();
                        expect(audioMeta.binaryData).toBeUndefined();
                        expect(audioMeta.buffer).toBeUndefined();

                        // Verify the stored data is JSON-serializable (no Buffer objects)
                        const serialized = JSON.stringify(storedData);
                        expect(serialized).toBeDefined();
                        expect(serialized).not.toContain('Buffer');

                        vi.doUnmock('../../src/lib/prisma');
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should include transcribedAt timestamp in audioMetadata', () => {
            fc.assert(
                fc.asyncProperty(
                    transcriptionArbitrary,
                    phoneNumberArbitrary,
                    audioMetadataArbitrary,
                    async (transcription, phoneNumber, metadata) => {
                        let storedData: any = null;

                        const mockPrisma = {
                            conversation: {
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn().mockResolvedValue({ id: 'test-conv-id' }),
                            },
                            message: {
                                create: vi.fn().mockImplementation(async (args: any) => {
                                    storedData = args.data;
                                    return { id: 'test-msg-id', ...args.data };
                                }),
                            },
                            event: {
                                create: vi.fn().mockResolvedValue({}),
                            },
                        };

                        vi.doMock('../../src/lib/prisma', () => ({
                            prisma: mockPrisma,
                            DatabaseError: class extends Error { },
                            isDatabaseError: () => false,
                            getDatabaseErrorMessage: () => 'Database error',
                            logDatabaseError: vi.fn(),
                        }));

                        const { MessageHandlerV2 } = await import('../../src/services/message-handler-v2.service');
                        const handler = new MessageHandlerV2();

                        await handler.storeAudioMessage(phoneNumber, transcription, metadata, 'incoming');

                        // Verify transcribedAt timestamp exists
                        expect(storedData).not.toBeNull();
                        expect(storedData.audioMetadata).toBeDefined();
                        expect(storedData.audioMetadata.transcribedAt).toBeDefined();

                        // Verify it's a valid ISO date string
                        const date = new Date(storedData.audioMetadata.transcribedAt);
                        expect(date.toString()).not.toBe('Invalid Date');

                        vi.doUnmock('../../src/lib/prisma');
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should preserve audio metadata fields (duration, fileSize, language)', () => {
            fc.assert(
                fc.asyncProperty(
                    transcriptionArbitrary,
                    phoneNumberArbitrary,
                    fc.record({
                        duration: fc.integer({ min: 1, max: 300 }),
                        fileSize: fc.integer({ min: 1, max: 16 * 1024 * 1024 }),
                        language: fc.constantFrom('pt', 'en', 'es'),
                    }),
                    async (transcription, phoneNumber, metadata) => {
                        let storedData: any = null;

                        const mockPrisma = {
                            conversation: {
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn().mockResolvedValue({ id: 'test-conv-id' }),
                            },
                            message: {
                                create: vi.fn().mockImplementation(async (args: any) => {
                                    storedData = args.data;
                                    return { id: 'test-msg-id', ...args.data };
                                }),
                            },
                            event: {
                                create: vi.fn().mockResolvedValue({}),
                            },
                        };

                        vi.doMock('../../src/lib/prisma', () => ({
                            prisma: mockPrisma,
                            DatabaseError: class extends Error { },
                            isDatabaseError: () => false,
                            getDatabaseErrorMessage: () => 'Database error',
                            logDatabaseError: vi.fn(),
                        }));

                        const { MessageHandlerV2 } = await import('../../src/services/message-handler-v2.service');
                        const handler = new MessageHandlerV2();

                        await handler.storeAudioMessage(phoneNumber, transcription, metadata, 'incoming');

                        // Verify metadata fields are preserved
                        expect(storedData).not.toBeNull();
                        expect(storedData.audioMetadata).toBeDefined();
                        expect(storedData.audioMetadata.duration).toBe(metadata.duration);
                        expect(storedData.audioMetadata.fileSize).toBe(metadata.fileSize);
                        expect(storedData.audioMetadata.language).toBe(metadata.language);

                        vi.doUnmock('../../src/lib/prisma');
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });

        it('should store content field with transcription text', () => {
            fc.assert(
                fc.asyncProperty(
                    transcriptionArbitrary,
                    phoneNumberArbitrary,
                    audioMetadataArbitrary,
                    async (transcription, phoneNumber, metadata) => {
                        let storedData: any = null;

                        const mockPrisma = {
                            conversation: {
                                findFirst: vi.fn().mockResolvedValue(null),
                                create: vi.fn().mockResolvedValue({ id: 'test-conv-id' }),
                            },
                            message: {
                                create: vi.fn().mockImplementation(async (args: any) => {
                                    storedData = args.data;
                                    return { id: 'test-msg-id', ...args.data };
                                }),
                            },
                            event: {
                                create: vi.fn().mockResolvedValue({}),
                            },
                        };

                        vi.doMock('../../src/lib/prisma', () => ({
                            prisma: mockPrisma,
                            DatabaseError: class extends Error { },
                            isDatabaseError: () => false,
                            getDatabaseErrorMessage: () => 'Database error',
                            logDatabaseError: vi.fn(),
                        }));

                        const { MessageHandlerV2 } = await import('../../src/services/message-handler-v2.service');
                        const handler = new MessageHandlerV2();

                        await handler.storeAudioMessage(phoneNumber, transcription, metadata, 'incoming');

                        // Verify content field contains transcription
                        expect(storedData).not.toBeNull();
                        expect(storedData.content).toBe(transcription);

                        vi.doUnmock('../../src/lib/prisma');
                    }
                ),
                { ...propertyConfig, numRuns: 50 }
            );
        });
    });
});

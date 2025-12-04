/**
 * GroqTranscriptionProvider
 * 
 * Concrete implementation of TranscriptionService using Groq Whisper API.
 * Uses whisper-large-v3-turbo model for optimal speed and accuracy.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import Groq from 'groq-sdk';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
    TranscriptionService,
    TranscriptionResult,
    AudioMetadata,
    AudioValidationResult,
} from './transcription.service';

export class GroqTranscriptionProvider implements TranscriptionService {
    private readonly MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB
    private readonly TIMEOUT_MS = 30000; // 30 seconds
    private readonly MODEL = 'whisper-large-v3-turbo';
    private readonly groqClient: Groq;

    constructor() {
        // Validate GROQ_API_KEY on initialization (Requirement 4.2)
        if (!env.GROQ_API_KEY || env.GROQ_API_KEY === 'gsk-mock-key-for-development') {
            logger.warn('GROQ_API_KEY not configured or using mock key - transcription will fail');
        }

        this.groqClient = new Groq({
            apiKey: env.GROQ_API_KEY || 'mock-key',
        });
    }

    /**
     * Validate audio file before transcription
     * Checks file size against 16MB limit
     * 
     * @param buffer - The audio file as a Buffer
     * @param metadata - Metadata about the audio file
     * @returns Validation result indicating if audio can be processed
     */
    validateAudio(buffer: Buffer, metadata: AudioMetadata): AudioValidationResult {
        const fileSize = metadata.fileSize ?? buffer.length;

        if (fileSize > this.MAX_FILE_SIZE) {
            return {
                valid: false,
                error: {
                    code: 'SIZE_EXCEEDED',
                    message: `Audio file size (${Math.round(fileSize / 1024 / 1024)}MB) exceeds maximum allowed size of 16MB`,
                },
            };
        }

        return { valid: true };
    }


    /**
     * Transcribe audio buffer to text using Groq Whisper API
     * 
     * @param audioBuffer - The audio file as a Buffer
     * @param metadata - Metadata about the audio file
     * @returns TranscriptionResult with text or error
     */
    async transcribe(audioBuffer: Buffer, metadata: AudioMetadata): Promise<TranscriptionResult> {
        // First validate the audio
        const validation = this.validateAudio(audioBuffer, metadata);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
            };
        }

        // Check if API key is configured
        if (!env.GROQ_API_KEY || env.GROQ_API_KEY === 'gsk-mock-key-for-development') {
            logger.error({ mediaId: metadata.mediaId }, 'GROQ_API_KEY not configured');
            return {
                success: false,
                error: {
                    code: 'TRANSCRIPTION_FAILED',
                    message: 'Transcription service not configured',
                },
            };
        }

        try {
            // Create a File-like object from the buffer for the Groq API
            const audioFile = new File(
                [audioBuffer],
                `audio.${this.getExtensionFromMimeType(metadata.mimeType)}`,
                { type: metadata.mimeType }
            );

            // Create abort controller for timeout handling (Requirement 1.4)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

            try {
                // Call Groq Whisper API with whisper-large-v3-turbo model (Requirement 4.3)
                const transcription = await this.groqClient.audio.transcriptions.create(
                    {
                        file: audioFile,
                        model: this.MODEL,
                        response_format: 'verbose_json',
                    },
                    {
                        signal: controller.signal,
                    }
                );

                clearTimeout(timeoutId);

                // Check for empty or low-quality transcription
                if (!transcription.text || transcription.text.trim().length === 0) {
                    return {
                        success: false,
                        error: {
                            code: 'POOR_QUALITY',
                            message: 'Could not extract text from audio - audio may be too quiet or unclear',
                        },
                    };
                }

                logger.info({
                    mediaId: metadata.mediaId,
                    duration: transcription.duration,
                    language: transcription.language,
                    textLength: transcription.text.length,
                }, 'Audio transcription successful');

                return {
                    success: true,
                    text: transcription.text,
                    duration: transcription.duration,
                    language: transcription.language,
                };
            } catch (error: unknown) {
                clearTimeout(timeoutId);

                // Handle timeout specifically
                if (error instanceof Error && error.name === 'AbortError') {
                    logger.error({ mediaId: metadata.mediaId }, 'Transcription timeout after 30 seconds');
                    return {
                        success: false,
                        error: {
                            code: 'TIMEOUT',
                            message: 'Transcription timed out after 30 seconds',
                        },
                    };
                }

                throw error;
            }
        } catch (error: unknown) {
            // Log the failure (Requirement 4.4)
            logger.error({
                mediaId: metadata.mediaId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            }, 'Groq transcription failed');

            return {
                success: false,
                error: {
                    code: 'TRANSCRIPTION_FAILED',
                    message: error instanceof Error ? error.message : 'Unknown transcription error',
                },
            };
        }
    }

    /**
     * Get file extension from MIME type
     */
    private getExtensionFromMimeType(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'audio/ogg': 'ogg',
            'audio/mpeg': 'mp3',
            'audio/mp4': 'm4a',
            'audio/wav': 'wav',
            'audio/webm': 'webm',
            'audio/opus': 'opus',
        };
        return mimeToExt[mimeType] || 'ogg';
    }
}

/**
 * TranscriptionService Interface and Types
 * 
 * Defines the contract for audio transcription providers.
 * Allows easy swapping of transcription backends (e.g., Groq Whisper, OpenAI, etc.)
 * 
 * Requirements: 5.1, 5.2
 */

/**
 * Error codes for transcription failures
 */
export type TranscriptionErrorCode =
    | 'DOWNLOAD_FAILED'
    | 'SIZE_EXCEEDED'
    | 'TRANSCRIPTION_FAILED'
    | 'POOR_QUALITY'
    | 'TIMEOUT';

/**
 * Structured error information for transcription failures
 */
export interface TranscriptionError {
    code: TranscriptionErrorCode;
    message: string;
}

/**
 * Result of a transcription operation
 */
export interface TranscriptionResult {
    success: boolean;
    text?: string;
    duration?: number;
    language?: string;
    error?: TranscriptionError;
}

/**
 * Metadata about the audio file being processed
 */
export interface AudioMetadata {
    mediaId: string;
    mimeType: string;
    fileSize?: number;
    duration?: number;
}

/**
 * Validation result for audio files
 */
export interface AudioValidationResult {
    valid: boolean;
    error?: TranscriptionError;
}

/**
 * Interface for transcription service providers
 * 
 * Implementations must provide:
 * - transcribe: Convert audio buffer to text
 * - validateAudio: Check if audio meets requirements before processing
 */
export interface TranscriptionService {
    /**
     * Transcribe audio buffer to text
     * @param audioBuffer - The audio file as a Buffer
     * @param metadata - Metadata about the audio file
     * @returns TranscriptionResult with text or error
     */
    transcribe(audioBuffer: Buffer, metadata: AudioMetadata): Promise<TranscriptionResult>;

    /**
     * Validate audio file before transcription
     * @param buffer - The audio file as a Buffer
     * @param metadata - Metadata about the audio file
     * @returns Validation result indicating if audio can be processed
     */
    validateAudio(buffer: Buffer, metadata: AudioMetadata): AudioValidationResult;
}

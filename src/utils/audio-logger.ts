/**
 * Audio Logger Utility
 * 
 * Provides comprehensive logging for audio message processing
 * with phone number masking for privacy compliance.
 * 
 * Requirements: 3.5, 6.1
 */

import { logger } from '../lib/logger';
import type { AudioMetadata, TranscriptionError } from '../services/transcription.service';

/**
 * Mask phone number for privacy in logs
 * Shows first 8 characters followed by ****
 * 
 * @param phoneNumber - The phone number to mask
 * @returns Masked phone number
 */
export function maskPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber || phoneNumber.length <= 8) {
        return '****';
    }
    return phoneNumber.substring(0, 8) + '****';
}

/**
 * Audio log entry structure for consistent logging
 */
export interface AudioLogEntry {
    mediaId: string;
    fileSize?: number;
    duration?: number;
    mimeType?: string;
    phoneNumber?: string;
    error?: {
        code: string;
        message: string;
    };
    transcriptionLength?: number;
    language?: string;
}

/**
 * Create a sanitized log entry with masked phone number
 * 
 * @param entry - The log entry data
 * @returns Sanitized log entry with masked phone
 */
function createLogEntry(entry: AudioLogEntry): Record<string, unknown> {
    const logEntry: Record<string, unknown> = {
        mediaId: entry.mediaId,
    };

    // Always include fileSize if available (Requirement 6.1)
    if (entry.fileSize !== undefined) {
        logEntry.fileSize = entry.fileSize;
        logEntry.fileSizeMB = (entry.fileSize / (1024 * 1024)).toFixed(2);
    }

    // Always include duration if available (Requirement 6.1)
    if (entry.duration !== undefined) {
        logEntry.duration = entry.duration;
    }

    if (entry.mimeType) {
        logEntry.mimeType = entry.mimeType;
    }

    // Mask phone number for privacy (Requirement 3.5)
    if (entry.phoneNumber) {
        logEntry.phoneNumber = maskPhoneNumber(entry.phoneNumber);
    }

    if (entry.error) {
        logEntry.error = entry.error.code;
        logEntry.errorMessage = entry.error.message;
    }

    if (entry.transcriptionLength !== undefined) {
        logEntry.transcriptionLength = entry.transcriptionLength;
    }

    if (entry.language) {
        logEntry.language = entry.language;
    }

    return logEntry;
}

/**
 * Log audio message received
 * 
 * Requirements: 6.1 - Log message metadata including duration and file size
 * 
 * @param entry - Audio log entry data
 */
export function logAudioReceived(entry: AudioLogEntry): void {
    logger.info(createLogEntry(entry), '🎤 Audio message received');
}

/**
 * Log audio download completed
 * 
 * @param entry - Audio log entry data
 */
export function logAudioDownloaded(entry: AudioLogEntry): void {
    logger.info(createLogEntry(entry), '📥 Audio downloaded');
}

/**
 * Log audio validation result
 * 
 * @param entry - Audio log entry data
 * @param valid - Whether validation passed
 */
export function logAudioValidation(entry: AudioLogEntry, valid: boolean): void {
    if (valid) {
        logger.debug(createLogEntry(entry), '✅ Audio validation passed');
    } else {
        logger.warn(createLogEntry(entry), '⚠️ Audio validation failed');
    }
}

/**
 * Log audio transcription success
 * 
 * @param entry - Audio log entry data
 */
export function logTranscriptionSuccess(entry: AudioLogEntry): void {
    logger.info(createLogEntry(entry), '✅ Audio transcribed successfully');
}

/**
 * Log audio transcription failure
 * 
 * Requirements: 3.5 - Log errors with full context
 * 
 * @param entry - Audio log entry data
 * @param stack - Optional error stack trace
 */
export function logTranscriptionError(entry: AudioLogEntry, stack?: string): void {
    const logEntry = createLogEntry(entry);
    if (stack) {
        logEntry.stack = stack;
    }
    logger.error(logEntry, '❌ Audio transcription failed');
}

/**
 * Log audio download failure
 * 
 * Requirements: 3.5 - Log errors with full context
 * 
 * @param entry - Audio log entry data
 * @param stack - Optional error stack trace
 */
export function logDownloadError(entry: AudioLogEntry, stack?: string): void {
    const logEntry = createLogEntry(entry);
    if (stack) {
        logEntry.stack = stack;
    }
    logger.error(logEntry, '❌ Failed to download audio');
}

/**
 * Log audio processing error (generic)
 * 
 * Requirements: 3.5 - Log errors with full context
 * 
 * @param entry - Audio log entry data
 * @param stack - Optional error stack trace
 */
export function logAudioProcessingError(entry: AudioLogEntry, stack?: string): void {
    const logEntry = createLogEntry(entry);
    if (stack) {
        logEntry.stack = stack;
    }
    logger.error(logEntry, '❌ Error handling audio message');
}

/**
 * Log audio response sent
 * 
 * @param phoneNumber - Recipient phone number
 * @param responseLength - Length of the response
 */
export function logAudioResponseSent(phoneNumber: string, responseLength: number): void {
    logger.info({
        to: maskPhoneNumber(phoneNumber),
        length: responseLength,
    }, '✅ Audio response sent successfully');
}

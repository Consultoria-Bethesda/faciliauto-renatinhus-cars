/**
 * Audio Error Messages Configuration
 * 
 * User-friendly error messages for audio processing errors.
 * Messages are in Portuguese (Brazilian) for the target audience.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { TranscriptionErrorCode } from '../services/transcription.service';

/**
 * Error message constants for each audio processing error code
 * 
 * Requirements:
 * - 3.1: DOWNLOAD_FAILED - friendly error asking to try again
 * - 3.2: SIZE_EXCEEDED - message explaining size limitation
 * - 3.3: TRANSCRIPTION_FAILED - suggest sending text instead
 * - 3.4: POOR_QUALITY - suggest recording in quieter environment
 */
export const AUDIO_ERROR_MESSAGES: Record<TranscriptionErrorCode | 'DEFAULT', string> = {
    DOWNLOAD_FAILED: 'Desculpe, não consegui baixar seu áudio. Pode tentar enviar novamente? 🔄',
    SIZE_EXCEEDED: 'O áudio é muito longo! Por favor, envie um áudio de até 2 minutos ou digite sua mensagem. ⏱️',
    TRANSCRIPTION_FAILED: 'Não consegui entender o áudio. Pode digitar sua mensagem? ✍️',
    POOR_QUALITY: 'O áudio está com qualidade baixa. Pode gravar novamente em um ambiente mais silencioso? 🔇',
    TIMEOUT: 'O processamento demorou muito. Pode tentar novamente ou digitar sua mensagem? ⏳',
    DEFAULT: 'Desculpe, não consegui processar seu áudio. Pode digitar sua mensagem? ✍️',
};

/**
 * Get user-friendly error message for audio processing errors
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 * 
 * @param errorCode - The error code from transcription or validation
 * @returns User-friendly error message in Portuguese
 */
export function getAudioErrorMessage(errorCode: string | undefined): string {
    if (!errorCode) {
        return AUDIO_ERROR_MESSAGES.DEFAULT;
    }

    const message = AUDIO_ERROR_MESSAGES[errorCode as TranscriptionErrorCode];
    return message || AUDIO_ERROR_MESSAGES.DEFAULT;
}

/**
 * Check if an error code is a known audio error
 * 
 * @param errorCode - The error code to check
 * @returns true if the error code is a known audio error
 */
export function isKnownAudioError(errorCode: string | undefined): boolean {
    if (!errorCode) return false;
    return errorCode in AUDIO_ERROR_MESSAGES && errorCode !== 'DEFAULT';
}

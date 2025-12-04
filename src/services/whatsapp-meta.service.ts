import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import { MessageHandlerV2 } from './message-handler-v2.service';
import { TranscriptionError, AudioValidationResult, AudioMetadata, TranscriptionService } from './transcription.service';
import { GroqTranscriptionProvider } from './groq-transcription.provider';
import { formatAudioResponse } from './message-formatter.service';
import { getAudioErrorMessage } from '../config/audio-error-messages';
import {
  logAudioReceived,
  logAudioDownloaded,
  logAudioValidation,
  logTranscriptionSuccess,
  logTranscriptionError,
  logDownloadError,
  logAudioProcessingError,
  logAudioResponseSent,
  maskPhoneNumber,
} from '../utils/audio-logger';

// Constants for retry logic
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Audio validation constants
const MAX_AUDIO_FILE_SIZE = 16 * 1024 * 1024; // 16MB

interface MetaWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: {
    body: string;
  };
  audio?: {
    id: string;
    mime_type: string;
  };
  type: string;
}

interface MetaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: MetaWebhookMessage[];
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
      }>;
    };
    field: string;
  }>;
}

export class WhatsAppMetaService {
  private messageHandler: MessageHandlerV2;
  private transcriptionService: TranscriptionService;
  private apiUrl: string;
  private phoneNumberId: string;
  private accessToken: string;
  private appSecret: string;

  constructor() {
    this.messageHandler = new MessageHandlerV2();
    this.transcriptionService = new GroqTranscriptionProvider();
    this.phoneNumberId = env.META_WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = env.META_WHATSAPP_TOKEN || '';
    this.appSecret = env.META_APP_SECRET || '';
    this.apiUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;

    if (!this.phoneNumberId || !this.accessToken) {
      logger.warn('⚠️  Meta Cloud API credentials not configured. Set META_WHATSAPP_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID');
    } else {
      logger.info('✅ Meta Cloud API WhatsApp ready', {
        phoneNumberId: this.phoneNumberId.substring(0, 10) + '...',
      });
    }

    if (!this.appSecret) {
      logger.warn('⚠️  META_APP_SECRET not configured. Webhook signature validation will be skipped.');
    }
  }

  /**
   * Validate webhook signature using HMAC-SHA256
   * @param signature - The X-Hub-Signature-256 header value
   * @param payload - The raw request body as string
   * @returns true if signature is valid, false otherwise
   */
  validateWebhookSignature(signature: string | undefined, payload: string): boolean {
    // If no app secret configured, skip validation (development mode)
    if (!this.appSecret) {
      logger.warn('⚠️  Skipping signature validation - META_APP_SECRET not configured');
      return true;
    }

    // Signature is required in production
    if (!signature) {
      logger.warn('❌ Missing X-Hub-Signature-256 header');
      return false;
    }

    // Signature format: sha256=<hash>
    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      logger.warn('❌ Invalid signature format', { signature: signature.substring(0, 20) });
      return false;
    }

    const receivedHash = signatureParts[1];

    // Calculate expected hash
    const expectedHash = crypto
      .createHmac('sha256', this.appSecret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(receivedHash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );

      if (!isValid) {
        logger.warn('❌ Webhook signature validation failed', {
          received: receivedHash.substring(0, 10) + '...',
          expected: expectedHash.substring(0, 10) + '...',
        });
      } else {
        logger.debug('✅ Webhook signature validated');
      }

      return isValid;
    } catch (error) {
      // Handle case where hash lengths don't match
      logger.warn('❌ Webhook signature validation error - hash length mismatch');
      return false;
    }
  }

  /**
   * Verify webhook (called by Meta)
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = env.META_WEBHOOK_VERIFY_TOKEN || 'faciliauto_webhook_2025';

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('✅ Webhook verified successfully');
      return challenge;
    }

    logger.warn('❌ Webhook verification failed', { mode, token });
    return null;
  }

  /**
   * Process incoming webhook from Meta
   */
  async processWebhook(body: { entry: MetaWebhookEntry[] }): Promise<void> {
    try {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          // Process incoming messages
          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              await this.handleIncomingMessage(message);
            }
          }

          // Process status updates (optional)
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              this.handleStatusUpdate(status);
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error processing webhook');
      throw error;
    }
  }

  /**
   * Handle incoming message
   * Routes text messages to text handler and audio messages to audio handler
   * 
   * Requirements: 1.1
   */
  private async handleIncomingMessage(message: MetaWebhookMessage): Promise<void> {
    try {
      // Route audio messages to audio handler (Requirement 1.1)
      if (message.type === 'audio' && message.audio) {
        logger.debug('Routing to audio handler', { type: message.type, mediaId: message.audio.id });
        await this.handleAudioMessage(message);
        return;
      }

      // Only process text messages - ignore other types
      if (message.type !== 'text' || !message.text) {
        logger.debug('Ignoring unsupported message type', { type: message.type });
        return;
      }

      const phoneNumber = message.from;
      const messageText = message.text.body;

      console.log('📱 RECEIVED FROM:', phoneNumber);
      console.log('💬 TEXT:', messageText);

      logger.info('📱 Message received', {
        from: phoneNumber,
        text: messageText.substring(0, 50),
      });

      // Mark message as read
      await this.markMessageAsRead(message.id);

      // Process with our bot
      logger.info('🤖 Processing with bot...');
      const response = await this.messageHandler.handleMessage(phoneNumber, messageText);

      logger.info('📤 Sending response...', {
        to: phoneNumber,
        responseLength: response.length,
        responsePreview: response.substring(0, 100),
      });

      // Send response back
      await this.sendMessage(phoneNumber, response);

      logger.info('✅ Response sent successfully', {
        to: phoneNumber,
        length: response.length,
      });
    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
        message
      }, '❌ Error handling incoming message');
      throw error;
    }
  }

  /**
   * Handle status updates (delivered, read, etc)
   */
  private handleStatusUpdate(status: any): void {
    logger.debug('📊 Status update', {
      messageId: status.id,
      status: status.status,
    });
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is retryable (network errors, rate limits, server errors)
   */
  private isRetryableError(error: any): boolean {
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }

    // HTTP status codes that are retryable
    const status = error.response?.status;
    if (status) {
      // 429 = Rate limited, 500-599 = Server errors
      return status === 429 || (status >= 500 && status < 600);
    }

    return false;
  }

  /**
   * Send text message with retry and exponential backoff
   * Retries up to MAX_RETRIES times with exponential backoff
   */
  async sendMessage(to: string, text: string): Promise<void> {
    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          logger.info(`🔄 Retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs}ms`, { to });
          await this.sleep(backoffMs);
        }

        console.log('🔄 SENDING TO:', to);
        console.log('📝 MESSAGE:', text.substring(0, 150));
        console.log('🌐 API URL:', this.apiUrl);

        logger.info('🔄 Calling Meta API...', {
          to: to,
          toLength: to.length,
          toPreview: to.substring(0, 20),
          apiUrl: this.apiUrl,
          textLength: text.length,
          textPreview: text.substring(0, 100),
          attempt: attempt + 1,
        });

        const response = await axios.post(
          this.apiUrl,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: {
              preview_url: false,
              body: text,
            },
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 seconds timeout
          }
        );

        logger.info('✅ Message sent via Meta API', {
          messageId: response.data.messages?.[0]?.id,
          to: to,
          attempts: attempt + 1,
        });

        return; // Success - exit the retry loop
      } catch (error: any) {
        lastError = error;

        logger.warn({
          error: error.response?.data || error.message,
          status: error.response?.status,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          to,
        }, `⚠️ Message send attempt ${attempt + 1} failed`);

        // Don't retry if it's not a retryable error
        if (!this.isRetryableError(error)) {
          logger.error({
            error: error.response?.data || error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            to,
            apiUrl: this.apiUrl,
            hasToken: !!this.accessToken,
            tokenPrefix: this.accessToken?.substring(0, 10),
          }, '❌ Failed to send message via Meta API (non-retryable)');
          throw error;
        }
      }
    }

    // All retries exhausted
    logger.error({
      error: lastError?.response?.data || lastError?.message,
      status: lastError?.response?.status,
      to,
      attempts: MAX_RETRIES + 1,
    }, '❌ Failed to send message after all retries');
    throw lastError;
  }

  /**
   * Send message with buttons (interactive)
   */
  async sendButtonMessage(to: string, bodyText: string, buttons: Array<{ id: string; title: string }>): Promise<void> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: bodyText,
            },
            action: {
              buttons: buttons.map((btn, idx) => ({
                type: 'reply',
                reply: {
                  id: btn.id,
                  title: btn.title.substring(0, 20), // Max 20 chars
                },
              })),
            },
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.debug('✅ Button message sent', {
        messageId: response.data.messages?.[0]?.id,
      });
    } catch (error: any) {
      logger.error({
        error: error.response?.data || error.message,
      }, '❌ Failed to send button message');
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  private async markMessageAsRead(messageId: string): Promise<void> {
    try {
      await axios.post(
        this.apiUrl,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      // Non-critical, just log
      logger.debug({ error, messageId }, 'Failed to mark message as read');
    }
  }

  /**
   * Send template message (requires pre-approved templates)
   */
  async sendTemplate(to: string, templateName: string, languageCode: string = 'pt_BR', components?: any[]): Promise<void> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: languageCode,
            },
            components: components || [],
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('✅ Template sent', {
        messageId: response.data.messages?.[0]?.id,
        template: templateName,
      });
    } catch (error: any) {
      logger.error({
        error: error.response?.data || error.message,
        template: templateName,
      }, '❌ Failed to send template');
      throw error;
    }
  }

  /**
   * Get Media URL (for images, videos, documents)
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      return response.data.url;
    } catch (error: any) {
      logger.error({
        error: error.response?.data || error.message,
        mediaId,
      }, '❌ Failed to get media URL');
      throw error;
    }
  }

  /**
   * Download media file from WhatsApp
   * Uses getMediaUrl to get the temporary URL, then downloads the file
   * 
   * Requirements: 1.1, 3.1
   * 
   * @param mediaId - The media ID from the webhook message
   * @returns Buffer containing the downloaded media file
   * @throws Error with DOWNLOAD_FAILED code if download fails
   */
  async downloadMedia(mediaId: string): Promise<Buffer> {
    try {
      // Get the temporary media URL from Meta API
      const mediaUrl = await this.getMediaUrl(mediaId);

      logger.debug('📥 Downloading media', {
        mediaId,
        urlPreview: mediaUrl.substring(0, 50) + '...',
      });

      // Download the actual media file with proper authorization
      const response = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout for download
      });

      const buffer = Buffer.from(response.data);

      logger.info('✅ Media downloaded successfully', {
        mediaId,
        fileSize: buffer.length,
      });

      return buffer;
    } catch (error: any) {
      logger.error({
        error: error.response?.data || error.message,
        status: error.response?.status,
        mediaId,
      }, '❌ Failed to download media');

      // Create a structured error for the caller
      const downloadError = new Error('Failed to download audio file') as Error & { code: string };
      downloadError.code = 'DOWNLOAD_FAILED';
      throw downloadError;
    }
  }

  /**
   * Validate audio file before transcription
   * Checks file size against the 16MB limit
   * 
   * Requirements: 1.2, 3.2
   * 
   * @param buffer - The audio file as a Buffer
   * @returns AudioValidationResult indicating if audio can be processed
   */
  validateAudio(buffer: Buffer): AudioValidationResult {
    const fileSize = buffer.length;

    // Check file size limit (16MB)
    if (fileSize > MAX_AUDIO_FILE_SIZE) {
      logger.warn('⚠️ Audio file exceeds size limit', {
        fileSize,
        maxSize: MAX_AUDIO_FILE_SIZE,
        fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
      });

      return {
        valid: false,
        error: {
          code: 'SIZE_EXCEEDED',
          message: `Audio file size (${(fileSize / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum allowed size of 16MB`,
        },
      };
    }

    logger.debug('✅ Audio validation passed', {
      fileSize,
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
    });

    return { valid: true };
  }



  /**
   * Handle incoming audio message
   * Downloads, validates, transcribes, and forwards to message handler
   * 
   * Requirements: 1.1, 1.3, 1.5, 3.5, 6.1
   * 
   * @param message - The webhook message containing audio data
   */
  async handleAudioMessage(message: MetaWebhookMessage): Promise<void> {
    const phoneNumber = message.from;
    const audioData = message.audio;

    if (!audioData) {
      logger.error({ messageId: message.id }, 'Audio message missing audio data');
      await this.sendMessage(phoneNumber, getAudioErrorMessage('DOWNLOAD_FAILED'));
      return;
    }

    const mediaId = audioData.id;
    const mimeType = audioData.mime_type;

    // Log audio metadata on receive (Requirement 6.1)
    logAudioReceived({
      mediaId,
      mimeType,
      phoneNumber,
    });

    // Mark message as read
    await this.markMessageAsRead(message.id);

    try {
      // Step 1: Download audio from WhatsApp (Requirement 1.1)
      let audioBuffer: Buffer;
      try {
        audioBuffer = await this.downloadMedia(mediaId);
      } catch (error: any) {
        // Log download error with full context (Requirement 3.5)
        logDownloadError({
          mediaId,
          phoneNumber,
          error: { code: 'DOWNLOAD_FAILED', message: error.message },
        }, error.stack);
        await this.sendMessage(phoneNumber, getAudioErrorMessage('DOWNLOAD_FAILED'));
        return;
      }

      // Log file size after download (Requirement 6.1)
      logAudioDownloaded({
        mediaId,
        fileSize: audioBuffer.length,
        phoneNumber,
      });

      // Step 2: Validate audio file (Requirement 1.2)
      const validation = this.validateAudio(audioBuffer);

      // Log validation result
      logAudioValidation({
        mediaId,
        fileSize: audioBuffer.length,
        phoneNumber,
        error: validation.error ? { code: validation.error.code, message: validation.error.message } : undefined,
      }, validation.valid);

      if (!validation.valid) {
        await this.sendMessage(phoneNumber, getAudioErrorMessage(validation.error?.code));
        return;
      }

      // Step 3: Transcribe audio (Requirement 1.3)
      const metadata: AudioMetadata = {
        mediaId,
        mimeType,
        fileSize: audioBuffer.length,
      };

      const transcriptionResult = await this.transcriptionService.transcribe(audioBuffer, metadata);

      if (!transcriptionResult.success || !transcriptionResult.text) {
        // Log transcription error with full context (Requirement 3.5)
        logTranscriptionError({
          mediaId,
          fileSize: audioBuffer.length,
          duration: transcriptionResult.duration,
          phoneNumber,
          error: transcriptionResult.error
            ? { code: transcriptionResult.error.code, message: transcriptionResult.error.message }
            : { code: 'TRANSCRIPTION_FAILED', message: 'Unknown error' },
        });
        await this.sendMessage(phoneNumber, getAudioErrorMessage(transcriptionResult.error?.code));
        return;
      }

      const transcribedText = transcriptionResult.text;

      // Log successful transcription with all metadata (Requirement 6.1)
      logTranscriptionSuccess({
        mediaId,
        fileSize: audioBuffer.length,
        duration: transcriptionResult.duration,
        language: transcriptionResult.language,
        phoneNumber,
        transcriptionLength: transcribedText.length,
      });

      // Step 4: Store audio message in database (Requirements 6.2, 6.3)
      // Store with messageType='audio' and transcription in audioMetadata
      // No raw audio binary is stored (Requirement 6.3)
      const storedMessage = await this.messageHandler.storeAudioMessage(
        phoneNumber,
        transcribedText,
        {
          duration: transcriptionResult.duration,
          fileSize: audioBuffer.length,
          language: transcriptionResult.language,
        },
        'incoming'
      );

      // Step 5: Forward transcribed text to MessageHandler (Requirement 1.5)
      logger.info('🤖 Processing transcribed text with bot...', {
        from: maskPhoneNumber(phoneNumber),
        textPreview: transcribedText.substring(0, 50),
        storedMessageId: storedMessage.id,
      });

      const response = await this.messageHandler.handleMessage(phoneNumber, transcribedText);

      // Format response with audio acknowledgment (Requirements 2.1, 2.2, 2.3)
      const formattedResponse = this.formatAudioResponse(transcribedText, response);

      logger.info('📤 Sending audio response...', {
        to: maskPhoneNumber(phoneNumber),
        responseLength: formattedResponse.length,
      });

      // Send response back
      await this.sendMessage(phoneNumber, formattedResponse);

      // Store outgoing response in database
      await this.messageHandler.storeOutgoingMessage(
        storedMessage.conversationId,
        formattedResponse,
        'text'
      );

      // Log successful response (Requirement 6.1)
      logAudioResponseSent(phoneNumber, formattedResponse.length);

    } catch (error: any) {
      // Log processing error with full context (Requirement 3.5)
      logAudioProcessingError({
        mediaId,
        phoneNumber,
        error: { code: 'TRANSCRIPTION_FAILED', message: error.message },
      }, error.stack);

      // Send generic error message to user
      await this.sendMessage(phoneNumber, getAudioErrorMessage('TRANSCRIPTION_FAILED'));
    }
  }

  /**
   * Format response for audio messages with transcription preview
   * 
   * Requirements: 2.1, 2.2, 2.3
   * 
   * @param transcription - The transcribed text from the audio
   * @param botResponse - The bot's response to the transcribed text
   * @returns Formatted response with audio indicator and preview
   */
  formatAudioResponse(transcription: string, botResponse: string): string {
    // Delegate to shared formatter function
    return formatAudioResponse(transcription, botResponse);
  }
}

export default WhatsAppMetaService;

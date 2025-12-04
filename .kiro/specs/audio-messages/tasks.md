# Implementation Plan

- [x] 1. Create TranscriptionService interface and types





  - Create `src/services/transcription.service.ts` with interface definitions
  - Define `TranscriptionResult`, `TranscriptionError`, `AudioMetadata` types
  - Export interface for provider implementations
  - _Requirements: 5.1, 5.2_

- [x] 2. Implement GroqTranscriptionProvider





  - [x] 2.1 Create Groq transcription provider class


    - Create `src/services/groq-transcription.provider.ts`
    - Implement `TranscriptionService` interface
    - Configure whisper-large-v3-turbo model
    - Add 30-second timeout handling
    - Validate GROQ_API_KEY on initialization
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 2.2 Write property test for file size validation


    - **Property 2: File Size Validation**
    - **Validates: Requirements 1.2**
  - [x] 2.3 Write property test for transcription timeout


    - **Property 3: Transcription Timeout Enforcement**
    - **Validates: Requirements 1.4**

- [x] 3. Implement audio download in WhatsAppMetaService






  - [x] 3.1 Add downloadMedia method

    - Implement `downloadMedia(mediaId: string): Promise<Buffer>`
    - Use existing `getMediaUrl` method to get URL
    - Download audio file with proper headers
    - Handle download errors gracefully
    - _Requirements: 1.1, 3.1_
  - [x] 3.2 Add validateAudio method


    - Validate file size (max 16MB)
    - Return appropriate error codes
    - _Requirements: 1.2, 3.2_

- [x] 4. Implement audio message handling






  - [x] 4.1 Create handleAudioMessage method

    - Parse audio message from webhook payload
    - Download audio using downloadMedia
    - Validate audio using validateAudio
    - Call transcription service
    - Forward transcribed text to MessageHandler
    - _Requirements: 1.1, 1.3, 1.5_
  - [x] 4.2 Update processWebhook to handle audio type


    - Modify `handleIncomingMessage` to detect audio messages
    - Route audio messages to `handleAudioMessage`
    - Keep text message handling unchanged
    - _Requirements: 1.1_
  - [x] 4.3 Write property test for audio processing pipeline


    - **Property 1: Audio Processing Pipeline Integrity**
    - **Validates: Requirements 1.1, 1.3, 1.5**

- [x] 5. Implement audio response formatting





  - [x] 5.1 Create formatAudioResponse function
    - Add transcription preview with 🎤 emoji
    - Truncate preview to 100 chars with ellipsis
    - Combine with bot response
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 5.2 Write property test for response formatting



    - **Property 4: Audio Response Formatting**
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 6. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement error handling and logging
  - [x] 7.1 Add error response messages
    - Create error message constants for each error code
    - Implement error response selection logic
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 7.2 Add comprehensive logging
    - Log audio metadata on receive (mediaId, fileSize, duration)
    - Log errors with full context
    - Mask phone numbers in logs
    - _Requirements: 3.5, 6.1_
  - [x] 7.3 Write property test for logging completeness

    - **Property 5: Audio Logging Completeness**
    - **Validates: Requirements 3.5, 6.1**

- [x] 8. Implement database storage for audio messages






  - [x] 8.1 Update message creation for audio type

    - Store messages with messageType='audio'
    - Include transcription in audioMetadata JSON
    - Ensure no raw audio binary is stored
    - _Requirements: 6.2, 6.3_

  - [x] 8.2 Write property test for storage compliance

    - **Property 6: Audio Message Storage Compliance**
    - **Validates: Requirements 6.2, 6.3**

- [x] 9. Final Checkpoint - Ensure all tests pass








  - Ensure all tests pass, ask the user if questions arise.

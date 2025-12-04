# Requirements Document

## Introduction

Este documento especifica os requisitos para implementar o suporte a mensagens de áudio no sistema de atendimento via WhatsApp. A funcionalidade permitirá que clientes enviem mensagens de voz, que serão transcritas automaticamente e processadas pelo sistema conversacional existente, melhorando a acessibilidade e experiência do usuário.

## Glossary

- **Audio_Message**: Mensagem de voz enviada pelo cliente via WhatsApp
- **Transcription_Service**: Serviço responsável por converter áudio em texto
- **WhatsApp_Service**: Serviço que gerencia a comunicação com a API do WhatsApp Meta Cloud
- **Message_Handler**: Componente que processa mensagens recebidas e gera respostas
- **Media_URL**: URL temporária fornecida pela API do Meta para download de arquivos de mídia
- **Speech-to-Text**: Processo de conversão de fala em texto escrito

## Requirements

### Requirement 1

**User Story:** As a customer, I want to send voice messages to the bot, so that I can communicate more naturally without typing.

#### Acceptance Criteria

1. WHEN the WhatsApp_Service receives an audio message THEN the WhatsApp_Service SHALL download the audio file from the Media_URL
2. WHEN the WhatsApp_Service downloads an audio file THEN the WhatsApp_Service SHALL validate that the file size does not exceed 16MB
3. WHEN the WhatsApp_Service has a valid audio file THEN the WhatsApp_Service SHALL send the audio to the Transcription_Service
4. WHEN the Transcription_Service receives an audio file THEN the Transcription_Service SHALL return the transcribed text within 30 seconds
5. WHEN the Transcription_Service returns transcribed text THEN the Message_Handler SHALL process the text as if it were a typed message

### Requirement 2

**User Story:** As a customer, I want to receive confirmation that my voice message was understood, so that I know the bot processed my audio correctly.

#### Acceptance Criteria

1. WHEN the Transcription_Service successfully transcribes an audio message THEN the WhatsApp_Service SHALL include a brief transcription preview in the response
2. WHEN the transcription preview is shown THEN the WhatsApp_Service SHALL format the preview with a maximum of 100 characters followed by ellipsis if truncated
3. WHEN the Message_Handler responds to an audio message THEN the Message_Handler SHALL prefix the response with an audio acknowledgment indicator

### Requirement 3

**User Story:** As a system operator, I want audio processing to handle errors gracefully, so that customers receive helpful feedback when issues occur.

#### Acceptance Criteria

1. IF the audio file download fails THEN the WhatsApp_Service SHALL respond with a friendly error message asking the customer to try again
2. IF the audio file exceeds the size limit THEN the WhatsApp_Service SHALL respond with a message explaining the size limitation
3. IF the Transcription_Service fails to transcribe the audio THEN the WhatsApp_Service SHALL respond with a message suggesting the customer send a text message instead
4. IF the audio quality is too low for transcription THEN the Transcription_Service SHALL return an error indicating poor audio quality
5. WHEN any audio processing error occurs THEN the WhatsApp_Service SHALL log the error with full context for debugging

### Requirement 4

**User Story:** As a system operator, I want to use a cost-effective transcription service, so that audio processing remains economically viable.

#### Acceptance Criteria

1. WHEN configuring the Transcription_Service THEN the system SHALL support Groq Whisper API as the primary transcription provider
2. WHEN the Transcription_Service is initialized THEN the system SHALL validate that the GROQ_API_KEY environment variable is configured
3. WHEN transcribing audio THEN the Transcription_Service SHALL use the whisper-large-v3-turbo model for optimal speed and accuracy
4. WHEN the primary transcription provider fails THEN the system SHALL log the failure and return an appropriate error

### Requirement 5

**User Story:** As a developer, I want the audio transcription to be a modular service, so that I can easily swap transcription providers in the future.

#### Acceptance Criteria

1. WHEN implementing the Transcription_Service THEN the system SHALL define a clear interface for transcription operations
2. WHEN the Transcription_Service interface is defined THEN the interface SHALL include methods for transcribe and validateAudio
3. WHEN implementing a transcription provider THEN the provider SHALL implement the Transcription_Service interface
4. WHEN adding a new transcription provider THEN the system SHALL require only implementation of the interface without modifying existing code

### Requirement 6

**User Story:** As a system operator, I want audio messages to be logged for quality assurance, so that I can review interactions and improve the service.

#### Acceptance Criteria

1. WHEN an audio message is received THEN the system SHALL log the message metadata including duration and file size
2. WHEN an audio message is transcribed THEN the system SHALL store the transcription in the message history with type 'audio'
3. WHEN storing audio message data THEN the system SHALL NOT store the raw audio file to comply with data minimization principles

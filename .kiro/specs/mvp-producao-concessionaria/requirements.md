# Requirements Document

## Introduction

Este documento define os requisitos para o MVP de produção do assistente de vendas via WhatsApp para a concessionária **Renatinhus Cars** (https://www.renatinhuscars.com.br/). O sistema deve ser capaz de recomendar veículos do estoque de 27 veículos da loja, utilizando IA conversacional para entender as necessidades do cliente e apresentar opções relevantes com links diretos para a página de detalhes de cada veículo.

O objetivo é transformar o sistema existente (FaciliAuto) em uma solução pronta para produção, focada especificamente nesta concessionária, garantindo que todas as recomendações apontem para veículos reais disponíveis no site da loja.

## Glossary

- **Sistema**: O assistente de vendas FaciliAuto via WhatsApp
- **Cliente**: Usuário que interage com o bot via WhatsApp buscando veículos
- **Veículo**: Automóvel disponível no estoque da Renatinhus Cars
- **Recomendação**: Sugestão de veículo gerada pelo sistema baseada no perfil do cliente
- **Estoque**: Conjunto de 27 veículos disponíveis na concessionária
- **URL de Detalhes**: Link para a página "MAIS DETALHES" do veículo no site da loja
- **Scraper**: Componente que extrai dados de veículos do site da concessionária
- **Embedding**: Representação vetorial do veículo para busca semântica
- **Match Score**: Pontuação de 0-100 indicando adequação do veículo ao perfil do cliente
- **Quiz**: Sequência de perguntas para coletar preferências do cliente
- **Lead**: Cliente qualificado com interesse demonstrado em veículos

## Requirements

### Requirement 1: Extração de Dados de Veículos

**User Story:** As a system administrator, I want to extract vehicle data from the Renatinhus Cars website, so that the bot can recommend real vehicles available in stock.

#### Acceptance Criteria

1. WHEN the scraper runs against https://www.renatinhuscars.com.br/ THEN the Sistema SHALL extract all 27 vehicles with their complete information (marca, modelo, ano, km, preço, cor, combustível, câmbio)
2. WHEN extracting vehicle data THEN the Sistema SHALL capture the URL of the "MAIS DETALHES" page for each vehicle
3. WHEN a vehicle has photos available THEN the Sistema SHALL extract at least the main photo URL
4. WHEN the scraper completes THEN the Sistema SHALL validate that all required fields are present for each vehicle
5. IF a vehicle is missing required fields THEN the Sistema SHALL log the error and continue processing remaining vehicles

### Requirement 2: Persistência e Sincronização de Estoque

**User Story:** As a system administrator, I want to keep the vehicle database synchronized with the website, so that recommendations always reflect current availability.

#### Acceptance Criteria

1. WHEN vehicle data is extracted THEN the Sistema SHALL persist all vehicles to the PostgreSQL database using Prisma
2. WHEN a vehicle already exists in the database THEN the Sistema SHALL update its information instead of creating duplicates
3. WHEN a vehicle is no longer on the website THEN the Sistema SHALL mark it as unavailable (disponivel=false)
4. WHEN persisting vehicles THEN the Sistema SHALL store the URL field pointing to the vehicle's detail page
5. WHEN the sync completes THEN the Sistema SHALL log a summary with counts of added, updated, and removed vehicles

### Requirement 3: Geração de Embeddings para Busca Vetorial

**User Story:** As a system administrator, I want to generate vector embeddings for all vehicles, so that the semantic search can find relevant matches.

#### Acceptance Criteria

1. WHEN a new vehicle is added to the database THEN the Sistema SHALL generate an embedding using OpenAI text-embedding-3-small
2. WHEN generating embeddings THEN the Sistema SHALL create a text representation combining marca, modelo, versao, ano, km, preco, carroceria, combustivel, and cambio
3. WHEN the primary embedding provider fails THEN the Sistema SHALL fallback to Cohere embed-multilingual-v3.0
4. WHEN an embedding is generated THEN the Sistema SHALL persist it as a JSON array in the vehicle record
5. WHEN serializing embeddings THEN the Sistema SHALL encode them as JSON arrays of numbers
6. WHEN deserializing embeddings THEN the Sistema SHALL parse the JSON back to numeric arrays

### Requirement 4: Fluxo Conversacional de Qualificação

**User Story:** As a customer, I want to have a natural conversation with the bot, so that I can describe what I'm looking for and receive personalized recommendations.

#### Acceptance Criteria

1. WHEN a customer starts a conversation THEN the Sistema SHALL greet them and ask for their name
2. WHEN the customer provides their name THEN the Sistema SHALL store it and begin the discovery phase
3. WHEN in discovery phase THEN the Sistema SHALL ask about budget, intended use, and preferences
4. WHEN the customer answers a question THEN the Sistema SHALL extract relevant preferences and store them in the profile
5. WHEN the profile has sufficient information (budget and at least one preference) THEN the Sistema SHALL transition to recommendation phase

### Requirement 5: Busca e Recomendação de Veículos

**User Story:** As a customer, I want to receive vehicle recommendations that match my needs, so that I can find the right car quickly.

#### Acceptance Criteria

1. WHEN generating recommendations THEN the Sistema SHALL perform a vector similarity search using the customer profile
2. WHEN filtering results THEN the Sistema SHALL apply budget constraints (±20% tolerance)
3. WHEN ranking results THEN the Sistema SHALL use LLM to evaluate match score based on customer context
4. WHEN presenting recommendations THEN the Sistema SHALL show top 5 vehicles with reasoning
5. WHEN displaying a vehicle THEN the Sistema SHALL include the URL to the "MAIS DETALHES" page on the Renatinhus Cars website

### Requirement 6: Formatação de Mensagens WhatsApp

**User Story:** As a customer, I want to receive well-formatted messages with vehicle information, so that I can easily understand the recommendations.

#### Acceptance Criteria

1. WHEN formatting a vehicle recommendation THEN the Sistema SHALL include: marca, modelo, ano, km, preço, and a brief description
2. WHEN formatting the message THEN the Sistema SHALL use WhatsApp markdown (bold, italic) for emphasis
3. WHEN including the vehicle URL THEN the Sistema SHALL present it as a clickable link with call-to-action text
4. WHEN presenting multiple vehicles THEN the Sistema SHALL number them (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣) for easy reference
5. WHEN the message exceeds 4096 characters THEN the Sistema SHALL split it into multiple messages

### Requirement 7: Tratamento de Erros e Fallbacks

**User Story:** As a system administrator, I want the system to handle errors gracefully, so that customers always receive a response.

#### Acceptance Criteria

1. IF the LLM provider fails THEN the Sistema SHALL fallback to the secondary provider (Groq)
2. IF both LLM providers fail THEN the Sistema SHALL return a friendly error message and offer human handoff
3. IF the vector search returns no results THEN the Sistema SHALL suggest broadening search criteria
4. IF the database connection fails THEN the Sistema SHALL log the error and return a service unavailable message
5. WHEN any error occurs THEN the Sistema SHALL log it with full context for debugging

### Requirement 8: Integração WhatsApp Meta Business API

**User Story:** As a system administrator, I want to use the official Meta WhatsApp Business API, so that the bot can operate reliably in production.

#### Acceptance Criteria

1. WHEN receiving a webhook from Meta THEN the Sistema SHALL validate the signature and process the message
2. WHEN sending a response THEN the Sistema SHALL use the Meta Cloud API with proper authentication
3. WHEN the webhook verification is requested THEN the Sistema SHALL respond with the challenge token
4. IF a message fails to send THEN the Sistema SHALL retry up to 3 times with exponential backoff
5. WHEN processing messages THEN the Sistema SHALL handle rate limits gracefully (max 80 msgs/second)

### Requirement 9: Segurança e Guardrails

**User Story:** As a system administrator, I want to protect the system from abuse, so that it remains secure and reliable.

#### Acceptance Criteria

1. WHEN receiving user input THEN the Sistema SHALL sanitize it to remove control characters and HTML
2. WHEN detecting prompt injection patterns THEN the Sistema SHALL block the message and log the attempt
3. WHEN a user exceeds rate limits (10 msgs/min) THEN the Sistema SHALL temporarily block further messages
4. WHEN generating responses THEN the Sistema SHALL validate that no system prompts are leaked
5. WHEN handling sensitive data THEN the Sistema SHALL comply with LGPD requirements

### Requirement 10: Monitoramento e Observabilidade

**User Story:** As a system administrator, I want to monitor system health and usage, so that I can ensure reliable operation.

#### Acceptance Criteria

1. WHEN the system starts THEN the Sistema SHALL log configuration and connection status
2. WHEN processing a message THEN the Sistema SHALL log timing metrics (total time, LLM time, search time)
3. WHEN a recommendation is generated THEN the Sistema SHALL log the match scores and reasoning
4. WHEN an error occurs THEN the Sistema SHALL log the full stack trace and context
5. WHEN the health endpoint is called THEN the Sistema SHALL return status of all dependencies (DB, LLM, WhatsApp)

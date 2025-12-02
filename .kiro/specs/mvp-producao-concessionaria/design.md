# Design Document: MVP Produção Concessionária Renatinhus Cars

## Overview

Este documento descreve a arquitetura e design técnico para o MVP de produção do assistente de vendas via WhatsApp para a concessionária Renatinhus Cars. O sistema utiliza a infraestrutura existente do FaciliAuto, adaptando-a para operar com o estoque específico de 27 veículos da loja.

A solução combina:
- **Web Scraping** para extração de dados do site da concessionária
- **Busca Vetorial** com embeddings OpenAI para recomendações semânticas
- **LLM Routing** com fallback automático (OpenAI → Groq)
- **LangGraph** para orquestração do fluxo conversacional
- **Meta WhatsApp Business API** para comunicação em produção

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WhatsApp Business API (Meta)                     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ Webhook
┌─────────────────────────────────▼───────────────────────────────────────┐
│                           Express.js Server                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Webhook Routes  │  │ Admin Routes    │  │ Health/Debug Routes     │  │
│  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘  │
└───────────┼─────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────────┐
│                         Guardrails Service                               │
│  • Input Sanitization  • Rate Limiting  • Prompt Injection Detection    │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────────┐
│                      Message Handler V2                                  │
│  • Session Management  • State Persistence  • LGPD Compliance           │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────────┐
│                    LangGraph Conversation Manager                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Greeting │→ │ Discovery│→ │ Clarification│→ │ Recommendation   │    │
│  │   Node   │  │   Node   │  │     Node     │  │      Node        │    │
│  └──────────┘  └──────────┘  └──────────────┘  └──────────────────┘    │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────────┐
│                         Agent Layer                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Quiz Agent      │  │ Recommendation  │  │ Vehicle Expert Agent    │  │
│  │ (Preferences)   │  │ Agent (Top 5)   │  │ (Technical Details)     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼────────────────────┼────────────────────────┼───────────────┘
            │                    │                        │
┌───────────▼────────────────────▼────────────────────────▼───────────────┐
│                          LLM Router                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ OpenAI GPT-4o   │→ │ Groq LLaMA 3.1  │→ │ Mock (Development)      │  │
│  │ mini (Primary)  │  │ (Fallback)      │  │                         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────────┐
│                    In-Memory Vector Store                                │
│  • Cosine Similarity Search  • Pre-loaded Embeddings  • < 50ms latency  │
└───────────┬─────────────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────────┐
│                      PostgreSQL + Prisma ORM                             │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Vehicle  │  │ Conversation │  │Recommendation│  │     Lead       │  │
│  │ (27 cars)│  │              │  │              │  │                │  │
│  └──────────┘  └──────────────┘  └──────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Web Scraper Component

**Responsabilidade:** Extrair dados de veículos do site Renatinhus Cars

```typescript
interface ScrapedVehicle {
  marca: string;
  modelo: string;
  versao?: string;
  ano: number;
  km: number;
  preco: number;
  cor: string;
  combustivel: string;
  cambio: string;
  carroceria: string;
  fotoUrl?: string;
  fotosUrls: string[];
  url: string;  // URL da página "MAIS DETALHES"
  descricao?: string;
}

interface ScraperService {
  scrapeAllVehicles(): Promise<ScrapedVehicle[]>;
  scrapeVehicleDetails(url: string): Promise<ScrapedVehicle>;
  validateVehicle(vehicle: ScrapedVehicle): ValidationResult;
}
```

### 2. Vehicle Sync Service

**Responsabilidade:** Sincronizar dados do scraper com o banco de dados

```typescript
interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

interface VehicleSyncService {
  syncFromScraper(vehicles: ScrapedVehicle[]): Promise<SyncResult>;
  markUnavailable(vehicleIds: string[]): Promise<void>;
  getLastSyncTime(): Promise<Date | null>;
}
```

### 3. Embedding Service

**Responsabilidade:** Gerar e gerenciar embeddings vetoriais

```typescript
interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  generateVehicleEmbedding(vehicle: Vehicle): Promise<number[]>;
  batchGenerateEmbeddings(vehicles: Vehicle[]): Promise<Map<string, number[]>>;
}

interface EmbeddingRouter {
  providers: EmbeddingProvider[];
  currentProvider: number;
  generate(text: string): Promise<number[]>;
  fallbackToNext(): void;
}
```

### 4. Recommendation Engine

**Responsabilidade:** Gerar recomendações de veículos baseadas no perfil do cliente

```typescript
interface CustomerProfile {
  budget?: number;
  usage?: 'urbano' | 'viagem' | 'trabalho' | 'familia';
  preferences?: string[];
  hasTradeIn?: boolean;
}

interface VehicleRecommendation {
  vehicleId: string;
  vehicle: Vehicle;
  matchScore: number;  // 0-100
  reasoning: string;
  url: string;  // Link para "MAIS DETALHES"
}

interface RecommendationEngine {
  generateRecommendations(
    profile: CustomerProfile,
    limit: number
  ): Promise<VehicleRecommendation[]>;
  
  searchByVector(
    queryEmbedding: number[],
    filters: VehicleFilters
  ): Promise<Vehicle[]>;
}
```

### 5. Message Formatter

**Responsabilidade:** Formatar mensagens para WhatsApp

```typescript
interface MessageFormatter {
  formatVehicleCard(vehicle: Vehicle, position: number): string;
  formatRecommendationList(recommendations: VehicleRecommendation[]): string;
  formatGreeting(customerName?: string): string;
  formatError(errorType: ErrorType): string;
  splitLongMessage(message: string, maxLength: number): string[];
}
```

### 6. WhatsApp Meta Service

**Responsabilidade:** Comunicação com Meta WhatsApp Business API

```typescript
interface WhatsAppMetaService {
  sendMessage(phoneNumber: string, message: string): Promise<SendResult>;
  sendTemplate(phoneNumber: string, template: string, params: any): Promise<SendResult>;
  verifyWebhook(mode: string, token: string, challenge: string): string | null;
  processWebhook(body: WebhookPayload): Promise<IncomingMessage | null>;
}
```

## Data Models

### Vehicle Model (Prisma)

```prisma
model Vehicle {
  id              String   @id @default(uuid())
  marca           String
  modelo          String
  versao          String?
  ano             Int
  km              Int
  preco           Float
  cor             String
  carroceria      String
  combustivel     String   @default("Flex")
  cambio          String   @default("Manual")
  
  // URL para página de detalhes no site
  url             String?
  
  // Fotos
  fotoUrl         String?
  fotosUrls       String   @default("")
  
  // Descrição
  descricao       String?
  
  // Embedding vetorial (1536 dimensões)
  embedding       String?
  embeddingModel  String?
  embeddingGeneratedAt DateTime?
  
  // Status
  disponivel      Boolean  @default(true)
  
  // Contextos de uso
  aptoUber        Boolean  @default(false)
  aptoFamilia     Boolean  @default(true)
  aptoTrabalho    Boolean  @default(true)
  
  // Timestamps
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  recommendations Recommendation[]
}
```

### Conversation State

```typescript
interface ConversationState {
  conversationId: string;
  phoneNumber: string;
  customerName?: string;
  
  messages: Message[];
  
  quiz: {
    currentQuestion: number;
    progress: number;
    answers: Record<string, any>;
    isComplete: boolean;
  };
  
  profile: CustomerProfile;
  
  recommendations: VehicleRecommendation[];
  
  graph: {
    currentNode: 'greeting' | 'discovery' | 'clarification' | 'recommendation' | 'follow_up';
    nodeHistory: string[];
    errorCount: number;
  };
  
  metadata: {
    startedAt: Date;
    lastMessageAt: Date;
    flags: string[];
  };
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the acceptance criteria analysis, the following correctness properties must be validated through property-based testing:

### Property 1: Scraper extracts all required vehicle fields
*For any* valid HTML page from Renatinhus Cars containing vehicle listings, the scraper SHALL extract all required fields (marca, modelo, ano, km, preco, cor, combustivel, cambio) for each vehicle present.
**Validates: Requirements 1.1, 1.4**

### Property 2: Scraper captures URL for each vehicle
*For any* vehicle extracted by the scraper, the resulting data SHALL contain a non-empty URL pointing to the vehicle's detail page.
**Validates: Requirements 1.2, 2.4**

### Property 3: Validation catches missing required fields
*For any* scraped vehicle data with one or more missing required fields, the validation function SHALL return a failure result identifying the missing fields.
**Validates: Requirements 1.4**

### Property 4: Sync is idempotent (no duplicates)
*For any* set of vehicles, syncing the same data twice SHALL result in the same number of vehicles in the database (no duplicates created).
**Validates: Requirements 2.2**

### Property 5: Sync marks removed vehicles as unavailable
*For any* vehicle that exists in the database but is not present in the new sync data, the sync operation SHALL mark that vehicle as unavailable (disponivel=false).
**Validates: Requirements 2.3**

### Property 6: Embedding text representation includes all attributes
*For any* vehicle, the generated text representation for embedding SHALL contain the vehicle's marca, modelo, ano, km, preco, carroceria, combustivel, and cambio.
**Validates: Requirements 3.2**

### Property 7: Embedding serialization round-trip
*For any* valid embedding array (1536 floating-point numbers), serializing to JSON and deserializing back SHALL produce an array equal to the original.
**Validates: Requirements 3.5, 3.6**

### Property 8: Name input triggers state transition
*For any* conversation in greeting state, when the customer provides a name, the conversation SHALL transition to discovery state and store the customer name.
**Validates: Requirements 4.2**

### Property 9: Preference extraction from answers
*For any* customer answer containing budget or usage information, the preference extractor SHALL correctly identify and store these values in the profile.
**Validates: Requirements 4.4**

### Property 10: Profile completeness triggers recommendation phase
*For any* customer profile with budget defined and at least one preference, the system SHALL transition to recommendation phase.
**Validates: Requirements 4.5**

### Property 11: Budget filter applies ±20% tolerance
*For any* recommendation search with a budget constraint, all returned vehicles SHALL have prices within ±20% of the specified budget.
**Validates: Requirements 5.2**

### Property 12: Recommendations return at most 5 vehicles
*For any* recommendation request, the system SHALL return at most 5 vehicles, ordered by match score descending.
**Validates: Requirements 5.4**

### Property 13: Vehicle formatting includes all required fields and URL
*For any* vehicle recommendation, the formatted message SHALL contain the vehicle's marca, modelo, ano, km, preco, and the URL to the detail page.
**Validates: Requirements 5.5, 6.1, 6.3**

### Property 14: Message formatting uses markdown and numbering
*For any* list of vehicle recommendations, the formatted message SHALL use WhatsApp markdown (bold/italic) and number each vehicle (1️⃣, 2️⃣, etc.).
**Validates: Requirements 6.2, 6.4**

### Property 15: Long messages are split correctly
*For any* message exceeding 4096 characters, the split function SHALL return multiple messages each with at most 4096 characters, preserving content integrity.
**Validates: Requirements 6.5**

### Property 16: Webhook signature validation
*For any* incoming webhook request, the signature validation SHALL return true only if the signature matches the expected HMAC-SHA256 of the payload.
**Validates: Requirements 8.1**

### Property 17: Input sanitization removes bad characters
*For any* user input containing control characters, HTML tags, or unicode exploits, the sanitization function SHALL remove or escape these characters.
**Validates: Requirements 9.1**

### Property 18: Prompt injection detection blocks malicious input
*For any* input matching known prompt injection patterns (e.g., "ignore previous instructions", "system prompt"), the guardrails SHALL block the message.
**Validates: Requirements 9.2**

### Property 19: Rate limiting blocks excessive requests
*For any* user sending more than 10 messages per minute, the rate limiter SHALL block subsequent messages until the window resets.
**Validates: Requirements 9.3**

### Property 20: Output validation prevents system prompt leakage
*For any* generated response, the output validator SHALL detect and block responses containing system prompt fragments or internal instructions.
**Validates: Requirements 9.4**

## Error Handling

### LLM Provider Failures

```typescript
// Circuit breaker pattern for LLM calls
const llmRouter = {
  providers: [
    { name: 'openai', model: 'gpt-4o-mini', priority: 1 },
    { name: 'groq', model: 'llama-3.1-8b-instant', priority: 2 },
  ],
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
  },
  
  async call(prompt: string): Promise<string> {
    for (const provider of this.providers) {
      if (this.isCircuitOpen(provider.name)) continue;
      
      try {
        return await this.callProvider(provider, prompt);
      } catch (error) {
        this.recordFailure(provider.name);
        logger.warn({ provider: provider.name, error }, 'LLM provider failed, trying next');
      }
    }
    
    throw new Error('All LLM providers failed');
  }
};
```

### Database Connection Failures

```typescript
// Prisma with connection retry
const prismaWithRetry = {
  async query<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === retries - 1) throw error;
        await sleep(Math.pow(2, i) * 1000); // Exponential backoff
      }
    }
    throw new Error('Database operation failed after retries');
  }
};
```

### Empty Search Results

```typescript
// Handle no results gracefully
if (recommendations.length === 0) {
  return {
    message: `Não encontrei veículos que correspondam exatamente ao seu perfil.

Algumas sugestões:
• Aumentar um pouco o orçamento
• Considerar outras marcas/modelos
• Flexibilizar o ano ou quilometragem

Quer que eu busque com critérios mais amplos? 🔍`,
    suggestions: ['Buscar com orçamento maior', 'Ver todos os veículos', 'Falar com vendedor']
  };
}
```

## Testing Strategy

### Dual Testing Approach

O sistema utiliza uma abordagem de testes complementares:

1. **Unit Tests**: Verificam comportamentos específicos e edge cases
2. **Property-Based Tests**: Verificam propriedades universais que devem valer para todas as entradas

### Property-Based Testing Framework

**Framework escolhido:** `fast-check` (JavaScript/TypeScript)

```typescript
import fc from 'fast-check';

// Configuração: mínimo 100 iterações por propriedade
const propertyConfig = { numRuns: 100 };
```

### Test Organization

```
tests/
├── unit/
│   ├── scraper.test.ts           # Scraper unit tests
│   ├── formatter.test.ts         # Message formatter tests
│   ├── guardrails.test.ts        # Security guardrails tests
│   └── sync.test.ts              # Vehicle sync tests
├── properties/
│   ├── scraper.property.ts       # Properties 1-3
│   ├── sync.property.ts          # Properties 4-5
│   ├── embedding.property.ts     # Properties 6-7
│   ├── conversation.property.ts  # Properties 8-10
│   ├── recommendation.property.ts # Properties 11-12
│   ├── formatter.property.ts     # Properties 13-15
│   ├── webhook.property.ts       # Property 16
│   └── guardrails.property.ts    # Properties 17-20
├── integration/
│   ├── llm-integration.test.ts   # LLM provider integration
│   └── webhook.test.ts           # WhatsApp webhook integration
└── e2e/
    └── conversational-flow.e2e.test.ts  # Full conversation flow
```

### Property Test Annotations

Each property-based test MUST be annotated with the format:
```typescript
/**
 * **Feature: mvp-producao-concessionaria, Property 7: Embedding serialization round-trip**
 * **Validates: Requirements 3.5, 3.6**
 */
```

### Test Generators

```typescript
// Vehicle generator for property tests
const vehicleArbitrary = fc.record({
  marca: fc.constantFrom('Fiat', 'Volkswagen', 'Chevrolet', 'Honda', 'Toyota'),
  modelo: fc.string({ minLength: 2, maxLength: 30 }),
  ano: fc.integer({ min: 2010, max: 2025 }),
  km: fc.integer({ min: 0, max: 300000 }),
  preco: fc.float({ min: 20000, max: 500000 }),
  cor: fc.constantFrom('Branco', 'Preto', 'Prata', 'Vermelho', 'Azul'),
  combustivel: fc.constantFrom('Flex', 'Gasolina', 'Diesel', 'Elétrico'),
  cambio: fc.constantFrom('Manual', 'Automático', 'CVT'),
  carroceria: fc.constantFrom('Hatch', 'Sedan', 'SUV', 'Picape'),
  url: fc.webUrl(),
});

// Embedding generator (1536 dimensions)
const embeddingArbitrary = fc.array(
  fc.float({ min: -1, max: 1 }),
  { minLength: 1536, maxLength: 1536 }
);

// Malicious input generator for injection tests
const maliciousInputArbitrary = fc.oneof(
  fc.constant('ignore previous instructions'),
  fc.constant('system prompt: '),
  fc.constant('<script>alert(1)</script>'),
  fc.constant('{{constructor.constructor}}'),
  fc.stringOf(fc.constantFrom('\x00', '\x1f', '\x7f')), // Control chars
);
```

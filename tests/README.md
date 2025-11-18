# 🧪 Suite de Testes - FaciliAuto MVP v2

## 📋 Visão Geral

Suite completa de testes E2E (End-to-End), integração e unitários usando **Vitest** com metodologia XP (Extreme Programming).

## 🏗️ Estrutura

```
tests/
├── e2e/              # Testes End-to-End (fluxos completos)
│   ├── flows/        # Fluxos de usuário
│   │   ├── quiz.test.ts
│   │   └── recommendation.test.ts
│   ├── agents/       # Testes de agentes individuais
│   ├── integrations/ # Integrações externas (Groq, OpenAI)
│   │   ├── groq.test.ts
│   │   └── embeddings.test.ts
│   └── security/     # Segurança e guardrails
│       └── guardrails.test.ts
├── integration/      # Testes de integração
├── unit/            # Testes unitários
├── performance/     # Testes de performance
├── helpers/         # Utilitários de teste
│   └── test-utils.ts
└── fixtures/        # Dados mock e fixtures
```

## 🚀 Comandos

### Executar Testes

```bash
# Rodar todos os testes
npm test

# Rodar com interface UI
npm run test:ui

# Rodar apenas uma vez (CI/CD)
npm run test:run

# Rodar com coverage
npm run test:coverage

# Watch mode (desenvolvimento)
npm run test:watch
```

### Testes Específicos

```bash
# Apenas E2E
npm run test:e2e

# Apenas integração
npm run test:integration

# Apenas unitários
npm run test:unit

# Arquivo específico
npm test tests/e2e/flows/quiz.test.ts
```

## 📊 Coverage

Meta: **80%+ coverage** em:
- Lines
- Functions
- Branches
- Statements

Verificar coverage:
```bash
npm run test:coverage
```

Abrir relatório HTML:
```bash
open coverage/index.html
```

## 🧩 Helpers e Utilities

### `test-utils.ts`

Funções utilitárias para criação de mocks:

```typescript
import { createMockConversation, createMockVehicle, cleanDatabase } from '@tests/helpers/test-utils';

// Criar conversação mock
const conversation = createMockConversation({
  state: 'QUIZ',
  currentStep: 'budget',
});

// Criar veículo mock
const vehicle = createMockVehicle({
  brand: 'Fiat',
  model: 'Argo',
  price: 48000,
});

// Limpar banco antes do teste
await cleanDatabase();
```

## 🔒 Testes de Segurança

### Guardrails

Testamos proteção contra:
- ✅ Linguagem ofensiva
- ✅ Tentativas de jailbreak
- ✅ Phishing
- ✅ SQL injection
- ✅ Spam
- ✅ Rate limiting
- ✅ PII (dados pessoais)
- ✅ Prompt injection

## 📝 Escrevendo Testes

### Template Básico

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanDatabase } from '@tests/helpers/test-utils';

describe('Nome do Módulo', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('Funcionalidade Específica', () => {
    it('deve fazer algo esperado', async () => {
      // Arrange
      const input = 'test';

      // Act
      const result = await funcao(input);

      // Assert
      expect(result).toBe('esperado');
    });
  });
});
```

### Boas Práticas

1. **Arrange-Act-Assert**: Estruture testes em 3 partes
2. **Descrições claras**: Use `deve` nas descrições
3. **Isolamento**: Cada teste deve ser independente
4. **Cleanup**: Limpe dados antes/depois de cada teste
5. **Mocks**: Use mocks para dependências externas
6. **Timeouts**: Configure timeouts adequados para testes assíncronos

## 🎯 Metodologia XP

### TDD (Test-Driven Development)

1. **RED**: Escreva teste que falha
2. **GREEN**: Escreva código mínimo para passar
3. **REFACTOR**: Melhore o código mantendo testes verdes

### Princípios

- Testes antes do código
- Pequenos incrementos
- Refatoração constante
- Feedback contínuo
- Simplicidade

## 🔧 Configuração

### vitest.config.ts

- Globals habilitados
- Environment: node
- Coverage provider: v8
- Timeout: 30s para testes assíncronos
- Setup file: `tests/setup.ts`

### .env.test

Variáveis de ambiente para testes:
```env
NODE_ENV=test
DATABASE_URL=file:./test.db
GROQ_API_KEY=test-groq-key
OPENAI_API_KEY=test-openai-key
```

## 🐛 Debugging

### VS Code

Adicione ao `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### CLI

```bash
# Debug específico
node --inspect-brk ./node_modules/.bin/vitest tests/e2e/flows/quiz.test.ts
```

## 📈 CI/CD

GitHub Actions configurado em `.github/workflows/ci.yml`:

- ✅ Rodar todos os testes
- ✅ Gerar coverage
- ✅ Upload para Codecov
- ✅ Lint de código
- ✅ Build do projeto
- ✅ Deploy automático (main branch)

## 📚 Recursos

- [Vitest Docs](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Faker.js](https://fakerjs.dev/)
- [Supertest](https://github.com/ladjs/supertest)

## 🎯 Métricas de Qualidade

### Coverage Mínimo
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

### Performance
- Testes unitários: < 100ms cada
- Testes integração: < 1s cada
- Testes E2E: < 10s cada
- Suite completa: < 5 min

### Confiabilidade
- Taxa de falsos positivos: < 1%
- Taxa de falsos negativos: 0%
- Testes flaky: 0%

## 🔄 Continuous Improvement

1. **Review semanal** de coverage
2. **Adicionar testes** para bugs encontrados
3. **Refatorar testes** lentos ou complexos
4. **Atualizar mocks** conforme API muda
5. **Documentar** padrões e decisões

---

**Status Atual**: ✅ 4 suites E2E implementadas  
**Próximo Passo**: Adicionar testes de integração e unitários  
**Meta Coverage**: 80%+ em todas as métricas

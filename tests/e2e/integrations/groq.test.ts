import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as groq from '@/lib/groq';

describe('Groq Integration - E2E', () => {
  beforeEach(() => {
    // Garantir que API key está configurada para testes
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'test-groq-key') {
      vi.stubEnv('GROQ_API_KEY', 'gsk_test_key_for_testing');
    }
  });

  describe('Chat Completion', () => {
    it('deve gerar resposta de chat básica', async () => {
      const response = await groq.chatCompletion([
        { role: 'user', content: 'Diga "olá" em uma palavra' },
      ]);

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    }, 10000);

    it('deve respeitar system prompt', async () => {
      const response = await groq.chatCompletion(
        [
          { role: 'user', content: 'Qual é o seu nome?' },
        ],
        {
          systemPrompt: 'Você é um assistente chamado FaciliBot. Sempre se identifique.',
        }
      );

      expect(response).toBeDefined();
      expect(response.toLowerCase()).toContain('facilibot');
    }, 10000);

    it('deve gerar resposta com contexto de conversação', async () => {
      const messages = [
        { role: 'user', content: 'Meu orçamento é R$ 50.000' },
        { role: 'assistant', content: 'Entendi, seu orçamento é R$ 50.000. Qual será o uso principal do veículo?' },
        { role: 'user', content: 'Qual foi o orçamento que eu disse?' },
      ];

      const response = await groq.chatCompletion(messages as any);

      expect(response).toBeDefined();
      expect(response).toContain('50'); // Deve lembrar do orçamento
    }, 10000);
  });

  describe('Sales Chat Completion', () => {
    it('deve gerar resposta com tom de vendas', async () => {
      const response = await groq.salesChatCompletion(
        [
          { role: 'user', content: 'Estou procurando um carro' },
        ],
        {
          customerName: 'João',
          dealerName: 'Renatinhu FIAT',
        }
      );

      expect(response).toBeDefined();
      expect(response.toLowerCase()).toContain('joão');
    }, 10000);

    it('deve incluir contexto do dealer', async () => {
      const response = await groq.salesChatCompletion(
        [
          { role: 'user', content: 'Qual é o nome da concessionária?' },
        ],
        {
          dealerName: 'Renatinhu FIAT',
        }
      );

      expect(response).toBeDefined();
      expect(response.toLowerCase()).toContain('renatinhu');
    }, 10000);
  });

  describe('Intent Extraction', () => {
    it('deve extrair intenção de compra', async () => {
      const intent = await groq.extractIntent('Quero comprar um carro novo');

      expect(intent).toBeDefined();
      expect(['PURCHASE', 'INQUIRY', 'HELP']).toContain(intent);
    }, 10000);

    it('deve extrair intenção de dúvida', async () => {
      const intent = await groq.extractIntent('Quanto custa o Fiat Argo?');

      expect(intent).toBeDefined();
      expect(['INQUIRY', 'PRICE_CHECK']).toContain(intent);
    }, 10000);

    it('deve extrair intenção de ajuda', async () => {
      const intent = await groq.extractIntent('Não entendi, pode explicar?');

      expect(intent).toBeDefined();
      expect(intent).toBe('HELP');
    }, 10000);
  });

  describe('Recommendation Reasoning', () => {
    it('deve gerar raciocínio de recomendação', async () => {
      const reasoning = await groq.generateRecommendationReasoning({
        vehicleModel: 'Fiat Argo 1.0',
        customerBudget: 50000,
        vehiclePrice: 48000,
        customerUsage: 'trabalho',
        matchScore: 95,
      });

      expect(reasoning).toBeDefined();
      expect(typeof reasoning).toBe('string');
      expect(reasoning.length).toBeGreaterThan(50);
      expect(reasoning.toLowerCase()).toContain('argo');
    }, 10000);

    it('deve mencionar Match Score no raciocínio', async () => {
      const reasoning = await groq.generateRecommendationReasoning({
        vehicleModel: 'Fiat Mobi',
        matchScore: 88,
      });

      expect(reasoning).toBeDefined();
      // Deve mencionar score ou porcentagem
      expect(reasoning).toMatch(/\d+%|score|compatibilidade/i);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('deve lançar erro se API key inválida', async () => {
      const originalKey = process.env.GROQ_API_KEY;
      vi.stubEnv('GROQ_API_KEY', 'invalid_key');

      await expect(async () => {
        await groq.chatCompletion([
          { role: 'user', content: 'test' },
        ]);
      }).rejects.toThrow();

      vi.stubEnv('GROQ_API_KEY', originalKey);
    });

    it('deve lidar com timeout', async () => {
      // Este teste depende da implementação de timeout no groq.ts
      // Ajustar conforme necessário
    }, 15000);

    it('deve lidar com rate limit', async () => {
      // Simular muitas requisições rápidas
      // Este teste pode ser ajustado conforme limites reais do Groq
    });
  });

  describe('Performance', () => {
    it('deve responder em menos de 3 segundos', async () => {
      const start = Date.now();

      await groq.chatCompletion([
        { role: 'user', content: 'Diga "ok"' },
      ]);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000); // Groq é muito rápido
    }, 5000);

    it('deve processar múltiplas requisições em paralelo', async () => {
      const promises = [
        groq.chatCompletion([{ role: 'user', content: 'teste 1' }]),
        groq.chatCompletion([{ role: 'user', content: 'teste 2' }]),
        groq.chatCompletion([{ role: 'user', content: 'teste 3' }]),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });
    }, 10000);
  });
});

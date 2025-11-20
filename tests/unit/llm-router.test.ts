import { describe, it, expect, beforeEach } from 'vitest';
import {
  chatCompletion,
  getLLMProvidersStatus,
  resetCircuitBreaker,
} from '../../src/lib/llm-router';

describe('LLM Router', () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  describe('chatCompletion', () => {
    it('deve retornar resposta válida com mock mode', async () => {
      const messages = [
        { role: 'system' as const, content: 'Você é um assistente útil' },
        { role: 'user' as const, content: 'Olá' },
      ];

      const response = await chatCompletion(messages);

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
    });

    it('deve classificar intenção QUALIFICAR corretamente', async () => {
      const messages = [
        {
          role: 'system' as const,
          content: 'Você é um classificador de intenções',
        },
        {
          role: 'user' as const,
          content: 'Quero comprar um carro',
        },
      ];

      const response = await chatCompletion(messages, {
        temperature: 0.3,
        maxTokens: 10,
      });

      expect(response.toUpperCase()).toContain('QUALIFICAR');
    });

    it('deve classificar intenção HUMANO corretamente', async () => {
      const messages = [
        {
          role: 'system' as const,
          content: 'Você é um classificador de intenções',
        },
        {
          role: 'user' as const,
          content: 'Quero falar com um vendedor',
        },
      ];

      const response = await chatCompletion(messages, {
        temperature: 0.3,
        maxTokens: 10,
      });

      expect(response.toUpperCase()).toContain('HUMANO');
    });

    it('deve respeitar maxTokens', async () => {
      const messages = [
        { role: 'system' as const, content: 'Seja breve' },
        { role: 'user' as const, content: 'Olá' },
      ];

      const response = await chatCompletion(messages, {
        maxTokens: 10,
      });

      // Mock sempre retorna respostas curtas
      expect(response.length).toBeLessThan(500);
    });
  });

  describe('getLLMProvidersStatus', () => {
    it('deve retornar status dos providers', () => {
      const status = getLLMProvidersStatus();

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);

      status.forEach((provider) => {
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('model');
        expect(provider).toHaveProperty('enabled');
        expect(provider).toHaveProperty('priority');
        expect(provider).toHaveProperty('costPer1MTokens');
        expect(provider).toHaveProperty('circuitBreakerOpen');
      });
    });

    it('deve incluir OpenAI como primário', () => {
      const status = getLLMProvidersStatus();
      const openai = status.find((p) => p.name === 'openai');

      expect(openai).toBeDefined();
      expect(openai?.priority).toBe(1);
      expect(openai?.model).toBe('gpt-4o-mini');
    });

    it('deve incluir Groq como fallback', () => {
      const status = getLLMProvidersStatus();
      const groq = status.find((p) => p.name === 'groq');

      expect(groq).toBeDefined();
      expect(groq?.priority).toBe(2);
      expect(groq?.model).toBe('llama-3.1-8b-instant');
    });
  });

  describe('Circuit Breaker', () => {
    it('deve resetar circuit breaker corretamente', () => {
      resetCircuitBreaker();
      const status = getLLMProvidersStatus();

      status.forEach((provider) => {
        expect(provider.circuitBreakerOpen).toBe(false);
      });
    });
  });

  describe('Fallback Behavior', () => {
    it('deve usar mock quando nenhum provider está disponível', async () => {
      // Mock mode está sempre ativo em testes sem API keys reais
      const messages = [
        { role: 'system' as const, content: 'Teste' },
        { role: 'user' as const, content: 'Olá' },
      ];

      const response = await chatCompletion(messages);

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
    });
  });
});

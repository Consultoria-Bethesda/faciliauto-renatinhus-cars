import { describe, it, expect, beforeEach } from 'vitest';
import { QuizAgent } from '@/agents/quiz.agent';
import { createMockConversation, cleanDatabase } from '@tests/helpers/test-utils';

describe('Quiz Agent - E2E Flow', () => {
  let quizAgent: QuizAgent;
  let mockConversation: any;

  beforeEach(async () => {
    await cleanDatabase();
    quizAgent = new QuizAgent();
    mockConversation = createMockConversation({
      state: 'QUIZ',
      currentStep: 'budget',
    });
  });

  describe('Fluxo Completo do Quiz', () => {
    it('deve conduzir quiz de 8 perguntas com sucesso', async () => {
      const questions = [
        { step: 'budget', answer: '60000', expected: 60000 },
        { step: 'usage', answer: 'trabalho', expected: 'trabalho' },
        { step: 'persons', answer: '4', expected: 4 },
        { step: 'bodyType', answer: 'sedan', expected: 'sedan' },
        { step: 'essentialItems', answer: 'ar condicionado, direção elétrica', expected: ['ar condicionado', 'direção elétrica'] },
        { step: 'transmission', answer: 'automático', expected: 'automático' },
        { step: 'brand', answer: 'fiat', expected: 'fiat' },
        { step: 'deadline', answer: '30 dias', expected: '30 dias' },
      ];

      const context: any = {};

      for (const { step, answer, expected } of questions) {
        mockConversation.currentStep = step;
        
        const response = await quizAgent.processAnswer(
          mockConversation,
          answer,
          context
        );

        expect(response).toBeDefined();
        expect(context[step]).toEqual(expected);
      }

      // Verifica se o contexto está completo
      expect(context).toHaveProperty('budget');
      expect(context).toHaveProperty('usage');
      expect(context).toHaveProperty('persons');
      expect(context).toHaveProperty('bodyType');
    });

    it('deve rejeitar orçamento inválido', async () => {
      mockConversation.currentStep = 'budget';
      
      await expect(async () => {
        await quizAgent.processAnswer(
          mockConversation,
          'abc',
          {}
        );
      }).rejects.toThrow();
    });

    it('deve rejeitar número de pessoas inválido', async () => {
      mockConversation.currentStep = 'persons';
      
      await expect(async () => {
        await quizAgent.processAnswer(
          mockConversation,
          '20', // Muito alto
          {}
        );
      }).rejects.toThrow();
    });

    it('deve aceitar múltiplos itens essenciais', async () => {
      mockConversation.currentStep = 'essentialItems';
      const context: any = {};
      
      await quizAgent.processAnswer(
        mockConversation,
        'ar condicionado, direção elétrica, airbag',
        context
      );

      expect(context.essentialItems).toBeInstanceOf(Array);
      expect(context.essentialItems).toContain('ar condicionado');
      expect(context.essentialItems).toContain('direção elétrica');
      expect(context.essentialItems).toContain('airbag');
    });
  });

  describe('Validações do Quiz', () => {
    it('deve validar formato de orçamento', async () => {
      const validBudgets = ['50000', 'R$ 50.000', '50 mil', 'cinquenta mil'];
      
      for (const budget of validBudgets) {
        const context: any = {};
        mockConversation.currentStep = 'budget';
        
        const response = await quizAgent.processAnswer(
          mockConversation,
          budget,
          context
        );

        expect(context.budget).toBeGreaterThan(0);
      }
    });

    it('deve normalizar uso do veículo', async () => {
      const usageVariations = [
        { input: 'trabalho', expected: 'trabalho' },
        { input: 'família', expected: 'família' },
        { input: 'passeio', expected: 'lazer' },
        { input: 'viagem', expected: 'lazer' },
      ];

      for (const { input, expected } of usageVariations) {
        const context: any = {};
        mockConversation.currentStep = 'usage';
        
        await quizAgent.processAnswer(
          mockConversation,
          input,
          context
        );

        expect(context.usage).toBe(expected);
      }
    });
  });

  describe('Progressão do Quiz', () => {
    it('deve avançar para próxima pergunta após resposta válida', async () => {
      mockConversation.currentStep = 'budget';
      const context: any = {};
      
      const response = await quizAgent.processAnswer(
        mockConversation,
        '50000',
        context
      );

      expect(response).toContain('uso'); // Próxima pergunta
    });

    it('deve completar quiz e sinalizar conclusão', async () => {
      const context = {
        budget: 50000,
        usage: 'trabalho',
        persons: 4,
        bodyType: 'sedan',
        essentialItems: ['ar condicionado'],
        transmission: 'automático',
        brand: 'fiat',
      };

      mockConversation.currentStep = 'deadline';
      
      const response = await quizAgent.processAnswer(
        mockConversation,
        '30 dias',
        context
      );

      expect(response).toContain('recomendação'); // Indica conclusão
    });
  });
});

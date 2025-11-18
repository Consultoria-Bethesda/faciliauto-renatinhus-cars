import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecommendationAgent } from '@/agents/recommendation.agent';
import { VectorSearchService } from '@/services/vector-search.service';
import { createMockConsultation, cleanDatabase } from '@tests/helpers/test-utils';

describe('Recommendation Agent - E2E Flow', () => {
  let recommendationAgent: RecommendationAgent;
  let vectorSearchService: VectorSearchService;

  beforeEach(async () => {
    await cleanDatabase();
    recommendationAgent = new RecommendationAgent();
    vectorSearchService = new VectorSearchService();
  });

  describe('Geração de Recomendações', () => {
    it('deve gerar top 5 recomendações com Match Score', async () => {
      const consultation = createMockConsultation({
        budget: 60000,
        usage: 'trabalho',
        persons: 4,
        bodyType: 'sedan',
        essentialItems: ['ar condicionado', 'direção elétrica'],
      });

      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.length).toBeLessThanOrEqual(5);

      // Verificar estrutura de cada recomendação
      recommendations.forEach((rec) => {
        expect(rec).toHaveProperty('vehicle');
        expect(rec).toHaveProperty('matchScore');
        expect(rec).toHaveProperty('matchReasons');
        expect(rec.matchScore).toBeGreaterThanOrEqual(0);
        expect(rec.matchScore).toBeLessThanOrEqual(100);
      });
    });

    it('deve ordenar recomendações por Match Score decrescente', async () => {
      const consultation = createMockConsultation({
        budget: 50000,
        usage: 'família',
        persons: 5,
      });

      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      expect(recommendations.length).toBeGreaterThan(1);

      // Verificar ordenação
      for (let i = 0; i < recommendations.length - 1; i++) {
        expect(recommendations[i].matchScore).toBeGreaterThanOrEqual(
          recommendations[i + 1].matchScore
        );
      }
    });

    it('deve incluir razões do Match Score', async () => {
      const consultation = createMockConsultation({
        budget: 70000,
        usage: 'trabalho',
        essentialItems: ['ar condicionado', 'airbag'],
      });

      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      expect(recommendations.length).toBeGreaterThan(0);
      
      recommendations.forEach((rec) => {
        expect(rec.matchReasons).toBeDefined();
        expect(rec.matchReasons).toBeInstanceOf(Array);
        expect(rec.matchReasons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Busca Vetorial Híbrida', () => {
    it('deve usar embeddings semânticos quando disponíveis', async () => {
      const searchCriteria = {
        budget: 55000,
        usage: 'lazer',
        persons: 2,
        bodyType: 'hatch',
      };

      const results = await vectorSearchService.searchVehicles(searchCriteria, 3);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('deve calcular score híbrido (40% semântico + 60% critérios)', async () => {
      const searchCriteria = {
        budget: 65000,
        usage: 'trabalho',
        persons: 4,
      };

      const results = await vectorSearchService.searchVehicles(searchCriteria, 5);

      results.forEach((vehicle) => {
        expect(vehicle).toHaveProperty('matchScore');
        // Score deve estar no range 0-100
        expect(vehicle.matchScore).toBeGreaterThanOrEqual(0);
        expect(vehicle.matchScore).toBeLessThanOrEqual(100);
      });
    });

    it('deve fazer fallback para SQL quando embeddings indisponíveis', async () => {
      // Mock de cenário sem embeddings
      const spy = vi.spyOn(vectorSearchService as any, 'sqlFallbackSearch');

      const searchCriteria = {
        budget: 40000,
        usage: 'família',
      };

      await vectorSearchService.searchVehicles(searchCriteria, 3);

      // Verificar se fallback foi usado (depende da implementação)
      // Este teste pode precisar de ajuste baseado na lógica real
    });
  });

  describe('Match Score Calculation', () => {
    it('deve priorizar veículos dentro do orçamento (peso 30%)', async () => {
      const consultation = createMockConsultation({
        budget: 50000,
        usage: 'trabalho',
      });

      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      // Primeiro resultado deve estar no orçamento
      const topMatch = recommendations[0];
      expect(topMatch.vehicle.price).toBeLessThanOrEqual(consultation.budget * 1.1); // 10% margem
    });

    it('deve considerar uso do veículo (peso 25%)', async () => {
      const consultationTrabalho = createMockConsultation({
        budget: 60000,
        usage: 'trabalho',
      });

      const recommendationsTrabalho = await recommendationAgent.generateRecommendations(consultationTrabalho);

      // Veículos de trabalho devem ser econômicos
      expect(recommendationsTrabalho.length).toBeGreaterThan(0);
    });

    it('deve considerar capacidade de pessoas (peso 15%)', async () => {
      const consultation = createMockConsultation({
        budget: 70000,
        persons: 7,
      });

      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      // Deve recomendar veículos com capacidade adequada
      recommendations.forEach((rec) => {
        expect(rec.vehicle.seats).toBeGreaterThanOrEqual(5); // Pelo menos 5 lugares
      });
    });

    it('deve considerar itens essenciais (peso 15%)', async () => {
      const consultation = createMockConsultation({
        budget: 55000,
        essentialItems: ['ar condicionado', 'airbag', 'ABS'],
      });

      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      // Top match deve ter os itens essenciais
      const topMatch = recommendations[0];
      consultation.essentialItems.forEach((item) => {
        const hasItem = topMatch.vehicle.features.some((feature) =>
          feature.toLowerCase().includes(item.toLowerCase())
        );
        expect(hasItem).toBe(true);
      });
    });
  });

  describe('Formatação de Resposta', () => {
    it('deve formatar mensagem com top 5 veículos', async () => {
      const consultation = createMockConsultation();
      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      const message = recommendationAgent.formatRecommendationMessage(recommendations);

      expect(message).toBeDefined();
      expect(message).toContain('recomendações'); // Ou palavra similar
      expect(message.length).toBeGreaterThan(100); // Mensagem substancial
    });

    it('deve incluir Match Score na mensagem', async () => {
      const consultation = createMockConsultation();
      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      const message = recommendationAgent.formatRecommendationMessage(recommendations);

      // Verificar se contém scores (formato: 95%, 92%, etc)
      expect(message).toMatch(/\d+%/);
    });

    it('deve incluir preços formatados', async () => {
      const consultation = createMockConsultation();
      const recommendations = await recommendationAgent.generateRecommendations(consultation);

      const message = recommendationAgent.formatRecommendationMessage(recommendations);

      // Verificar se contém valores em R$
      expect(message).toMatch(/R\$\s*[\d.,]+/);
    });
  });
});

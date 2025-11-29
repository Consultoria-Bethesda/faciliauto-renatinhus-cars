import { prisma } from '../lib/prisma';
import { chatCompletion, ChatMessage } from '../lib/groq';
import { logger } from '../lib/logger';

interface VehicleMatch {
  vehicle: any;
  matchScore: number;
  reasoning: string;
}

interface LLMVehicleEvaluation {
  vehicleId: string;
  score: number;
  reasoning: string;
  isAdequate: boolean;
}

export class RecommendationAgent {
  async generateRecommendations(
    conversationId: string,
    answers: Record<string, any>
  ): Promise<VehicleMatch[]> {
    try {
      // Get all available vehicles
      const vehicles = await prisma.vehicle.findMany({
        where: { disponivel: true },
      });

      if (vehicles.length === 0) {
        logger.warn('No vehicles available for recommendation');
        return [];
      }

      // Pré-filtrar veículos por critérios objetivos (orçamento, ano, km)
      const filteredVehicles = this.preFilterVehicles(vehicles, answers);
      
      if (filteredVehicles.length === 0) {
        logger.warn('No vehicles passed pre-filter');
        return [];
      }

      // Usar LLM para avaliar adequação ao contexto do usuário
      const evaluatedVehicles = await this.evaluateVehiclesWithLLM(filteredVehicles, answers);

      // Filtrar apenas veículos adequados e ordenar por score
      const matches: VehicleMatch[] = evaluatedVehicles
        .filter(ev => ev.isAdequate && ev.score >= 50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(ev => {
          const vehicle = filteredVehicles.find(v => v.id === ev.vehicleId);
          return {
            vehicle,
            matchScore: ev.score,
            reasoning: ev.reasoning,
          };
        })
        .filter(m => m.vehicle); // Garantir que o veículo existe

      // Save recommendations to database
      for (let i = 0; i < matches.length; i++) {
        await prisma.recommendation.create({
          data: {
            conversationId,
            vehicleId: matches[i].vehicle.id,
            matchScore: matches[i].matchScore,
            reasoning: matches[i].reasoning,
            position: i + 1,
          },
        });
      }

      await prisma.event.create({
        data: {
          conversationId,
          eventType: 'recommendation_sent',
          metadata: JSON.stringify({
            count: matches.length,
            scores: matches.map(m => m.matchScore),
          }),
        },
      });

      logger.info({
        conversationId,
        recommendationsCount: matches.length,
        topScore: matches[0]?.matchScore,
      }, 'Recommendations generated with LLM evaluation');

      return matches;
    } catch (error) {
      logger.error({ error, conversationId }, 'Error generating recommendations');
      return [];
    }
  }

  /**
   * Pré-filtra veículos por critérios objetivos (orçamento, ano, km)
   */
  private preFilterVehicles(vehicles: any[], answers: Record<string, any>): any[] {
    const budget = answers.budget || Infinity;
    const minYear = answers.minYear || 1990;
    const maxKm = answers.maxKm || 500000;

    return vehicles.filter(vehicle => {
      const preco = parseFloat(vehicle.preco);
      // Permitir 10% acima do orçamento para dar opções
      if (preco > budget * 1.1) return false;
      if (vehicle.ano < minYear) return false;
      if (vehicle.km > maxKm) return false;
      return true;
    });
  }

  /**
   * Usa LLM para avaliar adequação dos veículos ao contexto do usuário
   */
  private async evaluateVehiclesWithLLM(
    vehicles: any[],
    answers: Record<string, any>
  ): Promise<LLMVehicleEvaluation[]> {
    // Construir descrição do perfil do usuário
    const userContext = this.buildUserContext(answers);
    
    // Construir lista de veículos para avaliação
    const vehiclesList = vehicles.map(v => ({
      id: v.id,
      descricao: `${v.marca} ${v.modelo} ${v.versao || ''} ${v.ano}, ${v.km.toLocaleString('pt-BR')}km, R$${parseFloat(v.preco).toLocaleString('pt-BR')}, ${v.carroceria}, ${v.combustivel}, ${v.cambio}`,
      carroceria: v.carroceria,
    }));

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Você é um especialista em vendas de veículos. Sua tarefa é avaliar quais veículos são mais adequados para o perfil e necessidade do cliente.

IMPORTANTE: Analise o CONTEXTO DE USO do cliente para determinar adequação:
- Se o cliente menciona "obra", "construção", "carga", "material", "campo", "fazenda", "rural" → PRIORIZE picapes e utilitários
- Se o cliente menciona "família", "crianças", "viagem" → PRIORIZE sedans, SUVs espaçosos
- Se o cliente menciona "cidade", "urbano", "economia" → PRIORIZE hatches compactos
- Se o cliente menciona "trabalho", "visitas", "clientes" → PRIORIZE sedans, hatches confortáveis
- Se o cliente menciona "Uber", "app", "99" → PRIORIZE sedans 4 portas com ar-condicionado

Retorne APENAS um JSON válido no formato:
{
  "evaluations": [
    {"vehicleId": "id", "score": 0-100, "reasoning": "motivo curto", "isAdequate": true/false}
  ]
}

O score deve refletir:
- 90-100: Perfeito para o contexto do cliente
- 70-89: Muito bom, atende bem
- 50-69: Aceitável, pode funcionar
- 0-49: Não adequado para o contexto

Seja RIGOROSO: se o cliente precisa de picape para obra, NÃO recomende sedans/hatches.`
      },
      {
        role: 'user',
        content: `PERFIL DO CLIENTE:
${userContext}

VEÍCULOS DISPONÍVEIS:
${vehiclesList.map((v, i) => `${i + 1}. [${v.id}] ${v.descricao}`).join('\n')}

Avalie cada veículo e retorne o JSON com as avaliações.`
      }
    ];

    try {
      const response = await chatCompletion(messages, {
        temperature: 0.3,
        maxTokens: 1500,
      });

      // Parsear resposta JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('LLM did not return valid JSON');
        return this.fallbackEvaluation(vehicles, answers);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
        logger.error('LLM response missing evaluations array');
        return this.fallbackEvaluation(vehicles, answers);
      }

      logger.info({ evaluationsCount: parsed.evaluations.length }, 'LLM evaluations received');
      
      return parsed.evaluations;
    } catch (error) {
      logger.error({ error }, 'Error in LLM vehicle evaluation');
      return this.fallbackEvaluation(vehicles, answers);
    }
  }

  /**
   * Constrói descrição do contexto do usuário para o LLM
   */
  private buildUserContext(answers: Record<string, any>): string {
    const parts: string[] = [];

    if (answers.budget) {
      parts.push(`- Orçamento: R$ ${answers.budget.toLocaleString('pt-BR')}`);
    }
    if (answers.usage) {
      parts.push(`- Uso principal: ${answers.usage}`);
    }
    if (answers.usageContext) {
      parts.push(`- Contexto detalhado: ${answers.usageContext}`);
    }
    if (answers.people) {
      parts.push(`- Número de pessoas: ${answers.people}`);
    }
    if (answers.minYear) {
      parts.push(`- Ano mínimo: ${answers.minYear}`);
    }
    if (answers.maxKm) {
      parts.push(`- Km máxima: ${answers.maxKm.toLocaleString('pt-BR')}`);
    }
    if (answers.bodyType && answers.bodyType !== 'tanto faz') {
      parts.push(`- Preferência de carroceria: ${answers.bodyType}`);
    }
    if (answers.hasTradeIn) {
      parts.push(`- Tem carro para troca: ${answers.hasTradeIn}`);
    }

    return parts.join('\n');
  }

  /**
   * Avaliação de fallback caso o LLM falhe
   */
  private fallbackEvaluation(vehicles: any[], answers: Record<string, any>): LLMVehicleEvaluation[] {
    return vehicles.map(vehicle => ({
      vehicleId: vehicle.id,
      score: 70, // Score neutro
      reasoning: `${vehicle.marca} ${vehicle.modelo} - Veículo disponível dentro dos critérios.`,
      isAdequate: true,
    }));
  }
}

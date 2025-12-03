import { ConversationState, StateUpdate } from '../../types/state.types';
import { logger } from '../../lib/logger';
import {
  formatRecommendationList,
  formatVehicleDetails,
  getNumberEmoji,
  VehicleRecommendationData,
} from '../../services/message-formatter.service';

/**
 * Format recommendations into WhatsApp message
 * Uses the centralized message-formatter.service
 * Requirements 5.5: Include URL to "MAIS DETALHES" page
 * Requirements 6.1-6.4: Format with marca, modelo, ano, km, preço, URL
 */
function formatRecommendations(recommendations: any[]): string {
  // Convert to VehicleRecommendationData format
  const formattedRecs: VehicleRecommendationData[] = recommendations.map(rec => ({
    vehicleId: rec.vehicleId,
    vehicle: rec.vehicle,
    matchScore: rec.matchScore,
    reasoning: rec.reasoning,
  }));

  return formatRecommendationList(formattedRecs);
}

/**
 * RecommendationNode - Present recommendations to customer
 */
export async function recommendationNode(state: ConversationState): Promise<StateUpdate> {
  logger.info({
    conversationId: state.conversationId,
    recommendationsCount: state.recommendations.length
  }, 'RecommendationNode: Formatting recommendations');

  // Check if user is asking to schedule or talk to human
  const lastMessage = state.messages[state.messages.length - 1];
  const lowerMessage = lastMessage.content.toLowerCase();

  // Handle "agendar" / schedule visit
  if (lowerMessage.includes('agendar') || lowerMessage.includes('visita') || lowerMessage.includes('test drive')) {
    logger.info({ conversationId: state.conversationId }, 'RecommendationNode: Visit requested');

    return {
      messages: [
        ...state.messages,
        {
          role: 'assistant',
          content: `Ótimo! 🎉\n\nVou transferir você para nossa equipe de vendas para agendar sua visita.\n\nUm vendedor entrará em contato em breve para confirmar dia e horário.\n\nObrigado por escolher a Renatinhu's Cars! 🚗`,
          timestamp: new Date(),
        },
      ],
      metadata: {
        ...state.metadata,
        lastMessageAt: new Date(),
        leadQuality: 'hot',
        flags: [...state.metadata.flags, 'visit_requested'],
      },
    };
  }

  // Handle "vendedor" / talk to human
  if (lowerMessage.includes('vendedor') || lowerMessage.includes('humano') || lowerMessage.includes('atendente')) {
    logger.info({ conversationId: state.conversationId }, 'RecommendationNode: Human handoff requested');

    return {
      messages: [
        ...state.messages,
        {
          role: 'assistant',
          content: `Entendi! 👍\n\nVou conectar você com um de nossos vendedores especialistas.\n\nUm momento, por favor. ⏳`,
          timestamp: new Date(),
        },
      ],
      metadata: {
        ...state.metadata,
        lastMessageAt: new Date(),
        flags: [...state.metadata.flags, 'handoff_requested'],
      },
    };
  }

  // Handle vehicle number selection (1-5)
  if (/^[1-5]$/.test(lowerMessage.trim())) {
    const vehicleIndex = parseInt(lowerMessage.trim()) - 1;
    if (vehicleIndex >= 0 && vehicleIndex < state.recommendations.length) {
      const rec = state.recommendations[vehicleIndex];
      const vehicle = rec.vehicle;

      // Use centralized formatter for vehicle details
      const detailsMessage = formatVehicleDetails(vehicle, rec.reasoning);

      return {
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: detailsMessage,
            timestamp: new Date(),
          },
        ],
        metadata: {
          ...state.metadata,
          lastMessageAt: new Date(),
          flags: [...state.metadata.flags, `viewed_vehicle_${rec.vehicleId}`],
        },
      };
    }
  }

  // First time showing recommendations OR user asking for more
  if (state.recommendations.length > 0) {
    const recommendationsMessage = formatRecommendations(state.recommendations);

    return {
      messages: [
        ...state.messages,
        {
          role: 'assistant',
          content: recommendationsMessage,
          timestamp: new Date(),
        },
      ],
      metadata: {
        ...state.metadata,
        lastMessageAt: new Date(),
        leadQuality: state.recommendations[0].matchScore >= 85 ? 'hot' : 'warm',
      },
    };
  }

  // Fallback
  return {
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: 'Como posso ajudar mais?\n\nDigite "vendedor" para falar com nossa equipe.',
        timestamp: new Date(),
      },
    ],
    metadata: {
      ...state.metadata,
      lastMessageAt: new Date(),
    },
  };
}

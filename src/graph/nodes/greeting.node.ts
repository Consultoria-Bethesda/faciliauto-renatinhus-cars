import { ConversationState, StateUpdate } from '../../types/state.types';
import { logger } from '../../lib/logger';
import { DISCLOSURE_MESSAGES } from '../../config/disclosure.messages';

/**
 * GreetingNode - First interaction with the customer
 * ISO 42001 Compliance: Includes AI disclosure in first message
 * 
 * Personalized for Renatinhu's Cars dealership
 * Requirements: 4.1 - Greet customer and ask for their name
 */
export async function greetingNode(state: ConversationState): Promise<StateUpdate> {
  logger.info({ conversationId: state.conversationId }, 'GreetingNode: Starting greeting');

  // Check if this is first message or returning
  const isFirstMessage = state.messages.length <= 1;

  let greetingMessage: string;

  if (isFirstMessage) {
    // ISO 42001: First time greeting with AI disclosure
    // Personalized for Renatinhu's Cars - Ask for customer name first
    greetingMessage = `${DISCLOSURE_MESSAGES.INITIAL_GREETING}

🚗 Temos *27 veículos* seminovos selecionados esperando por você!

Para começar, *qual é o seu nome?* 😊`;
  } else {
    // Returning or continuing conversation
    greetingMessage = `Olá novamente! 👋

Que bom ter você de volta na *Renatinhu's Cars*!

Para continuar, *qual é o seu nome?* 😊`;
  }

  // Update state - transition to discovery node to collect name
  return {
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: greetingMessage,
        timestamp: new Date(),
      },
    ],
    quiz: {
      ...state.quiz,
      currentQuestion: 0, // 0 = waiting for name
      progress: 0,
    },
    graph: {
      ...state.graph,
      currentNode: 'discovery',
      previousNode: 'greeting',
      nodeHistory: [...state.graph.nodeHistory, 'greeting'],
    },
    metadata: {
      ...state.metadata,
      lastMessageAt: new Date(),
    },
  };
}

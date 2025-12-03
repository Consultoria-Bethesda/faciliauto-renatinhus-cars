import { prisma, DatabaseError, isDatabaseError, getDatabaseErrorMessage, logDatabaseError } from '../lib/prisma';
import { cache } from '../lib/redis';
import { logger } from '../lib/logger';
import { guardrails } from './guardrails.service';
import { conversationGraph } from '../graph/conversation-graph';
import { langGraphConversation } from '../graph/langgraph-conversation';
import { ConversationState } from '../types/state.types';
import { dataRightsService } from './data-rights.service';
import { featureFlags } from '../lib/feature-flags';
import { LLMProvidersFailedError, getLLMFailureMessage } from '../lib/llm-router';
import { leadForwardingService } from './lead-forwarding.service';
import { shouldTriggerLeadForwarding } from '../graph/nodes/lead-forwarding.node';

/**
 * MessageHandlerV2 - New implementation using LangGraph
 */
/**
 * Timing metrics for message processing
 * Requirements 10.2: Log timing metrics (total time, LLM time, search time)
 */
interface ProcessingMetrics {
  totalTime: number;
  llmTime: number;
  searchTime: number;
  dbTime: number;
  cacheTime: number;
}

export class MessageHandlerV2 {
  async handleMessage(phoneNumber: string, message: string): Promise<string> {
    // Requirements 10.2: Start timing for total processing
    const startTime = Date.now();
    const metrics: ProcessingMetrics = {
      totalTime: 0,
      llmTime: 0,
      searchTime: 0,
      dbTime: 0,
      cacheTime: 0,
    };

    try {
      // 🛡️ GUARDRAIL: Validate input
      const inputValidation = guardrails.validateInput(phoneNumber, message);
      if (!inputValidation.allowed) {
        logger.warn({ phoneNumber, reason: inputValidation.reason }, 'Input blocked by guardrails');
        return inputValidation.reason || 'Desculpe, não consegui processar sua mensagem.';
      }

      // Use sanitized input
      const sanitizedMessage = inputValidation.sanitizedInput || message;
      const lowerMessage = sanitizedMessage.toLowerCase().trim();

      // 🔄 Check for exit/restart commands (available at any time)
      const exitCommands = ['sair', 'encerrar', 'tchau', 'bye', 'adeus'];
      const restartCommands = ['reiniciar', 'recomeçar', 'voltar', 'cancelar', 'reset', 'nova busca'];
      const greetingCommands = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'hi'];

      if (exitCommands.some(cmd => lowerMessage.includes(cmd))) {
        await this.resetConversation(phoneNumber);
        logger.info({ phoneNumber }, 'User requested exit');
        return `Obrigado por usar a Renatinhu's Cars! 👋

Foi um prazer ajudar você.

Se precisar de algo, é só enviar uma mensagem novamente! 😊

Até logo! 🚗`;
      }

      if (restartCommands.some(cmd => lowerMessage.includes(cmd))) {
        await this.resetConversation(phoneNumber);
        logger.info({ phoneNumber }, 'User requested restart');
        return `🔄 Conversa reiniciada!

👋 Olá! Sou a assistente virtual da *Renatinhu's Cars*.

🤖 *Importante:* Sou uma inteligência artificial e posso cometer erros. Para informações mais precisas, posso transferir você para nossa equipe humana.

💡 _A qualquer momento, digite *sair* para encerrar a conversa._

Para começar, qual é o seu nome?`;
      }

      // 👋 Check for greetings (restart conversation if in the middle)
      const isGreeting = greetingCommands.some(cmd => lowerMessage === cmd || lowerMessage.startsWith(cmd + ' ') || lowerMessage.startsWith(cmd + ','));
      if (isGreeting) {
        // Check if there's an existing conversation
        const existingConversation = await prisma.conversation.findFirst({
          where: { phoneNumber, status: 'active' },
        });

        if (existingConversation) {
          await this.resetConversation(phoneNumber);
          logger.info({ phoneNumber }, 'User sent greeting, restarting conversation');
        }

        return `👋 Olá! Sou a assistente virtual da *Renatinhu's Cars*.

🤖 *Importante:* Sou uma inteligência artificial e posso cometer erros. Para informações mais precisas, posso transferir você para nossa equipe humana.

💡 _A qualquer momento, digite *sair* para encerrar a conversa._

Para começar, qual é o seu nome?`;
      }

      // 🔒 LGPD: Check for data rights commands
      const lgpdResponse = await this.handleDataRightsCommands(phoneNumber, sanitizedMessage);
      if (lgpdResponse) {
        return lgpdResponse;
      }

      // Get or create conversation
      const dbStartTime = Date.now();
      let conversation = await this.getOrCreateConversation(phoneNumber);

      // Log incoming message to database
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'incoming',
          content: sanitizedMessage,
          messageType: 'text',
        },
      });
      metrics.dbTime += Date.now() - dbStartTime;

      // Load state from cache
      const cacheStartTime = Date.now();
      const stateKey = `conversation:${conversation.id}:state`;
      const cachedStateJson = await cache.get(stateKey);
      metrics.cacheTime += Date.now() - cacheStartTime;
      let currentState: ConversationState | undefined;

      if (cachedStateJson) {
        try {
          currentState = JSON.parse(cachedStateJson);
          // Restore Date objects
          currentState.metadata.startedAt = new Date(currentState.metadata.startedAt);
          currentState.metadata.lastMessageAt = new Date(currentState.metadata.lastMessageAt);
          currentState.messages = currentState.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
        } catch (error) {
          logger.error({ error }, 'Error parsing cached state');
          currentState = undefined;
        }
      }

      // 🚦 FEATURE FLAG: Decide between conversational or quiz mode
      const useConversational = featureFlags.shouldUseConversationalMode(phoneNumber);
      const useLangGraph = featureFlags.isEnabled('USE_LANGGRAPH', phoneNumber);

      logger.info({
        conversationId: conversation.id,
        phoneNumber: phoneNumber.substring(0, 8) + '****',
        useConversational,
        useLangGraph,
        hasCache: !!currentState,
        currentNode: currentState?.graph.currentNode,
      }, 'Routing decision');

      let newState: ConversationState;
      let response: string;

      // Requirements 10.2: Track LLM processing time
      const llmStartTime = Date.now();

      if (useLangGraph || useConversational) {
        // 🆕 Use integrated LangGraph + VehicleExpertAgent
        logger.debug({ conversationId: conversation.id }, 'Processing with LangGraph (integrated mode)');

        // Initialize state if new conversation
        if (!currentState) {
          currentState = this.initializeState(conversation.id, phoneNumber);
        }

        const result = await langGraphConversation.processMessage(sanitizedMessage, currentState);
        newState = result.newState;
        response = result.response;

      } else {
        // 📋 Use legacy quiz mode (old LangGraph)
        logger.debug({ conversationId: conversation.id }, 'Processing with legacy quiz mode');

        newState = await conversationGraph.invoke({
          conversationId: conversation.id,
          phoneNumber,
          message: sanitizedMessage,
          currentState,
        });

        response = conversationGraph.getLastResponse(newState);
      }

      metrics.llmTime = Date.now() - llmStartTime;

      // 🛡️ GUARDRAIL: Validate output
      const outputValidation = guardrails.validateOutput(response);
      let finalResponse = response;

      if (!outputValidation.allowed) {
        logger.error({ conversationId: conversation.id, reason: outputValidation.reason }, 'Output blocked by guardrails');
        finalResponse = 'Desculpe, houve um erro ao processar sua solicitação. Por favor, tente novamente ou digite "vendedor" para falar com nossa equipe.';
      }

      // Save state to cache (24h TTL)
      const cacheSaveStart = Date.now();
      await cache.set(stateKey, JSON.stringify(newState), 86400);
      metrics.cacheTime += Date.now() - cacheSaveStart;

      // Update conversation in database
      const dbSaveStart = Date.now();
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          currentStep: newState.graph.currentNode,
          lastMessageAt: new Date(),
          quizAnswers: newState.quiz.isComplete ? JSON.stringify(newState.quiz.answers) : null,
          profileData: newState.profile ? JSON.stringify(newState.profile) : null,
        },
      });

      // Log outgoing message
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'outgoing',
          content: finalResponse,
          messageType: 'text',
        },
      });
      metrics.dbTime += Date.now() - dbSaveStart;

      // If quiz is complete, log event
      if (newState.quiz.isComplete && !currentState?.quiz.isComplete) {
        await prisma.event.create({
          data: {
            conversationId: conversation.id,
            eventType: 'quiz_completed',
            metadata: JSON.stringify({ answers: newState.quiz.answers }),
          },
        });
      }

      // If recommendations were generated, save them
      if (newState.recommendations.length > 0 && (!currentState || currentState.recommendations.length === 0)) {
        for (const rec of newState.recommendations) {
          await prisma.recommendation.create({
            data: {
              conversationId: conversation.id,
              vehicleId: rec.vehicleId,
              matchScore: rec.matchScore,
              reasoning: rec.reasoning,
            },
          }).catch(error => {
            // Ignore duplicate errors
            if (!error.message.includes('Unique constraint')) {
              logger.error({ error }, 'Error saving recommendation');
            }
          });
        }
      }

      // Create lead if conversation reached recommendation stage (legacy flow)
      if (newState.graph.currentNode === 'recommendation' &&
        newState.metadata.flags.includes('visit_requested') &&
        !currentState?.metadata.flags.includes('visit_requested')) {
        await this.createLead(conversation, newState);
      }

      // Requirements 11.1, 11.5: Process lead forwarding when interest is detected
      // Check if lead forwarding should be triggered (new flow)
      if (newState.metadata.flags.includes('lead_pending') &&
        !currentState?.metadata.flags.includes('lead_captured') &&
        !newState.metadata.flags.includes('lead_captured')) {
        await this.processLeadForwarding(newState, conversation.id);
      }

      // Requirements 10.2: Log timing metrics
      metrics.totalTime = Date.now() - startTime;
      logger.info({
        conversationId: conversation.id,
        phoneNumber: phoneNumber.substring(0, 8) + '****',
        metrics: {
          totalTimeMs: metrics.totalTime,
          llmTimeMs: metrics.llmTime,
          dbTimeMs: metrics.dbTime,
          cacheTimeMs: metrics.cacheTime,
        },
        currentNode: newState.graph.currentNode,
        messageLength: sanitizedMessage.length,
        responseLength: finalResponse.length,
      }, '⏱️ Message processing completed');

      return finalResponse;

    } catch (error) {
      // Requirements 7.1, 7.2: Handle LLM provider failures with friendly message
      if (error instanceof LLMProvidersFailedError) {
        logger.error({ error, phoneNumber }, 'All LLM providers failed');
        return getLLMFailureMessage();
      }

      // Requirements 7.4, 7.5: Handle database errors with service unavailable message and full logging
      if (isDatabaseError(error)) {
        logDatabaseError(error, 'handleMessage', { phoneNumber });
        return getDatabaseErrorMessage();
      }

      logger.error({ error, phoneNumber }, 'Error handling message');
      return 'Desculpe, ocorreu um erro. Por favor, tente novamente ou digite *vendedor* para falar com nossa equipe.';
    }
  }

  /**
   * Initialize conversation state for new conversations
   */
  private initializeState(conversationId: string, phoneNumber: string): ConversationState {
    return {
      conversationId,
      phoneNumber,
      messages: [],
      quiz: {
        currentQuestion: 1,
        progress: 0,
        answers: {},
        isComplete: false,
      },
      profile: {}, // Initialize as empty object instead of null
      recommendations: [],
      graph: {
        currentNode: 'greeting',
        nodeHistory: [],
        errorCount: 0,
        loopCount: 0,
      },
      metadata: {
        startedAt: new Date(),
        lastMessageAt: new Date(),
        flags: [],
      },
    };
  }

  private async getOrCreateConversation(phoneNumber: string) {
    // Check for existing active conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        phoneNumber,
        status: 'active',
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!conversation) {
      // Create new conversation
      conversation = await prisma.conversation.create({
        data: {
          phoneNumber,
          status: 'active',
          currentStep: 'greeting',
        },
      });

      // Log event
      await prisma.event.create({
        data: {
          conversationId: conversation.id,
          eventType: 'started',
        },
      });

      logger.info({ conversationId: conversation.id, phoneNumber }, 'New conversation created');
    }

    return conversation;
  }

  private async createLead(conversation: any, state: ConversationState) {
    try {
      const answers = state.quiz.answers;
      const profile = state.profile;

      await prisma.lead.create({
        data: {
          conversationId: conversation.id,
          name: conversation.customerName || 'Cliente WhatsApp',
          phone: conversation.phoneNumber,
          budget: answers.budget || profile?.budget || null,
          usage: answers.usage || null,
          people: answers.people || null,
          hasTradeIn: answers.hasTradeIn || false,
          urgency: answers.urgency || null,
          status: 'new',
          source: 'whatsapp_bot',
        },
      });

      logger.info({ conversationId: conversation.id }, 'Lead created');
    } catch (error) {
      logger.error({ error, conversationId: conversation.id }, 'Error creating lead');
    }
  }

  /**
   * Reset/clear conversation for a phone number
   */
  private async resetConversation(phoneNumber: string): Promise<void> {
    try {
      // Find all conversations for this phone
      const conversations = await prisma.conversation.findMany({
        where: { phoneNumber },
      });

      // Clear cache for each conversation
      for (const conv of conversations) {
        const stateKey = `conversation:${conv.id}:state`;
        await cache.del(stateKey);
      }

      // Delete or mark conversations as closed
      await prisma.conversation.updateMany({
        where: {
          phoneNumber,
          status: 'active'
        },
        data: {
          status: 'closed',
          closedAt: new Date()
        }
      });

      logger.info({ phoneNumber, count: conversations.length }, 'Conversation reset');
    } catch (error) {
      logger.error({ error, phoneNumber }, 'Error resetting conversation');
    }
  }

  /**
   * LGPD Compliance: Handle data rights commands
   * Art. 18 - Direitos do titular (esquecimento, portabilidade)
   */
  private async handleDataRightsCommands(phoneNumber: string, message: string): Promise<string | null> {
    const lowerMessage = message.toLowerCase().trim();

    // Check for pending confirmation
    const confirmationKey = `lgpd:confirmation:${phoneNumber}`;
    const pendingAction = await cache.get(confirmationKey);

    // Handle confirmation responses
    if (pendingAction) {
      if (lowerMessage === 'sim') {
        await cache.del(confirmationKey);

        if (pendingAction === 'DELETE_DATA') {
          logger.info({ phoneNumber }, 'LGPD: User confirmed data deletion');
          const success = await dataRightsService.deleteUserData(phoneNumber);

          if (success) {
            return '✅ Seus dados foram excluídos com sucesso!\n\nObrigado por usar a Renatinhu\'s Cars. Se precisar de algo no futuro, estaremos aqui! 👋';
          } else {
            return '❌ Desculpe, houve um erro ao excluir seus dados. Por favor, entre em contato com nosso suporte: suporte@faciliauto.com.br';
          }
        }
      } else if (lowerMessage === 'não' || lowerMessage === 'nao' || lowerMessage === 'cancelar') {
        await cache.del(confirmationKey);
        return '✅ Operação cancelada. Como posso ajudar você?';
      } else {
        return '⚠️ Por favor, responda *SIM* para confirmar ou *NÃO* para cancelar.';
      }
    }

    // Check for data deletion command
    if (lowerMessage.includes('deletar meus dados') ||
      lowerMessage.includes('excluir meus dados') ||
      lowerMessage.includes('remover meus dados') ||
      lowerMessage.includes('apagar meus dados')) {

      logger.info({ phoneNumber }, 'LGPD: Data deletion request received');

      // Check if user has data
      const hasData = await dataRightsService.hasUserData(phoneNumber);
      if (!hasData) {
        return '✅ Não encontramos dados associados ao seu número.';
      }

      // Set pending confirmation (expires in 5 minutes)
      await cache.set(confirmationKey, 'DELETE_DATA', 300);

      return `⚠️ *Confirmação de Exclusão de Dados*

Você solicitou a exclusão de todos os seus dados pessoais (LGPD Art. 18).

Isso incluirá:
• Histórico de conversas
• Recomendações de veículos
• Informações de cadastro

Esta ação é *irreversível*.

Tem certeza que deseja continuar?

Digite *SIM* para confirmar ou *NÃO* para cancelar.

_Esta confirmação expira em 5 minutos._`;
    }

    // Check for data export command
    if (lowerMessage.includes('exportar meus dados') ||
      lowerMessage.includes('baixar meus dados') ||
      lowerMessage.includes('meus dados')) {

      logger.info({ phoneNumber }, 'LGPD: Data export request received');

      try {
        const data = await dataRightsService.exportUserData(phoneNumber);

        // Note: WhatsApp Cloud API can send documents
        // For now, we'll provide a summary
        return `✅ *Seus Dados Pessoais (LGPD Art. 18)*

📊 *Resumo:*
• Total de registros: ${data.totalRegistros}
• Mensagens trocadas: ${data.mensagens.length}
• Recomendações: ${data.recomendacoes.length}
• Status: ${data.conversa?.status || 'N/A'}

📧 Para receber seus dados completos em formato JSON, por favor entre em contato:
• Email: privacidade@faciliauto.com.br
• Assunto: "Exportação de Dados - ${phoneNumber}"

Responderemos em até 15 dias úteis, conforme LGPD.`;
      } catch (error) {
        logger.error({ error, phoneNumber }, 'LGPD: Error exporting data');
        return '❌ Desculpe, houve um erro ao exportar seus dados. Por favor, tente novamente ou contate suporte@faciliauto.com.br';
      }
    }

    // No data rights command detected
    return null;
  }

  /**
   * Process lead forwarding when interest is detected
   * Requirements 11.1, 11.3, 11.5: Detect interest, send to seller, confirm to customer
   * 
   * @param state - Current conversation state with interest detected
   * @param conversationId - Conversation ID for logging
   */
  private async processLeadForwarding(state: ConversationState, conversationId: string): Promise<void> {
    try {
      // Check if service is configured
      if (!leadForwardingService.isConfigured()) {
        logger.warn({ conversationId }, 'Lead forwarding: SELLER_WHATSAPP_NUMBER not configured');
        return;
      }

      // Check if we have recommendations
      if (!state.recommendations || state.recommendations.length === 0) {
        logger.warn({ conversationId }, 'Lead forwarding: No recommendations available');
        return;
      }

      // Get the interested vehicle from metadata or default to first
      const interestedVehicleIndex = (state.metadata as any).interestedVehicleIndex || 1;
      const vehicleRec = state.recommendations[interestedVehicleIndex - 1];

      if (!vehicleRec || !vehicleRec.vehicle) {
        logger.warn({ conversationId, interestedVehicleIndex }, 'Lead forwarding: Vehicle not found');
        return;
      }

      // Capture lead data
      const customerName = state.profile?.customerName || 'Cliente';
      const lead = await leadForwardingService.captureLead(
        state.phoneNumber,
        customerName,
        vehicleRec as any,
        state
      );

      // Persist lead to database
      const persistedLead = await leadForwardingService.persistLead(lead);

      // Create a simple WhatsApp service wrapper for sending
      // Note: We import WhatsAppMetaService dynamically to avoid circular dependency
      const WhatsAppMetaService = (await import('./whatsapp-meta.service')).default;
      const whatsappService = new WhatsAppMetaService();

      // Send lead to seller
      const sendResult = await leadForwardingService.sendToSeller(persistedLead, {
        sendMessage: async (to: string, text: string) => {
          await whatsappService.sendMessage(to, text);
        },
      });

      // Update lead status based on send result
      await leadForwardingService.updateLeadStatus(
        persistedLead.id!,
        sendResult.success ? 'sent' : 'failed'
      );

      // Log event
      await prisma.event.create({
        data: {
          conversationId,
          eventType: 'lead_forwarded',
          metadata: JSON.stringify({
            leadId: persistedLead.id,
            vehicleId: vehicleRec.vehicleId,
            sendSuccess: sendResult.success,
            attempts: sendResult.attempts,
          }),
        },
      });

      logger.info({
        conversationId,
        leadId: persistedLead.id,
        vehicleId: vehicleRec.vehicleId,
        sendSuccess: sendResult.success,
      }, '📤 Lead forwarded to seller');

    } catch (error) {
      logger.error({ error, conversationId }, '❌ Error processing lead forwarding');
      // Don't throw - lead forwarding failure shouldn't break the conversation
    }
  }
}

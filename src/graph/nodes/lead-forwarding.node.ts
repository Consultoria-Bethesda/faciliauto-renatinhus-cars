/**
 * Lead Forwarding Node
 * 
 * Detects customer interest in vehicles and forwards qualified leads to seller
 * 
 * Requirements:
 * - 11.1: Detect interest expressions (quero esse, tenho interesse, etc.)
 * - 11.5: Confirm to customer that seller will contact them
 */

import { ConversationState, StateUpdate } from '../../types/state.types';
import { logger } from '../../lib/logger';
import {
    leadForwardingService,
    InterestDetectionResult,
    LeadData,
} from '../../services/lead-forwarding.service';

/**
 * Result from lead forwarding node processing
 */
export interface LeadForwardingResult {
    shouldForward: boolean;
    detection: InterestDetectionResult;
    lead?: LeadData;
    confirmationMessage?: string;
}

/**
 * Process lead forwarding for a conversation
 * Called when interest is detected in the recommendation/follow-up phase
 * 
 * @param state - Current conversation state
 * @param whatsappService - WhatsApp service for sending messages to seller
 * @returns Lead forwarding result with confirmation message if lead was captured
 */
export async function processLeadForwarding(
    state: ConversationState,
    whatsappService: { sendMessage: (to: string, text: string) => Promise<void> }
): Promise<LeadForwardingResult> {
    // Get the last user message
    const userMessages = state.messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
        return {
            shouldForward: false,
            detection: { hasInterest: false, confidence: 0 },
        };
    }

    const lastMessage = userMessages[userMessages.length - 1].content;

    // Detect interest
    const detection = leadForwardingService.detectInterest(lastMessage, state);

    if (!detection.hasInterest || detection.confidence < 0.7) {
        return {
            shouldForward: false,
            detection,
        };
    }

    // Check if we have recommendations to reference
    if (!state.recommendations || state.recommendations.length === 0) {
        logger.warn({
            conversationId: state.conversationId,
        }, 'LeadForwardingNode: Interest detected but no recommendations available');

        return {
            shouldForward: false,
            detection,
        };
    }

    // Check if service is configured
    if (!leadForwardingService.isConfigured()) {
        logger.warn({
            conversationId: state.conversationId,
        }, 'LeadForwardingNode: SELLER_WHATSAPP_NUMBER not configured');

        return {
            shouldForward: false,
            detection,
        };
    }

    // Get the vehicle of interest
    const vehicleIndex = detection.vehicleIndex || 1;
    const vehicleRec = state.recommendations[vehicleIndex - 1];

    if (!vehicleRec || !vehicleRec.vehicle) {
        logger.warn({
            conversationId: state.conversationId,
            vehicleIndex,
        }, 'LeadForwardingNode: Vehicle not found at index');

        return {
            shouldForward: false,
            detection,
        };
    }

    try {
        // Capture lead
        const customerName = state.profile?.customerName || 'Cliente';
        const lead = await leadForwardingService.captureLead(
            state.phoneNumber,
            customerName,
            vehicleRec as any,
            state
        );

        // Persist lead
        const persistedLead = await leadForwardingService.persistLead(lead);

        // Send to seller
        const sendResult = await leadForwardingService.sendToSeller(persistedLead, whatsappService);

        // Update status based on send result
        await leadForwardingService.updateLeadStatus(
            persistedLead.id!,
            sendResult.success ? 'sent' : 'failed'
        );

        // Generate confirmation message for customer
        const vehicleName = `${lead.vehicle.marca} ${lead.vehicle.modelo} ${lead.vehicle.ano}`;
        const confirmationMessage = leadForwardingService.formatCustomerConfirmation(customerName, vehicleName);

        logger.info({
            conversationId: state.conversationId,
            leadId: persistedLead.id,
            vehicleId: vehicleRec.vehicleId,
            sendSuccess: sendResult.success,
        }, 'LeadForwardingNode: Lead processed successfully');

        return {
            shouldForward: true,
            detection,
            lead: persistedLead,
            confirmationMessage,
        };
    } catch (error) {
        logger.error({
            error,
            conversationId: state.conversationId,
        }, 'LeadForwardingNode: Error processing lead');

        return {
            shouldForward: false,
            detection,
        };
    }
}

/**
 * Lead Forwarding Node for LangGraph
 * Processes interest detection and lead forwarding
 * 
 * @param state - Current conversation state
 * @returns State update with confirmation message if lead was captured
 */
export async function leadForwardingNode(state: ConversationState): Promise<StateUpdate> {
    logger.info({
        conversationId: state.conversationId,
        recommendationsCount: state.recommendations.length,
    }, 'LeadForwardingNode: Processing');

    // Get the last user message
    const userMessages = state.messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
        return {
            metadata: {
                ...state.metadata,
                lastMessageAt: new Date(),
            },
        };
    }

    const lastMessage = userMessages[userMessages.length - 1].content;

    // Detect interest
    const detection = leadForwardingService.detectInterest(lastMessage, state);

    if (!detection.hasInterest || detection.confidence < 0.7) {
        // No interest detected, return without changes
        return {
            metadata: {
                ...state.metadata,
                lastMessageAt: new Date(),
            },
        };
    }

    // Check if we have recommendations
    if (!state.recommendations || state.recommendations.length === 0) {
        return {
            messages: [
                ...state.messages,
                {
                    role: 'assistant',
                    content: 'Ainda não temos recomendações para você. Me conta mais sobre o que você procura! 🚗',
                    timestamp: new Date(),
                },
            ],
            metadata: {
                ...state.metadata,
                lastMessageAt: new Date(),
            },
        };
    }

    // Check if service is configured
    if (!leadForwardingService.isConfigured()) {
        logger.warn({
            conversationId: state.conversationId,
        }, 'LeadForwardingNode: SELLER_WHATSAPP_NUMBER not configured, using fallback message');

        return {
            messages: [
                ...state.messages,
                {
                    role: 'assistant',
                    content: `Ótimo! 🎉\n\nVou transferir você para nossa equipe de vendas.\n\nUm vendedor entrará em contato em breve!\n\nObrigado por escolher a Renatinhu's Cars! 🚗`,
                    timestamp: new Date(),
                },
            ],
            metadata: {
                ...state.metadata,
                lastMessageAt: new Date(),
                flags: [...state.metadata.flags, 'interest_detected', 'handoff_requested'],
            },
        };
    }

    // Get the vehicle of interest
    const vehicleIndex = detection.vehicleIndex || 1;
    const vehicleRec = state.recommendations[vehicleIndex - 1];

    if (!vehicleRec || !vehicleRec.vehicle) {
        return {
            messages: [
                ...state.messages,
                {
                    role: 'assistant',
                    content: 'Qual veículo te interessou? Digite o número (1-5) para eu registrar seu interesse! 😊',
                    timestamp: new Date(),
                },
            ],
            metadata: {
                ...state.metadata,
                lastMessageAt: new Date(),
            },
        };
    }

    // Generate confirmation message (actual sending happens in message handler)
    const customerName = state.profile?.customerName || 'Cliente';
    const vehicleName = `${vehicleRec.vehicle.marca} ${vehicleRec.vehicle.modelo} ${vehicleRec.vehicle.ano}`;
    const confirmationMessage = leadForwardingService.formatCustomerConfirmation(customerName, vehicleName);

    return {
        messages: [
            ...state.messages,
            {
                role: 'assistant',
                content: confirmationMessage,
                timestamp: new Date(),
            },
        ],
        metadata: {
            ...state.metadata,
            lastMessageAt: new Date(),
            flags: [
                ...state.metadata.flags,
                'interest_detected',
                'lead_captured',
                `interested_vehicle_${vehicleRec.vehicleId}`,
            ],
        },
    };
}

/**
 * Check if lead forwarding should be triggered
 * Used by the conversation graph to decide routing
 * 
 * @param state - Current conversation state
 * @returns true if interest is detected and lead should be forwarded
 */
export function shouldTriggerLeadForwarding(state: ConversationState): boolean {
    // Only trigger in recommendation or follow-up states
    const validStates = ['RECOMMENDATION', 'FOLLOW_UP', 'recommendation', 'follow_up'];
    if (!validStates.includes(state.graph.currentNode)) {
        return false;
    }

    // Check if we have recommendations
    if (!state.recommendations || state.recommendations.length === 0) {
        return false;
    }

    // Check if lead was already captured in this conversation
    if (state.metadata.flags.includes('lead_captured')) {
        return false;
    }

    // Get the last user message
    const userMessages = state.messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
        return false;
    }

    const lastMessage = userMessages[userMessages.length - 1].content;

    // Detect interest
    const detection = leadForwardingService.detectInterest(lastMessage, state);

    return detection.hasInterest && detection.confidence >= 0.7;
}

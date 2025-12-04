/**
 * Lead Forwarding Service
 * 
 * Detects customer interest, captures lead data, and forwards to seller
 * 
 * Requirements:
 * - 11.1: Detect interest expressions (quero esse, tenho interesse, etc.)
 * - 11.2: Capture lead data (name, phone, vehicle, conversation summary)
 * - 11.3: Send lead to configured seller WhatsApp number
 * - 11.4: Format lead message with all required information
 * - 11.5: Confirm to customer that seller will contact them
 * - 11.6: Retry with exponential backoff (up to 3 attempts)
 * - 11.7: Persist lead to database with status tracking
 */

import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { chatCompletion, ChatMessage } from '../lib/llm-router';
import { ConversationState, CustomerProfile, VehicleRecommendation } from '../types/state.types';
import { formatPrice } from './message-formatter.service';

// Constants
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Interest detection patterns
 * Requirements 11.1: Detect expressions like "quero esse", "tenho interesse", etc.
 */
const INTEREST_PATTERNS = [
    'quero esse',
    'quero este',
    'tenho interesse',
    'me interessei',
    'gostei desse',
    'gostei deste',
    'gostei do',
    'quero agendar',
    'quero visitar',
    'quero ver esse',
    'quero ver este',
    'pode me passar',
    'quero mais informações',
    'quero falar com vendedor',
    'quero comprar',
    'vou querer',
    'vou levar',
    'fechado',
    'fechar negócio',
    'quero conhecer',
    'quero saber mais',
    'me interessa',
    'interessado',
    'interessada',
];

/**
 * Vehicle reference patterns to identify which vehicle (1-5)
 */
const VEHICLE_REFERENCE_PATTERNS = [
    { pattern: /\b(primeiro|1|um|1️⃣)\b/i, index: 1 },
    { pattern: /\b(segundo|2|dois|2️⃣)\b/i, index: 2 },
    { pattern: /\b(terceiro|3|três|tres|3️⃣)\b/i, index: 3 },
    { pattern: /\b(quarto|4|quatro|4️⃣)\b/i, index: 4 },
    { pattern: /\b(quinto|5|cinco|5️⃣)\b/i, index: 5 },
];

/**
 * Result from interest detection
 */
export interface InterestDetectionResult {
    hasInterest: boolean;
    vehicleIndex?: number;  // Which vehicle from recommendations (1-5)
    intentType?: 'purchase' | 'visit' | 'info' | 'contact';
    confidence: number;  // 0-1
    matchedPattern?: string;
}

/**
 * Lead data structure
 */
export interface LeadData {
    id?: string;
    customerName: string;
    customerPhone: string;
    vehicleId: string;
    vehicle: {
        marca: string;
        modelo: string;
        ano: number;
        preco: number;
        url?: string;
    };
    conversationSummary: string;
    customerPreferences?: CustomerProfile;
    capturedAt: Date;
    status: 'pending' | 'sent' | 'failed' | 'contacted';
    sellerPhone: string;
}

/**
 * Send result
 */
export interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
    attempts: number;
}


/**
 * Lead Forwarding Service Class
 */
export class LeadForwardingService {
    private sellerPhone: string;

    constructor() {
        this.sellerPhone = process.env.SELLER_WHATSAPP_NUMBER || '';

        if (!this.sellerPhone) {
            logger.warn('⚠️ SELLER_WHATSAPP_NUMBER not configured. Lead forwarding will not work.');
        } else {
            logger.info('✅ Lead Forwarding Service initialized', {
                sellerPhone: this.sellerPhone.substring(0, 6) + '...',
            });
        }
    }

    /**
     * Detect if a message expresses interest in a vehicle
     * Requirements 11.1: Detect interest expressions
     * 
     * @param message - Customer message to analyze
     * @param context - Conversation state for context
     * @returns Interest detection result with confidence score
     */
    detectInterest(message: string, context?: ConversationState): InterestDetectionResult {
        const normalizedMessage = message.toLowerCase().trim();

        // Check for interest patterns
        let hasInterest = false;
        let matchedPattern: string | undefined;
        let intentType: InterestDetectionResult['intentType'];
        let confidence = 0;

        for (const pattern of INTEREST_PATTERNS) {
            if (normalizedMessage.includes(pattern)) {
                hasInterest = true;
                matchedPattern = pattern;

                // Determine intent type based on pattern
                if (pattern.includes('comprar') || pattern.includes('levar') || pattern.includes('fechado') || pattern.includes('fechar')) {
                    intentType = 'purchase';
                    confidence = 0.95;
                } else if (pattern.includes('agendar') || pattern.includes('visitar') || pattern.includes('conhecer')) {
                    intentType = 'visit';
                    confidence = 0.9;
                } else if (pattern.includes('vendedor') || pattern.includes('passar')) {
                    intentType = 'contact';
                    confidence = 0.85;
                } else if (pattern.includes('informações') || pattern.includes('saber mais')) {
                    intentType = 'info';
                    confidence = 0.75;
                } else {
                    intentType = 'info';
                    confidence = 0.8;
                }

                break;
            }
        }

        // If no interest detected, return early
        if (!hasInterest) {
            return {
                hasInterest: false,
                confidence: 0,
            };
        }

        // Try to identify which vehicle (1-5)
        let vehicleIndex: number | undefined;

        for (const ref of VEHICLE_REFERENCE_PATTERNS) {
            if (ref.pattern.test(normalizedMessage)) {
                vehicleIndex = ref.index;
                break;
            }
        }

        // If no specific vehicle mentioned but we have recommendations, default to first
        if (!vehicleIndex && context?.recommendations && context.recommendations.length > 0) {
            // Check if message mentions "esse" or "este" without number - likely referring to last shown
            if (normalizedMessage.includes('esse') || normalizedMessage.includes('este') || normalizedMessage.includes('desse') || normalizedMessage.includes('deste')) {
                vehicleIndex = 1; // Default to first recommendation
                confidence = Math.max(confidence - 0.1, 0.7); // Slightly lower confidence
            }
        }

        logger.info('🎯 Interest detected', {
            hasInterest,
            vehicleIndex,
            intentType,
            confidence,
            matchedPattern,
        });

        return {
            hasInterest,
            vehicleIndex,
            intentType,
            confidence,
            matchedPattern,
        };
    }

    /**
     * Capture lead data from conversation
     * Requirements 11.2: Collect customer name, phone, vehicle, conversation summary
     * 
     * @param customerPhone - Customer's phone number
     * @param customerName - Customer's name
     * @param vehicle - Vehicle of interest
     * @param conversationState - Full conversation state
     * @returns Captured lead data
     */
    async captureLead(
        customerPhone: string,
        customerName: string,
        vehicle: VehicleRecommendation & { vehicle: any },
        conversationState: ConversationState
    ): Promise<LeadData> {
        // Generate conversation summary using LLM
        const conversationSummary = await this.generateConversationSummary(conversationState);

        const leadData: LeadData = {
            customerName: customerName || 'Cliente',
            customerPhone,
            vehicleId: vehicle.vehicleId,
            vehicle: {
                marca: vehicle.vehicle.marca,
                modelo: vehicle.vehicle.modelo,
                ano: vehicle.vehicle.ano,
                preco: vehicle.vehicle.preco,
                url: vehicle.vehicle.url,
            },
            conversationSummary,
            customerPreferences: conversationState.profile || undefined,
            capturedAt: new Date(),
            status: 'pending',
            sellerPhone: this.sellerPhone,
        };

        logger.info('📋 Lead captured', {
            customerName: leadData.customerName,
            customerPhone: customerPhone.substring(0, 6) + '...',
            vehicle: `${leadData.vehicle.marca} ${leadData.vehicle.modelo}`,
        });

        return leadData;
    }

    /**
     * Generate a summary of the conversation using LLM
     */
    private async generateConversationSummary(state: ConversationState): Promise<string> {
        try {
            // Build conversation text from messages
            const conversationText = state.messages
                .slice(-10) // Last 10 messages
                .map(m => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`)
                .join('\n');

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: 'Você é um assistente que resume conversas de forma concisa. Responda apenas com o resumo, sem introduções.',
                },
                {
                    role: 'user',
                    content: `Resuma em 2-3 frases a conversa abaixo, focando nas preferências e necessidades do cliente:\n\n${conversationText}`,
                },
            ];

            const summary = await chatCompletion(messages, {
                maxTokens: 150,
                temperature: 0.3,
            });

            return summary.trim();
        } catch (error) {
            logger.warn({ error }, 'Failed to generate conversation summary, using fallback');

            // Fallback: create simple summary from profile
            const profile = state.profile;
            if (profile) {
                const parts: string[] = [];
                if (profile.budget) parts.push(`Orçamento: ${formatPrice(profile.budget)}`);
                if (profile.usage) parts.push(`Uso: ${profile.usage}`);
                if (profile.bodyType) parts.push(`Tipo: ${profile.bodyType}`);
                return parts.length > 0 ? parts.join('. ') : 'Cliente interessado em veículo.';
            }

            return 'Cliente interessado em veículo.';
        }
    }


    /**
     * Format lead message for seller
     * Requirements 11.4: Include name, phone (clickable), vehicle details, preferences, timestamp
     * 
     * @param lead - Lead data to format
     * @returns Formatted message string for WhatsApp
     */
    formatLeadMessage(lead: LeadData): string {
        const lines: string[] = [];

        // Header
        lines.push('🔔 *NOVO LEAD - FaciliAuto Bot*');
        lines.push('━━━━━━━━━━━━━━━━━━━━━');
        lines.push('');

        // Customer info
        lines.push('👤 *Cliente:*');
        lines.push(`   Nome: ${lead.customerName}`);
        lines.push(`   📱 WhatsApp: wa.me/${lead.customerPhone.replace(/\D/g, '')}`);
        lines.push('');

        // Vehicle of interest
        lines.push('🚗 *Veículo de Interesse:*');
        lines.push(`   ${lead.vehicle.marca} ${lead.vehicle.modelo} ${lead.vehicle.ano}`);
        lines.push(`   💰 ${formatPrice(lead.vehicle.preco)}`);
        if (lead.vehicle.url) {
            lines.push(`   🔗 ${lead.vehicle.url}`);
        }
        lines.push('');

        // Customer preferences summary
        if (lead.customerPreferences) {
            lines.push('📋 *Preferências do Cliente:*');
            const prefs = lead.customerPreferences;
            if (prefs.budget) lines.push(`   • Orçamento: ${formatPrice(prefs.budget)}`);
            if (prefs.usage) lines.push(`   • Uso: ${prefs.usage}`);
            if (prefs.bodyType) lines.push(`   • Tipo: ${prefs.bodyType}`);
            if (prefs.transmission) lines.push(`   • Câmbio: ${prefs.transmission}`);
            if (prefs.hasTradeIn) lines.push(`   • Tem carro para troca: Sim`);
            lines.push('');

            // Financing information
            if (prefs.wantsFinancing) {
                lines.push('💳 *Financiamento:*');
                lines.push(`   • Quer financiar: Sim`);
                if (prefs.downPayment) {
                    lines.push(`   • Entrada: ${formatPrice(prefs.downPayment)}`);
                }
                if (prefs.downPaymentPercentage) {
                    lines.push(`   • Entrada: ${prefs.downPaymentPercentage}%`);
                }
                if (prefs.maxInstallment) {
                    lines.push(`   • Parcela máxima: ${formatPrice(prefs.maxInstallment)}`);
                }
                if (prefs.installmentMonths) {
                    lines.push(`   • Prazo desejado: ${prefs.installmentMonths} meses`);
                }
                lines.push('');
            }
        }

        // Conversation summary
        if (lead.conversationSummary) {
            lines.push('💬 *Resumo da Conversa:*');
            lines.push(`   ${lead.conversationSummary}`);
            lines.push('');
        }

        // Timestamp
        lines.push('━━━━━━━━━━━━━━━━━━━━━');
        const timestamp = lead.capturedAt.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
        lines.push(`📅 Capturado em: ${timestamp}`);
        lines.push('');
        lines.push('⚡ _Entre em contato o mais rápido possível!_');

        return lines.join('\n');
    }

    /**
     * Send lead to seller with retry and exponential backoff
     * Requirements 11.3, 11.6: Send to SELLER_WHATSAPP_NUMBER with retry
     * 
     * @param lead - Lead data to send
     * @param whatsappService - WhatsApp service instance for sending
     * @returns Send result with success status
     */
    async sendToSeller(
        lead: LeadData,
        whatsappService: { sendMessage: (to: string, text: string) => Promise<void> }
    ): Promise<SendResult> {
        if (!this.sellerPhone) {
            logger.error('❌ Cannot send lead: SELLER_WHATSAPP_NUMBER not configured');
            return {
                success: false,
                error: 'SELLER_WHATSAPP_NUMBER not configured',
                attempts: 0,
            };
        }

        const message = this.formatLeadMessage(lead);
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                logger.info(`📤 Sending lead to seller (attempt ${attempt}/${MAX_RETRIES})`, {
                    leadId: lead.id,
                    sellerPhone: this.sellerPhone.substring(0, 6) + '...',
                });

                await whatsappService.sendMessage(this.sellerPhone, message);

                logger.info('✅ Lead sent to seller successfully', {
                    leadId: lead.id,
                    attempts: attempt,
                });

                return {
                    success: true,
                    attempts: attempt,
                };
            } catch (error) {
                lastError = error as Error;
                logger.warn({
                    leadId: lead.id,
                    attempt,
                    error: (error as Error).message,
                }, `⚠️ Failed to send lead (attempt ${attempt}/${MAX_RETRIES})`);

                if (attempt < MAX_RETRIES) {
                    const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
                    logger.info(`⏳ Waiting ${backoffMs}ms before retry...`);
                    await this.sleep(backoffMs);
                }
            }
        }

        logger.error({
            leadId: lead.id,
            error: lastError?.message,
            attempts: MAX_RETRIES,
        }, '❌ Failed to send lead after all retries');

        return {
            success: false,
            error: lastError?.message || 'Unknown error',
            attempts: MAX_RETRIES,
        };
    }

    /**
     * Persist lead to database
     * Requirements 11.7: Save with status "pending"
     * 
     * @param lead - Lead data to persist
     * @returns Persisted lead with ID
     */
    async persistLead(lead: LeadData): Promise<LeadData> {
        try {
            const dbLead = await prisma.lead.create({
                data: {
                    customerName: lead.customerName,
                    customerPhone: lead.customerPhone,
                    vehicleId: lead.vehicleId,
                    vehicleMarca: lead.vehicle.marca,
                    vehicleModelo: lead.vehicle.modelo,
                    vehicleAno: lead.vehicle.ano,
                    vehiclePreco: lead.vehicle.preco,
                    vehicleUrl: lead.vehicle.url,
                    conversationSummary: lead.conversationSummary,
                    customerPreferences: lead.customerPreferences ? JSON.stringify(lead.customerPreferences) : null,
                    status: 'pending',
                    sellerPhone: lead.sellerPhone,
                    capturedAt: lead.capturedAt,
                },
            });

            logger.info('💾 Lead persisted to database', {
                leadId: dbLead.id,
                status: dbLead.status,
            });

            return {
                ...lead,
                id: dbLead.id,
            };
        } catch (error) {
            logger.error({ error, lead }, '❌ Failed to persist lead');
            throw error;
        }
    }

    /**
     * Update lead status
     * Requirements 11.7: Update status to "sent" or "failed"
     * 
     * @param leadId - Lead ID to update
     * @param status - New status
     */
    async updateLeadStatus(leadId: string, status: LeadData['status']): Promise<void> {
        try {
            const updateData: any = { status };

            if (status === 'sent') {
                updateData.sentAt = new Date();
            } else if (status === 'contacted') {
                updateData.contactedAt = new Date();
            }

            await prisma.lead.update({
                where: { id: leadId },
                data: updateData,
            });

            logger.info('📝 Lead status updated', { leadId, status });
        } catch (error) {
            logger.error({ error, leadId, status }, '❌ Failed to update lead status');
            throw error;
        }
    }

    /**
     * Format confirmation message for customer
     * Requirements 11.5: Confirm that seller will contact them
     * 
     * @param customerName - Customer's name
     * @param vehicleName - Vehicle name for reference
     * @returns Confirmation message
     */
    formatCustomerConfirmation(customerName: string, vehicleName: string): string {
        const name = customerName || 'Cliente';

        return `✅ *Perfeito, ${name}!*

Registrei seu interesse no *${vehicleName}*.

📞 Um de nossos vendedores entrará em contato com você em breve para dar continuidade ao atendimento.

Enquanto isso, você pode continuar explorando outros veículos ou tirar dúvidas comigo! 😊`;
    }

    /**
     * Process a complete lead forwarding flow
     * Combines detection, capture, persistence, and sending
     * 
     * @param message - Customer message
     * @param conversationState - Current conversation state
     * @param whatsappService - WhatsApp service for sending
     * @returns Result with customer confirmation message if lead was captured
     */
    async processLeadForwarding(
        message: string,
        conversationState: ConversationState,
        whatsappService: { sendMessage: (to: string, text: string) => Promise<void> }
    ): Promise<{ captured: boolean; confirmationMessage?: string; lead?: LeadData }> {
        // Detect interest
        const detection = this.detectInterest(message, conversationState);

        if (!detection.hasInterest || detection.confidence < 0.7) {
            return { captured: false };
        }

        // Get the vehicle of interest
        const vehicleIndex = detection.vehicleIndex || 1;
        const recommendations = conversationState.recommendations;

        if (!recommendations || recommendations.length === 0) {
            logger.warn('No recommendations available for lead capture');
            return { captured: false };
        }

        const vehicleRec = recommendations[vehicleIndex - 1];
        if (!vehicleRec || !vehicleRec.vehicle) {
            logger.warn('Vehicle not found at index', { vehicleIndex });
            return { captured: false };
        }

        // Capture lead
        const customerName = conversationState.profile?.customerName || 'Cliente';
        const lead = await this.captureLead(
            conversationState.phoneNumber,
            customerName,
            vehicleRec as VehicleRecommendation & { vehicle: any },
            conversationState
        );

        // Persist lead
        const persistedLead = await this.persistLead(lead);

        // Send to seller
        const sendResult = await this.sendToSeller(persistedLead, whatsappService);

        // Update status based on send result
        await this.updateLeadStatus(
            persistedLead.id!,
            sendResult.success ? 'sent' : 'failed'
        );

        // Generate confirmation message for customer
        const vehicleName = `${lead.vehicle.marca} ${lead.vehicle.modelo} ${lead.vehicle.ano}`;
        const confirmationMessage = this.formatCustomerConfirmation(customerName, vehicleName);

        return {
            captured: true,
            confirmationMessage,
            lead: persistedLead,
        };
    }

    /**
     * Sleep utility for retry backoff
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get seller phone number
     */
    getSellerPhone(): string {
        return this.sellerPhone;
    }

    /**
     * Check if service is configured
     */
    isConfigured(): boolean {
        return !!this.sellerPhone;
    }
}

// Export singleton instance
export const leadForwardingService = new LeadForwardingService();

// Export functions for direct use
export function detectInterest(message: string, context?: ConversationState): InterestDetectionResult {
    return leadForwardingService.detectInterest(message, context);
}

export function formatLeadMessage(lead: LeadData): string {
    return leadForwardingService.formatLeadMessage(lead);
}

export function formatCustomerConfirmation(customerName: string, vehicleName: string): string {
    return leadForwardingService.formatCustomerConfirmation(customerName, vehicleName);
}

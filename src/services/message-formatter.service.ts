/**
 * Message Formatter Service
 * 
 * Formats vehicle recommendations and messages for WhatsApp
 * 
 * Requirements:
 * - 6.1: Include marca, modelo, ano, km, preço, and brief description
 * - 6.2: Use WhatsApp markdown (bold, italic) for emphasis
 * - 6.3: Include URL as clickable link with call-to-action
 * - 6.4: Number vehicles with emojis (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣)
 * - 6.5: Split messages exceeding 4096 characters
 */

import { logger } from '../lib/logger';

/**
 * Vehicle data interface for formatting
 */
export interface VehicleData {
    id?: string;
    marca: string;
    modelo: string;
    versao?: string;
    ano: number;
    km: number;
    preco: number | string;
    cor: string;
    combustivel?: string;
    cambio?: string;
    carroceria?: string;
    descricao?: string;
    url?: string;
}

/**
 * Vehicle recommendation with match info
 */
export interface VehicleRecommendationData {
    vehicleId: string;
    vehicle: VehicleData;
    matchScore: number;
    reasoning: string;
}

/**
 * WhatsApp message limit
 */
const WHATSAPP_MAX_MESSAGE_LENGTH = 4096;

/**
 * Number emojis for vehicle positions (1-5)
 * Requirements 6.4: Use emojis numéricos para facilitar referência
 */
const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];


/**
 * Get emoji number for vehicle position
 * Requirements 6.4: Use emojis numéricos (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣)
 * 
 * @param position - 1-based position (1-5)
 * @returns Emoji number or fallback string
 */
export function getNumberEmoji(position: number): string {
    if (position >= 1 && position <= 5) {
        return NUMBER_EMOJIS[position - 1];
    }
    return `${position}.`;
}

/**
 * Format price in Brazilian Real format
 * 
 * @param price - Price as number or string
 * @returns Formatted price string (e.g., "R$ 45.000,00")
 */
export function formatPrice(price: number | string): string {
    const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
    return `R$ ${numericPrice.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Format kilometers in Brazilian format
 * 
 * @param km - Kilometers as number
 * @returns Formatted km string (e.g., "45.000 km")
 */
export function formatKm(km: number): string {
    return `${km.toLocaleString('pt-BR')} km`;
}

/**
 * Format a single vehicle card for WhatsApp
 * 
 * Requirements:
 * - 6.1: Include marca, modelo, ano, km, preço, and brief description
 * - 6.2: Use WhatsApp markdown (bold, italic) for emphasis
 * - 6.3: Include URL as clickable link with call-to-action
 * 
 * @param vehicle - Vehicle data to format
 * @param position - 1-based position for numbering (1-5)
 * @returns Formatted vehicle card string
 */
export function formatVehicleCard(vehicle: VehicleData, position: number): string {
    const lines: string[] = [];

    // Header with emoji number and vehicle name (bold)
    const versaoText = vehicle.versao ? ` ${vehicle.versao}` : '';
    lines.push(`${getNumberEmoji(position)} *${vehicle.marca} ${vehicle.modelo}*${versaoText}`);
    lines.push('');

    // Year and KM on same line
    lines.push(`📅 Ano: ${vehicle.ano} | 🛣️ ${formatKm(vehicle.km)}`);

    // Price (bold for emphasis)
    lines.push(`💰 *${formatPrice(vehicle.preco)}*`);

    // Color
    lines.push(`🎨 Cor: ${vehicle.cor}`);

    // Fuel and transmission (if available)
    if (vehicle.combustivel || vehicle.cambio) {
        const parts: string[] = [];
        if (vehicle.combustivel) parts.push(`⛽ ${vehicle.combustivel}`);
        if (vehicle.cambio) parts.push(`🔧 ${vehicle.cambio}`);
        lines.push(parts.join(' | '));
    }

    // Brief description (italic, if available)
    if (vehicle.descricao) {
        // Truncate description to keep card compact
        const maxDescLength = 100;
        const desc = vehicle.descricao.length > maxDescLength
            ? vehicle.descricao.substring(0, maxDescLength) + '...'
            : vehicle.descricao;
        lines.push('');
        lines.push(`_${desc}_`);
    }

    // URL with call-to-action (Requirements 6.3)
    if (vehicle.url) {
        lines.push('');
        lines.push(`🔗 *Ver detalhes:* ${vehicle.url}`);
    }

    return lines.join('\n');
}


/**
 * Format a vehicle card with reasoning (for recommendations)
 * 
 * @param recommendation - Vehicle recommendation with match info
 * @param position - 1-based position for numbering (1-5)
 * @returns Formatted vehicle card with reasoning
 */
export function formatRecommendationCard(
    recommendation: VehicleRecommendationData,
    position: number
): string {
    const card = formatVehicleCard(recommendation.vehicle, position);

    // Add reasoning after the card
    if (recommendation.reasoning) {
        return `${card}\n\n💡 ${recommendation.reasoning}`;
    }

    return card;
}

/**
 * Format a list of vehicle recommendations
 * 
 * Requirements:
 * - 6.4: Number vehicles with emojis (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣)
 * - 5.4: Show top 5 vehicles
 * 
 * @param recommendations - Array of vehicle recommendations
 * @returns Formatted recommendations list
 */
export function formatRecommendationList(
    recommendations: VehicleRecommendationData[]
): string {
    if (recommendations.length === 0) {
        return `Desculpe, não encontrei veículos disponíveis no momento.

Digite "vendedor" para falar com nossa equipe.`;
    }

    const lines: string[] = [];

    // Header
    lines.push(`🎯 Encontrei ${recommendations.length} veículo${recommendations.length > 1 ? 's' : ''} perfeito${recommendations.length > 1 ? 's' : ''} para você!`);
    lines.push('');

    // Format each vehicle
    recommendations.forEach((rec, index) => {
        lines.push('━━━━━━━━━━━━━━━━━━━━━');
        lines.push(formatRecommendationCard(rec, index + 1));
        lines.push('');
    });

    // Footer with actions
    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('📱 O que você gostaria de fazer?');
    lines.push('');
    lines.push('• Digite o número do carro para ver mais detalhes');
    lines.push('• Digite "agendar" para marcar uma visita 📅');
    lines.push('• Digite "vendedor" para falar com nossa equipe');

    return lines.join('\n');
}

/**
 * Split a long message into multiple messages
 * 
 * Requirements 6.5: Split messages exceeding 4096 characters
 * 
 * Strategy:
 * 1. Try to split at paragraph boundaries (double newlines)
 * 2. If not possible, split at single newlines
 * 3. If still too long, split at word boundaries
 * 4. Preserve content integrity
 * 
 * @param message - Message to split
 * @param maxLength - Maximum length per message (default: 4096)
 * @returns Array of message parts
 */
export function splitLongMessage(
    message: string,
    maxLength: number = WHATSAPP_MAX_MESSAGE_LENGTH
): string[] {
    // If message fits, return as-is
    if (message.length <= maxLength) {
        return [message];
    }

    const parts: string[] = [];
    let remaining = message;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            parts.push(remaining);
            break;
        }

        // Find the best split point
        let splitIndex = findBestSplitPoint(remaining, maxLength);

        // Extract the part and trim
        const part = remaining.substring(0, splitIndex).trim();
        if (part.length > 0) {
            parts.push(part);
        }

        // Continue with remaining text
        remaining = remaining.substring(splitIndex).trim();
    }

    return parts;
}

/**
 * Find the best point to split a message
 * 
 * @param text - Text to split
 * @param maxLength - Maximum length
 * @returns Index to split at
 */
function findBestSplitPoint(text: string, maxLength: number): number {
    // Try to split at paragraph boundary (double newline)
    const paragraphBreak = text.lastIndexOf('\n\n', maxLength);
    if (paragraphBreak > maxLength * 0.5) {
        return paragraphBreak + 2; // Include the newlines
    }

    // Try to split at separator line
    const separatorBreak = text.lastIndexOf('━━━', maxLength);
    if (separatorBreak > maxLength * 0.5) {
        return separatorBreak;
    }

    // Try to split at single newline
    const lineBreak = text.lastIndexOf('\n', maxLength);
    if (lineBreak > maxLength * 0.5) {
        return lineBreak + 1;
    }

    // Try to split at word boundary (space)
    const wordBreak = text.lastIndexOf(' ', maxLength);
    if (wordBreak > maxLength * 0.5) {
        return wordBreak + 1;
    }

    // Last resort: hard split at maxLength
    return maxLength;
}


/**
 * Format vehicle details for when user selects a specific vehicle
 * 
 * @param vehicle - Vehicle data
 * @param reasoning - Optional reasoning for the recommendation
 * @returns Formatted detailed vehicle message
 */
export function formatVehicleDetails(
    vehicle: VehicleData,
    reasoning?: string
): string {
    const lines: string[] = [];

    lines.push('📋 *Detalhes completos:*');
    lines.push('');

    // Vehicle name
    const versaoText = vehicle.versao ? ` ${vehicle.versao}` : '';
    lines.push(`🚗 *${vehicle.marca} ${vehicle.modelo}*${versaoText}`);

    // Details
    lines.push(`📅 Ano: ${vehicle.ano}`);
    lines.push(`🛣️ Quilometragem: ${formatKm(vehicle.km)}`);
    lines.push(`💰 *Preço: ${formatPrice(vehicle.preco)}*`);
    lines.push(`🎨 Cor: ${vehicle.cor}`);

    if (vehicle.combustivel) {
        lines.push(`⛽ Combustível: ${vehicle.combustivel}`);
    }
    if (vehicle.cambio) {
        lines.push(`🔧 Câmbio: ${vehicle.cambio}`);
    }
    if (vehicle.carroceria) {
        lines.push(`🚙 Carroceria: ${vehicle.carroceria}`);
    }

    // Full description
    if (vehicle.descricao) {
        lines.push('');
        lines.push(`📝 ${vehicle.descricao}`);
    }

    // Reasoning
    if (reasoning) {
        lines.push('');
        lines.push(`💡 ${reasoning}`);
    }

    // URL with call-to-action
    if (vehicle.url) {
        lines.push('');
        lines.push(`🔗 *Veja mais fotos e detalhes:*`);
        lines.push(vehicle.url);
    }

    // Footer
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('Gostou? Digite:');
    lines.push('• "agendar" para visitar 📅');
    lines.push('• "vendedor" para tirar dúvidas');

    return lines.join('\n');
}

/**
 * Message Formatter Service class
 * Provides all formatting functionality as a service
 */
export class MessageFormatterService {
    /**
     * Format a single vehicle card
     */
    formatVehicleCard(vehicle: VehicleData, position: number): string {
        return formatVehicleCard(vehicle, position);
    }

    /**
     * Format a recommendation card with reasoning
     */
    formatRecommendationCard(
        recommendation: VehicleRecommendationData,
        position: number
    ): string {
        return formatRecommendationCard(recommendation, position);
    }

    /**
     * Format a list of recommendations
     */
    formatRecommendationList(recommendations: VehicleRecommendationData[]): string {
        return formatRecommendationList(recommendations);
    }

    /**
     * Format detailed vehicle view
     */
    formatVehicleDetails(vehicle: VehicleData, reasoning?: string): string {
        return formatVehicleDetails(vehicle, reasoning);
    }

    /**
     * Split long messages
     */
    splitLongMessage(message: string, maxLength?: number): string[] {
        return splitLongMessage(message, maxLength);
    }

    /**
     * Get number emoji for position
     */
    getNumberEmoji(position: number): string {
        return getNumberEmoji(position);
    }

    /**
     * Format price
     */
    formatPrice(price: number | string): string {
        return formatPrice(price);
    }

    /**
     * Format kilometers
     */
    formatKm(km: number): string {
        return formatKm(km);
    }
}

/**
 * Truncate text with ellipsis if it exceeds max length
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncateWithEllipsis(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength) + '...';
}

/**
 * Format response for audio messages with transcription preview
 * 
 * Requirements:
 * - 2.1: Include a brief transcription preview in the response
 * - 2.2: Format preview with max 100 characters followed by ellipsis if truncated
 * - 2.3: Prefix response with audio acknowledgment indicator (🎤 emoji)
 * 
 * @param transcription - The transcribed text from the audio
 * @param botResponse - The bot's response to the transcribed text
 * @returns Formatted response with audio indicator and preview
 */
export function formatAudioResponse(transcription: string, botResponse: string): string {
    // Truncate preview to 100 chars with ellipsis if needed (Requirement 2.2)
    const preview = truncateWithEllipsis(transcription, 100);

    // Format with audio indicator emoji and quoted preview (Requirements 2.1, 2.3)
    return `🎤 _"${preview}"_\n\n${botResponse}`;
}

// Export singleton instance
export const messageFormatter = new MessageFormatterService();

/**
 * Simple LangGraph Flow - Versão simplificada e robusta
 */

import { logger } from '../lib/logger';
import { env } from '../config/env';
import { vehicleSearchAdapter } from '../services/vehicle-search-adapter.service';
import { chatCompletion } from '../lib/llm-router';

// ============================================
// STATE TYPE
// ============================================

export interface ConversationGraphState {
    conversationId: string;
    phoneNumber: string;

    // Perfil do cliente
    customerName: string | null;
    budget: number | null;
    usage: string | null;
    bodyType: string | null;
    people: number | null;
    priorities: string[];

    // Flags
    wantsUber: boolean;
    uberCategory: string | null;
    wantsFamily: boolean;
    hasCadeirinha: boolean;
    wantsPickup: boolean;

    // Recomendações
    recommendations: any[];

    // Controle
    currentNode: string;
    messageCount: number;
}

// ============================================
// NODE FUNCTIONS
// ============================================

async function greetingNode(state: ConversationGraphState, userMessage: string): Promise<{ response: string; updates: Partial<ConversationGraphState> }> {
    logger.info({ conversationId: state.conversationId, messageCount: state.messageCount }, 'Node: greeting');

    // Primeira mensagem - dar boas-vindas
    if (state.messageCount <= 1) {
        return {
            response: `Olá! 👋 Bem-vindo à *FaciliAuto*!

Sou seu assistente virtual e estou aqui para ajudar você a encontrar o carro usado perfeito! 🚗

Para começar, qual é o seu nome?`,
            updates: { currentNode: 'greeting' }
        };
    }

    // Tentar extrair nome
    const name = extractName(userMessage);

    if (name) {
        return {
            response: `Prazer em conhecer você, *${name}*! 🤝

Me conta: o que você está procurando?

_Pode me dizer o tipo de carro, para que vai usar, e seu orçamento aproximado._`,
            updates: {
                customerName: name,
                currentNode: 'collect_info'
            }
        };
    }

    return {
        response: 'Desculpe, não entendi seu nome. Pode me dizer de novo? 😊',
        updates: { currentNode: 'greeting' }
    };
}

async function collectInfoNode(state: ConversationGraphState, userMessage: string): Promise<{ response: string; updates: Partial<ConversationGraphState> }> {
    logger.info({ conversationId: state.conversationId }, 'Node: collect_info');

    // Extrair informações
    const extracted = extractPreferences(userMessage);

    // Merge com estado atual
    const newBudget = extracted.budget || state.budget;
    const newUsage = extracted.usage || state.usage;
    const newBodyType = extracted.bodyType || state.bodyType;

    const updates: Partial<ConversationGraphState> = {
        ...extracted,
        currentNode: 'collect_info'
    };

    // Se temos informações suficientes, ir para busca
    if (newBudget && newUsage) {
        updates.currentNode = 'search';
        return {
            response: `Perfeito! Vou buscar as melhores opções para você... 🔍`,
            updates
        };
    }

    // Se só tem orçamento
    if (newBudget && !newUsage) {
        return {
            response: `Anotado! Orçamento de R$ ${newBudget.toLocaleString('pt-BR')}.

E qual vai ser o uso principal?
• Cidade/trabalho
• Viagens
• Aplicativo (Uber/99)
• Família`,
            updates
        };
    }

    // Se só tem uso
    if (!newBudget && newUsage) {
        return {
            response: `Entendi! E qual seu orçamento aproximado?

_Exemplo: 50 mil, 60k, R$ 70.000_`,
            updates
        };
    }

    // Não tem nada
    return {
        response: `Me conta mais sobre o que você busca:
• Qual o uso principal? (cidade, viagem, Uber, família)
• Qual seu orçamento aproximado?`,
        updates
    };
}

async function searchNode(state: ConversationGraphState): Promise<{ response: string; updates: Partial<ConversationGraphState> }> {
    logger.info({
        conversationId: state.conversationId,
        budget: state.budget,
        usage: state.usage,
    }, 'Node: search');

    try {
        const filters: any = {
            maxPrice: state.budget || undefined,
            limit: 10,
        };

        // Filtros de Uber
        if (state.wantsUber) {
            if (state.uberCategory === 'black') {
                filters.aptoUberBlack = true;
            } else {
                filters.aptoUber = true;
            }
        }

        // Filtros de família
        if (state.wantsFamily && !state.wantsPickup) {
            filters.aptoFamilia = true;
        }

        // Filtro de carroceria
        if (state.bodyType) {
            filters.bodyType = state.bodyType;
        }

        // Buscar
        const searchQuery = buildSearchQuery(state);
        let results = await vehicleSearchAdapter.search(searchQuery, filters);

        // Filtrar para cadeirinha
        if (state.wantsFamily && state.hasCadeirinha) {
            results = filterForCadeirinha(results);
        }

        results = results.slice(0, 5);

        if (results.length === 0) {
            return {
                response: `Hmm, não encontrei veículos com esses critérios exatos. 🤔

Posso ajustar a busca:
• Aumentar um pouco o orçamento?
• Considerar outros tipos de veículo?

O que prefere?`,
                updates: {
                    recommendations: [],
                    currentNode: 'collect_info'
                }
            };
        }

        return {
            response: '', // Será preenchido no recommend
            updates: {
                recommendations: results,
                currentNode: 'recommend'
            }
        };

    } catch (error) {
        logger.error({ error }, 'Search error');
        return {
            response: 'Desculpe, tive um problema na busca. Pode repetir o que você procura?',
            updates: { currentNode: 'collect_info' }
        };
    }
}

async function recommendNode(state: ConversationGraphState): Promise<{ response: string; updates: Partial<ConversationGraphState> }> {
    logger.info({ conversationId: state.conversationId, count: state.recommendations.length }, 'Node: recommend');

    const recs = state.recommendations;

    if (recs.length === 0) {
        return {
            response: 'Não encontrei veículos. Vamos ajustar os critérios?',
            updates: { currentNode: 'collect_info' }
        };
    }

    const intro = `🎯 Encontrei ${recs.length} veículo${recs.length > 1 ? 's' : ''} para você:\n\n`;

    const list = recs.map((rec, i) => {
        const v = rec.vehicle;
        const link = v.detailsUrl || v.url || '';

        let item = `${i + 1}. ${i === 0 ? '🏆 ' : ''}*${v.brand} ${v.model} ${v.year}*
   💰 R$ ${v.price?.toLocaleString('pt-BR') || '?'}
   🛣️ ${v.mileage?.toLocaleString('pt-BR') || '?'} km
   🚗 ${v.bodyType || 'N/A'}${v.transmission ? ` | ${v.transmission}` : ''}`;

        if (link) {
            item += `\n   🔗 ${link}`;
        }

        return item;
    }).join('\n\n');

    const outro = `\n\nQual te interessou mais? Posso dar mais detalhes! 😊

_Digite "reiniciar" para nova busca ou "vendedor" para falar com nossa equipe._`;

    return {
        response: intro + list + outro,
        updates: { currentNode: 'followup' }
    };
}

async function followupNode(state: ConversationGraphState, userMessage: string): Promise<{ response: string; updates: Partial<ConversationGraphState> }> {
    logger.info({ conversationId: state.conversationId }, 'Node: followup');

    const lower = userMessage.toLowerCase();

    // Verificar número do veículo
    const numMatch = lower.match(/\b([1-5])\b/);
    if (numMatch && state.recommendations.length > 0) {
        const idx = parseInt(numMatch[1]) - 1;
        if (idx >= 0 && idx < state.recommendations.length) {
            const v = state.recommendations[idx].vehicle;
            return {
                response: `📋 *Detalhes do ${v.brand} ${v.model} ${v.year}:*

💰 Preço: R$ ${v.price?.toLocaleString('pt-BR')}
🛣️ KM: ${v.mileage?.toLocaleString('pt-BR')} km
🚗 Tipo: ${v.bodyType}
⚙️ Câmbio: ${v.transmission || 'N/A'}
⛽ Combustível: ${v.fuelType || 'Flex'}
🎨 Cor: ${v.color || 'N/A'}

${v.detailsUrl ? `🔗 Ver mais: ${v.detailsUrl}` : ''}

Quer agendar uma visita ou falar com um vendedor?`,
                updates: {}
            };
        }
    }

    // Vendedor
    if (lower.includes('vendedor') || lower.includes('agendar') || lower.includes('visita')) {
        return {
            response: `Perfeito! 👨‍💼

Nossa equipe de vendas foi notificada e entrará em contato com você em breve pelo WhatsApp.

Obrigado por usar a FaciliAuto! 🚗`,
            updates: {}
        };
    }

    return {
        response: `Como posso ajudar mais?

• Digite o *número* do veículo para mais detalhes
• Digite *"vendedor"* para falar com nossa equipe
• Digite *"reiniciar"* para nova busca`,
        updates: {}
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractName(text: string): string | null {
    const lower = text.toLowerCase().trim();

    // Ignorar saudações
    const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello'];
    if (greetings.includes(lower)) return null;

    // Padrões de nome
    const patterns = [
        /(?:meu nome [ée]|me chamo|sou o?a?|pode me chamar de)\s+([A-Za-zÀ-ú]+)/i,
        /^([A-Za-zÀ-ú]{2,20})$/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            const commonWords = ['quero', 'preciso', 'busco', 'procuro', 'carro', 'veiculo'];
            if (!commonWords.includes(name.toLowerCase()) && name.length >= 2) {
                return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
            }
        }
    }

    return null;
}

function extractPreferences(text: string): Partial<ConversationGraphState> {
    const lower = text.toLowerCase();
    const result: Partial<ConversationGraphState> = {};

    // Orçamento
    const budgetPatterns = [
        { pattern: /(\d+)\s*mil/i, multiplier: 1000 },
        { pattern: /(\d+)\s*k/i, multiplier: 1000 },
        { pattern: /r?\$?\s*(\d{2,3})\.(\d{3})/i, multiplier: 1 },
        { pattern: /(\d{4,6})/, multiplier: 1 },
    ];

    for (const { pattern, multiplier } of budgetPatterns) {
        const match = text.match(pattern);
        if (match) {
            if (match[2]) {
                result.budget = parseInt(match[1] + match[2]);
            } else {
                const val = parseInt(match[1]);
                result.budget = multiplier === 1 && val < 1000 ? val * 1000 : val * multiplier;
            }
            break;
        }
    }

    // Uso
    if (lower.includes('uber') || lower.includes('99') || lower.includes('aplicativo')) {
        result.usage = 'uber';
        result.wantsUber = true;
        if (lower.includes('black')) result.uberCategory = 'black';
        else if (lower.includes('comfort')) result.uberCategory = 'comfort';
        else result.uberCategory = 'x';
    } else if (lower.includes('famil') || lower.includes('filho') || lower.includes('criança') || lower.includes('cadeirinha')) {
        result.usage = 'familia';
        result.wantsFamily = true;
        if (lower.includes('cadeirinha') || lower.includes('bebê')) result.hasCadeirinha = true;
    } else if (lower.includes('trabalho') || lower.includes('cidade')) {
        result.usage = 'trabalho';
    } else if (lower.includes('viagem') || lower.includes('estrada')) {
        result.usage = 'viagem';
    }

    // Carroceria
    if (lower.includes('pickup') || lower.includes('picape')) {
        result.bodyType = 'pickup';
        result.wantsPickup = true;
    } else if (lower.includes('suv')) {
        result.bodyType = 'suv';
    } else if (lower.includes('sedan')) {
        result.bodyType = 'sedan';
    } else if (lower.includes('hatch')) {
        result.bodyType = 'hatch';
    }

    return result;
}

function buildSearchQuery(state: ConversationGraphState): string {
    const parts: string[] = [];
    if (state.bodyType) parts.push(state.bodyType);
    if (state.usage) parts.push(state.usage);
    if (state.wantsUber) parts.push('uber');
    if (state.wantsFamily) parts.push('familia');
    return parts.join(' ') || 'carro usado';
}

function filterForCadeirinha(results: any[]): any[] {
    const never = ['mobi', 'kwid', 'up', 'uno', 'ka', 'march', 'sandero'];
    return results.filter(rec => {
        const model = rec.vehicle.model?.toLowerCase() || '';
        const body = rec.vehicle.bodyType?.toLowerCase() || '';
        if (never.some(n => model.includes(n))) return false;
        if (body.includes('hatch')) {
            const ok = ['fit', 'golf', 'polo'];
            return ok.some(h => model.includes(h));
        }
        return true;
    });
}

// ============================================
// MAIN HANDLER
// ============================================

export class SimpleLangGraphHandler {

    async handleMessage(
        conversationId: string,
        phoneNumber: string,
        message: string,
        existingState?: Partial<ConversationGraphState> | null
    ): Promise<{ response: string; newState: ConversationGraphState }> {

        // Inicializar estado
        const state: ConversationGraphState = {
            conversationId,
            phoneNumber,
            customerName: existingState?.customerName || null,
            budget: existingState?.budget || null,
            usage: existingState?.usage || null,
            bodyType: existingState?.bodyType || null,
            people: existingState?.people || null,
            priorities: existingState?.priorities || [],
            wantsUber: existingState?.wantsUber || false,
            uberCategory: existingState?.uberCategory || null,
            wantsFamily: existingState?.wantsFamily || false,
            hasCadeirinha: existingState?.hasCadeirinha || false,
            wantsPickup: existingState?.wantsPickup || false,
            recommendations: existingState?.recommendations || [],
            currentNode: existingState?.currentNode || 'greeting',
            messageCount: (existingState?.messageCount || 0) + 1,
        };

        logger.info({
            conversationId,
            currentNode: state.currentNode,
            messageCount: state.messageCount,
            hasName: !!state.customerName,
            hasBudget: !!state.budget,
        }, 'SimpleLangGraph: processing');

        try {
            let result: { response: string; updates: Partial<ConversationGraphState> };

            // Executar node baseado no estado atual
            switch (state.currentNode) {
                case 'greeting':
                    result = await greetingNode(state, message);
                    break;

                case 'collect_info':
                    result = await collectInfoNode(state, message);
                    break;

                case 'search':
                    result = await searchNode(state);
                    // Se foi para recommend, executar também
                    if (result.updates.currentNode === 'recommend') {
                        const newState = { ...state, ...result.updates };
                        result = await recommendNode(newState);
                    }
                    break;

                case 'recommend':
                    result = await recommendNode(state);
                    break;

                case 'followup':
                    result = await followupNode(state, message);
                    break;

                default:
                    result = await greetingNode(state, message);
            }

            // Aplicar updates
            const newState: ConversationGraphState = {
                ...state,
                ...result.updates,
            };

            return {
                response: result.response,
                newState,
            };

        } catch (error) {
            logger.error({ error, conversationId }, 'SimpleLangGraph: error');
            return {
                response: 'Desculpe, tive um problema. Pode tentar novamente?',
                newState: state,
            };
        }
    }
}

export const simpleLangGraphHandler = new SimpleLangGraphHandler();

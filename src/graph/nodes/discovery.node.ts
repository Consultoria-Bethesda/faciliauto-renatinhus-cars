import { ConversationState, StateUpdate, CustomerProfile } from '../../types/state.types';
import { logger } from '../../lib/logger';

/**
 * Discovery questions structure for Renatinhu's Cars
 * Simplified flow: Name → Budget → Usage → Preferences
 * Requirements: 4.2, 4.3, 4.4 - Collect customer info without passengers question
 */
const DISCOVERY_QUESTIONS = [
    {
        id: 0,
        field: 'customerName',
        question: '', // Initial question is asked in greeting node
        validator: (answer: string) => {
            const name = answer.trim();
            if (name.length < 2 || name.length > 50) {
                return { valid: false, error: 'Por favor, me diga seu nome para eu poder te atender melhor! 😊' };
            }
            // Check if it's just numbers or special chars
            if (/^[\d\s\W]+$/.test(name)) {
                return { valid: false, error: 'Por favor, me diga seu nome para eu poder te atender melhor! 😊' };
            }
            return { valid: true, value: name };
        },
    },
    {
        id: 1,
        field: 'budget',
        question: (name: string) => `Prazer em conhecer você, *${name}*! 🤝

Agora vou fazer algumas perguntas rápidas para encontrar o carro ideal para você.

💰 *Qual é o seu orçamento?*

_Exemplo: 50000 ou 50 mil_`,
        validator: (answer: string) => {
            const cleaned = answer.replace(/[^\d]/g, '');
            const value = parseInt(cleaned);
            if (!value || value < 5000) {
                return { valid: false, error: '❌ Por favor, digite um valor válido acima de R$ 5.000.\n\n💰 Qual é o seu orçamento?\n\n_Exemplo: 50000 ou 50 mil_' };
            }
            return { valid: true, value };
        },
    },
    {
        id: 2,
        field: 'usage',
        question: `✅ Anotado!

🚗 *Qual será o uso principal do veículo?*

1️⃣ Cidade (urbano)
2️⃣ Viagem (estrada)
3️⃣ Trabalho (app/entregas)
4️⃣ Misto (cidade + viagem)

_Digite o número da opção_`,
        validator: (answer: string) => {
            const map: Record<string, string> = { '1': 'cidade', '2': 'viagem', '3': 'trabalho', '4': 'misto' };
            const value = map[answer.trim()];
            if (!value) {
                return { valid: false, error: '❌ Por favor, escolha uma opção válida (1, 2, 3 ou 4).\n\n🚗 Qual será o uso principal?\n\n1️⃣ Cidade\n2️⃣ Viagem\n3️⃣ Trabalho\n4️⃣ Misto\n\n_Digite o número_' };
            }
            return { valid: true, value };
        },
    },

    {
        id: 3,
        field: 'vehicleType',
        question: `✅ Anotado!

🚙 *Qual tipo de veículo você prefere?*

1️⃣ Hatchback (compacto)
2️⃣ Sedan
3️⃣ SUV
4️⃣ Pickup
5️⃣ Tanto faz

_Digite o número da opção_`,
        validator: (answer: string) => {
            const map: Record<string, string> = { '1': 'hatch', '2': 'sedan', '3': 'suv', '4': 'pickup', '5': 'qualquer' };
            const value = map[answer.trim()];
            if (!value) {
                return { valid: false, error: '❌ Por favor, escolha uma opção válida (1, 2, 3, 4 ou 5).\n\n🚙 Qual tipo de veículo?\n\n1️⃣ Hatch\n2️⃣ Sedan\n3️⃣ SUV\n4️⃣ Pickup\n5️⃣ Tanto faz\n\n_Digite o número_' };
            }
            return { valid: true, value };
        },
    },
];

/**
 * Check if profile is complete enough for recommendations
 * Requirements: 4.5 - Profile needs budget and at least one preference
 */
function isProfileComplete(profile: CustomerProfile): boolean {
    // Must have budget
    if (!profile.budget || profile.budget < 5000) {
        return false;
    }

    // Must have at least one preference (usage OR vehicleType)
    const hasUsage = profile.usagePattern && profile.usagePattern !== '';
    const hasVehicleType = profile.vehicleType && profile.vehicleType !== '';

    return hasUsage || hasVehicleType;
}

/**
 * Generate customer profile from discovery answers
 */
function generateProfile(answers: Record<string, any>): CustomerProfile {
    const priorities: string[] = [];

    if (answers.usage === 'cidade') priorities.push('economico', 'tamanho_compacto');
    if (answers.usage === 'viagem') priorities.push('conforto', 'seguranca');
    if (answers.usage === 'trabalho') priorities.push('economico', 'durabilidade');

    return {
        customerName: answers.customerName,
        budget: answers.budget || 50000,
        budgetFlexibility: 20, // ±20% as per requirements 5.2
        usagePattern: answers.usage || 'misto',
        vehicleType: answers.vehicleType || 'qualquer',
        priorities,
        dealBreakers: [],
        // Default values for optional fields
        familySize: 4,
        minYear: 2015,
        maxKm: 100000,
    };
}

/**
 * DiscoveryNode - Collect customer name and preferences
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export async function discoveryNode(state: ConversationState): Promise<StateUpdate> {
    logger.info({
        conversationId: state.conversationId,
        currentQuestion: state.quiz.currentQuestion,
        progress: state.quiz.progress
    }, 'DiscoveryNode: Processing answer');

    const lastMessage = state.messages[state.messages.length - 1];
    const userAnswer = lastMessage.content;

    const currentQuestionIndex = state.quiz.currentQuestion;
    const currentQuestion = DISCOVERY_QUESTIONS[currentQuestionIndex];

    if (!currentQuestion) {
        logger.error({ conversationId: state.conversationId, currentQuestionIndex }, 'DiscoveryNode: Invalid question index');
        return {
            graph: {
                ...state.graph,
                currentNode: 'greeting',
                errorCount: state.graph.errorCount + 1,
            },
        };
    }

    // Validate answer
    const validation = currentQuestion.validator(userAnswer);

    if (!validation.valid) {
        // Invalid answer, ask again
        return {
            messages: [
                ...state.messages,
                {
                    role: 'assistant',
                    content: validation.error,
                    timestamp: new Date(),
                },
            ],
            metadata: {
                ...state.metadata,
                lastMessageAt: new Date(),
            },
        };
    }

    // Save answer
    const updatedAnswers = {
        ...state.quiz.answers,
        [currentQuestion.field]: validation.value,
    };

    const newProgress = state.quiz.progress + 1;
    const nextQuestionIndex = currentQuestionIndex + 1;

    // Generate partial profile to check completeness
    const partialProfile = generateProfile(updatedAnswers);

    // Check if we have enough info to make recommendations (Requirements: 4.5)
    // Profile is complete when we have budget AND at least one preference
    if (nextQuestionIndex >= DISCOVERY_QUESTIONS.length ||
        (nextQuestionIndex >= 3 && isProfileComplete(partialProfile))) {

        // Discovery complete! Generate full profile and transition to search
        const profile = generateProfile(updatedAnswers);

        logger.info({ conversationId: state.conversationId, profile }, 'DiscoveryNode: Discovery completed, profile generated');

        return {
            messages: [
                ...state.messages,
                {
                    role: 'assistant',
                    content: `✅ Perfeito, *${profile.customerName}*!

🔍 Estou buscando os melhores veículos para você na *Renatinhu's Cars*...`,
                    timestamp: new Date(),
                },
            ],
            quiz: {
                ...state.quiz,
                answers: updatedAnswers,
                progress: newProgress,
                isComplete: true,
            },
            profile,
            graph: {
                ...state.graph,
                currentNode: 'search',
                previousNode: 'discovery',
                nodeHistory: [...state.graph.nodeHistory, 'discovery'],
            },
            metadata: {
                ...state.metadata,
                lastMessageAt: new Date(),
            },
        };
    }

    // Ask next question
    const nextQuestion = DISCOVERY_QUESTIONS[nextQuestionIndex];
    let questionText = typeof nextQuestion.question === 'function'
        ? nextQuestion.question(updatedAnswers.customerName || '')
        : nextQuestion.question;

    return {
        messages: [
            ...state.messages,
            {
                role: 'assistant',
                content: questionText,
                timestamp: new Date(),
            },
        ],
        quiz: {
            ...state.quiz,
            answers: updatedAnswers,
            progress: newProgress,
            currentQuestion: nextQuestionIndex,
        },
        profile: partialProfile, // Store partial profile for early transition check
        metadata: {
            ...state.metadata,
            lastMessageAt: new Date(),
        },
    };
}

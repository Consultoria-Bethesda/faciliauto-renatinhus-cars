/**
 * Vehicle Embedding Service
 * 
 * Responsável por gerar texto descritivo para embeddings de veículos
 * e gerenciar a geração e persistência de embeddings vetoriais.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { Vehicle } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
    generateEmbedding,
    generateEmbeddingsBatch,
    embeddingToString,
    stringToEmbedding,
    isValidEmbedding,
    EMBEDDING_MODEL,
} from '../lib/embeddings';
import { logger } from '../lib/logger';

/**
 * Interface para veículo com campos necessários para embedding
 */
export interface VehicleForEmbedding {
    id: string;
    marca: string;
    modelo: string;
    versao?: string | null;
    ano: number;
    km: number;
    preco: number;
    carroceria: string;
    combustivel: string;
    cambio: string;
    descricao?: string | null;
}

/**
 * Resultado da geração de embedding
 */
export interface EmbeddingGenerationResult {
    vehicleId: string;
    success: boolean;
    embedding?: number[];
    model?: string;
    error?: string;
}

/**
 * Resultado da sincronização de embeddings
 */
export interface EmbeddingSyncResult {
    total: number;
    generated: number;
    skipped: number;
    errors: number;
    errorDetails: string[];
}

/**
 * Gera texto descritivo otimizado para busca semântica
 * 
 * Combina todos os atributos relevantes do veículo em um texto
 * formatado para maximizar a qualidade do embedding.
 * 
 * Requirements: 3.2
 * 
 * @param vehicle - Veículo com campos necessários
 * @returns Texto descritivo para embedding
 */
export function generateVehicleEmbeddingText(vehicle: VehicleForEmbedding): string {
    // Validar campos obrigatórios
    if (!vehicle.marca || !vehicle.modelo) {
        throw new Error('Veículo deve ter marca e modelo definidos');
    }

    // Construir partes do texto de forma estruturada
    const parts: string[] = [];

    // Identificação principal
    parts.push(`${vehicle.marca} ${vehicle.modelo}`);

    // Versão (se disponível)
    if (vehicle.versao) {
        parts.push(vehicle.versao);
    }

    // Ano
    parts.push(`ano ${vehicle.ano}`);

    // Quilometragem formatada
    const kmFormatted = vehicle.km.toLocaleString('pt-BR');
    parts.push(`${kmFormatted} km`);

    // Preço formatado
    const precoFormatted = vehicle.preco.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
    parts.push(`preço ${precoFormatted}`);

    // Características técnicas
    parts.push(`carroceria ${vehicle.carroceria}`);
    parts.push(`combustível ${vehicle.combustivel}`);
    parts.push(`câmbio ${vehicle.cambio}`);

    // Descrição adicional (se disponível)
    if (vehicle.descricao) {
        parts.push(vehicle.descricao);
    }

    return parts.join(' ');
}

/**
 * Gera embedding para um veículo e persiste no banco
 * 
 * Requirements: 3.1, 3.3, 3.4, 3.5
 * 
 * @param vehicleId - ID do veículo
 * @returns Resultado da geração
 */
export async function generateAndPersistVehicleEmbedding(
    vehicleId: string
): Promise<EmbeddingGenerationResult> {
    try {
        // Buscar veículo
        const vehicle = await prisma.vehicle.findUnique({
            where: { id: vehicleId },
        });

        if (!vehicle) {
            return {
                vehicleId,
                success: false,
                error: `Veículo ${vehicleId} não encontrado`,
            };
        }

        // Gerar texto para embedding
        const embeddingText = generateVehicleEmbeddingText(vehicle);

        logger.info(
            { vehicleId, textLength: embeddingText.length },
            'Gerando embedding para veículo'
        );

        // Gerar embedding (usa router com fallback automático)
        const embedding = await generateEmbedding(embeddingText);

        // Validar embedding
        if (!isValidEmbedding(embedding)) {
            return {
                vehicleId,
                success: false,
                error: 'Embedding gerado é inválido',
            };
        }

        // Persistir no banco
        await prisma.vehicle.update({
            where: { id: vehicleId },
            data: {
                embedding: embeddingToString(embedding),
                embeddingModel: EMBEDDING_MODEL,
                embeddingGeneratedAt: new Date(),
            },
        });

        logger.info(
            { vehicleId, dimensions: embedding.length, model: EMBEDDING_MODEL },
            'Embedding persistido com sucesso'
        );

        return {
            vehicleId,
            success: true,
            embedding,
            model: EMBEDDING_MODEL,
        };
    } catch (error: any) {
        logger.error(
            { vehicleId, error: error.message },
            'Erro ao gerar embedding para veículo'
        );

        return {
            vehicleId,
            success: false,
            error: error.message,
        };
    }
}

/**
 * Gera embeddings para múltiplos veículos em batch
 * 
 * Requirements: 3.1, 3.3, 3.4, 3.5
 * 
 * @param vehicleIds - IDs dos veículos
 * @returns Array de resultados
 */
export async function generateAndPersistVehicleEmbeddingsBatch(
    vehicleIds: string[]
): Promise<EmbeddingGenerationResult[]> {
    if (vehicleIds.length === 0) {
        return [];
    }

    try {
        // Buscar veículos
        const vehicles = await prisma.vehicle.findMany({
            where: { id: { in: vehicleIds } },
        });

        if (vehicles.length === 0) {
            return vehicleIds.map((id) => ({
                vehicleId: id,
                success: false,
                error: 'Veículo não encontrado',
            }));
        }

        // Gerar textos para embedding
        const textsWithIds = vehicles.map((v) => ({
            id: v.id,
            text: generateVehicleEmbeddingText(v),
        }));

        logger.info(
            { count: textsWithIds.length },
            'Gerando embeddings em batch'
        );

        // Gerar embeddings em batch
        const embeddings = await generateEmbeddingsBatch(
            textsWithIds.map((t) => t.text)
        );

        // Persistir cada embedding
        const results: EmbeddingGenerationResult[] = [];

        for (let i = 0; i < textsWithIds.length; i++) {
            const { id } = textsWithIds[i];
            const embedding = embeddings[i];

            if (!isValidEmbedding(embedding)) {
                results.push({
                    vehicleId: id,
                    success: false,
                    error: 'Embedding gerado é inválido',
                });
                continue;
            }

            try {
                await prisma.vehicle.update({
                    where: { id },
                    data: {
                        embedding: embeddingToString(embedding),
                        embeddingModel: EMBEDDING_MODEL,
                        embeddingGeneratedAt: new Date(),
                    },
                });

                results.push({
                    vehicleId: id,
                    success: true,
                    embedding,
                    model: EMBEDDING_MODEL,
                });
            } catch (error: any) {
                results.push({
                    vehicleId: id,
                    success: false,
                    error: error.message,
                });
            }
        }

        logger.info(
            {
                total: results.length,
                success: results.filter((r) => r.success).length,
                errors: results.filter((r) => !r.success).length,
            },
            'Batch de embeddings processado'
        );

        return results;
    } catch (error: any) {
        logger.error({ error: error.message }, 'Erro ao gerar embeddings em batch');

        return vehicleIds.map((id) => ({
            vehicleId: id,
            success: false,
            error: error.message,
        }));
    }
}

/**
 * Sincroniza embeddings para todos os veículos que não possuem
 * 
 * Requirements: 3.1, 3.4
 * 
 * @param forceRegenerate - Se true, regenera todos os embeddings
 * @returns Resultado da sincronização
 */
export async function syncAllVehicleEmbeddings(
    forceRegenerate: boolean = false
): Promise<EmbeddingSyncResult> {
    const result: EmbeddingSyncResult = {
        total: 0,
        generated: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [],
    };

    try {
        // Buscar veículos que precisam de embedding
        const whereClause = forceRegenerate
            ? {}
            : {
                OR: [{ embedding: null }, { embedding: '' }],
            };

        const vehicles = await prisma.vehicle.findMany({
            where: whereClause,
            select: { id: true },
        });

        result.total = vehicles.length;

        if (vehicles.length === 0) {
            logger.info('Todos os veículos já possuem embeddings');
            return result;
        }

        logger.info(
            { count: vehicles.length, forceRegenerate },
            'Iniciando sincronização de embeddings'
        );

        // Processar em batches de 10
        const batchSize = 10;
        const vehicleIds = vehicles.map((v) => v.id);

        for (let i = 0; i < vehicleIds.length; i += batchSize) {
            const batchIds = vehicleIds.slice(i, i + batchSize);
            const batchResults = await generateAndPersistVehicleEmbeddingsBatch(batchIds);

            for (const r of batchResults) {
                if (r.success) {
                    result.generated++;
                } else {
                    result.errors++;
                    result.errorDetails.push(`${r.vehicleId}: ${r.error}`);
                }
            }

            // Delay entre batches para evitar rate limit
            if (i + batchSize < vehicleIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        logger.info(
            {
                total: result.total,
                generated: result.generated,
                errors: result.errors,
            },
            'Sincronização de embeddings concluída'
        );

        return result;
    } catch (error: any) {
        logger.error({ error: error.message }, 'Erro na sincronização de embeddings');
        throw error;
    }
}

/**
 * Recupera embedding de um veículo do banco
 * 
 * Requirements: 3.6
 * 
 * @param vehicleId - ID do veículo
 * @returns Embedding como array de números ou null
 */
export async function getVehicleEmbedding(
    vehicleId: string
): Promise<number[] | null> {
    const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { embedding: true },
    });

    if (!vehicle || !vehicle.embedding) {
        return null;
    }

    return stringToEmbedding(vehicle.embedding);
}

/**
 * Verifica se um veículo possui embedding válido
 * 
 * @param vehicleId - ID do veículo
 * @returns true se possui embedding válido
 */
export async function hasValidEmbedding(vehicleId: string): Promise<boolean> {
    const embedding = await getVehicleEmbedding(vehicleId);
    return embedding !== null && isValidEmbedding(embedding);
}

// Re-exportar funções de serialização para uso externo
export { embeddingToString, stringToEmbedding, isValidEmbedding };

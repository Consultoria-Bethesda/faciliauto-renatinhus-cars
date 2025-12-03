/**
 * Initial Seed Script for Renatinhu's Cars MVP
 * 
 * This script performs the complete initial seed:
 * 1. Scrapes vehicles from the website (or uses fallback data)
 * 2. Syncs with the PostgreSQL database
 * 3. Generates embeddings for all vehicles
 * 
 * Task: 14. Executar Seed Inicial
 * Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2
 */

import { PrismaClient } from '@prisma/client';
import { ScraperService, ScrapedVehicle } from '../services/scraper.service';
import { vehicleSyncService } from '../services/vehicle-sync.service';
import { generateEmbedding, embeddingToString, EMBEDDING_MODEL } from '../lib/embeddings';
import { generateVehicleEmbeddingText } from '../services/vehicle-embedding.service';
import { logger } from '../lib/logger';
import { renatinhuVehicles } from './scrape-renatinhu';

const prisma = new PrismaClient();

/**
 * Convert static vehicle data to ScrapedVehicle format
 */
function convertToScrapedVehicle(vehicle: typeof renatinhuVehicles[0], index: number): ScrapedVehicle {
    return {
        marca: vehicle.marca,
        modelo: vehicle.modelo,
        versao: vehicle.versao,
        ano: vehicle.ano,
        km: vehicle.km,
        preco: vehicle.preco,
        cor: vehicle.cor,
        combustivel: vehicle.combustivel,
        cambio: vehicle.cambio,
        carroceria: vehicle.carroceria,
        fotoUrl: vehicle.fotoUrl,
        fotosUrls: vehicle.fotoUrl ? [vehicle.fotoUrl] : [],
        url: `https://www.renatinhuscars.com.br/veiculo/${index + 1}`,
        descricao: vehicle.descricao,
    };
}

/**
 * Task 14.1: Run scraper to extract vehicles
 */
async function runScraper(): Promise<ScrapedVehicle[]> {
    console.log('\n' + '='.repeat(60));
    console.log('📥 TASK 14.1: Rodar scraper para extrair veículos');
    console.log('='.repeat(60));

    const scraper = new ScraperService();
    let vehicles: ScrapedVehicle[] = [];

    try {
        console.log('\n🔍 Tentando scraper do site ao vivo...');
        const result = await scraper.scrapeAllVehiclesWithDetails();

        if (result.vehicles.length > 0) {
            console.log(`✅ Scraper extraiu ${result.vehicles.length} veículos do site`);
            vehicles = result.vehicles;
        } else {
            throw new Error('Nenhum veículo extraído do site');
        }
    } catch (error) {
        console.log(`⚠️  Scraper falhou: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        console.log('📦 Usando dados estáticos de fallback...');

        // Use static fallback data
        vehicles = renatinhuVehicles.map((v, i) => convertToScrapedVehicle(v, i));
        console.log(`✅ Carregados ${vehicles.length} veículos dos dados estáticos`);
    }

    // Validate extracted vehicles
    console.log('\n📋 Validando veículos extraídos:');
    let validCount = 0;
    let invalidCount = 0;

    for (const vehicle of vehicles) {
        const validation = scraper.validateVehicle(vehicle);
        if (validation.isValid) {
            validCount++;
        } else {
            invalidCount++;
            console.log(`  ⚠️  ${vehicle.marca} ${vehicle.modelo}: ${validation.errors.join(', ')}`);
        }
    }

    console.log(`\n📊 Resultado da validação:`);
    console.log(`  ✅ Válidos: ${validCount}`);
    console.log(`  ❌ Inválidos: ${invalidCount}`);
    console.log(`  📦 Total: ${vehicles.length}`);

    return vehicles;
}

/**
 * Task 14.2: Sync with database
 */
async function syncWithDatabase(vehicles: ScrapedVehicle[]): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('💾 TASK 14.2: Sincronizar com banco de dados');
    console.log('='.repeat(60));

    // Clear existing data first for clean seed
    console.log('\n🗑️  Limpando dados existentes...');
    await prisma.message.deleteMany();
    await prisma.recommendation.deleteMany();
    await prisma.event.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.vehicle.deleteMany();
    console.log('✅ Dados existentes removidos');

    // Sync vehicles
    console.log('\n📥 Sincronizando veículos...');
    const syncResult = await vehicleSyncService.syncFromScraper(vehicles, {
        markRemovedAsUnavailable: true,
        verbose: true,
    });

    console.log('\n📊 Resultado da sincronização:');
    console.log(`  ➕ Adicionados: ${syncResult.added}`);
    console.log(`  🔄 Atualizados: ${syncResult.updated}`);
    console.log(`  ➖ Removidos: ${syncResult.removed}`);
    console.log(`  ❌ Erros: ${syncResult.errors.length}`);

    if (syncResult.errors.length > 0) {
        console.log('\n⚠️  Erros encontrados:');
        syncResult.errors.forEach(err => console.log(`  - ${err}`));
    }

    // Verify vehicle count
    const vehicleCount = await prisma.vehicle.count();
    const availableCount = await prisma.vehicle.count({ where: { disponivel: true } });

    console.log(`\n📊 Veículos no banco:`);
    console.log(`  📦 Total: ${vehicleCount}`);
    console.log(`  ✅ Disponíveis: ${availableCount}`);

    // Show summary by brand
    const brands = await prisma.vehicle.groupBy({
        by: ['marca'],
        _count: { marca: true },
        orderBy: { _count: { marca: 'desc' } },
    });

    console.log('\n📈 Veículos por marca:');
    brands.forEach(brand => {
        console.log(`  ${brand.marca}: ${brand._count.marca} veículos`);
    });
}

/**
 * Task 14.3: Generate embeddings for all vehicles
 */
async function generateEmbeddings(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🧠 TASK 14.3: Gerar embeddings para todos os veículos');
    console.log('='.repeat(60));

    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
        console.log('\n⚠️  OPENAI_API_KEY não configurada');
        console.log('💡 Configure sua chave de API no .env para gerar embeddings');
        console.log('   OPENAI_API_KEY=sk-...');
        return;
    }

    const vehicles = await prisma.vehicle.findMany({
        where: { disponivel: true },
    });

    console.log(`\n📊 Encontrados ${vehicles.length} veículos para processar`);

    let processed = 0;
    let errors = 0;
    const batchSize = 5;
    const delayMs = 1000;

    for (let i = 0; i < vehicles.length; i += batchSize) {
        const batch = vehicles.slice(i, i + batchSize);
        console.log(`\n📦 Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(vehicles.length / batchSize)}...`);

        for (const vehicle of batch) {
            try {
                const text = generateVehicleEmbeddingText(vehicle);
                console.log(`  🚗 ${vehicle.marca} ${vehicle.modelo} (${vehicle.ano})`);

                const embedding = await generateEmbedding(text);

                await prisma.vehicle.update({
                    where: { id: vehicle.id },
                    data: {
                        embedding: embeddingToString(embedding),
                        embeddingModel: EMBEDDING_MODEL,
                        embeddingGeneratedAt: new Date(),
                    },
                });

                processed++;
                console.log(`     ✅ Embedding gerado (${embedding.length} dimensões)`);

                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } catch (error) {
                errors++;
                console.log(`     ❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
                logger.error({ vehicleId: vehicle.id, error }, 'Erro ao gerar embedding');
            }
        }
    }

    // Final verification
    const withEmbeddings = await prisma.vehicle.count({
        where: {
            embedding: { not: null },
            disponivel: true,
        },
    });

    const totalAvailable = await prisma.vehicle.count({ where: { disponivel: true } });

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA GERAÇÃO DE EMBEDDINGS');
    console.log('='.repeat(60));
    console.log(`✅ Processados com sucesso: ${processed}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📈 Taxa de sucesso: ${((processed / vehicles.length) * 100).toFixed(1)}%`);
    console.log(`🎯 Veículos com embeddings: ${withEmbeddings}/${totalAvailable}`);

    if (withEmbeddings === totalAvailable) {
        console.log('\n✅ Todos os veículos possuem embeddings!');
    } else {
        console.log(`\n⚠️  ${totalAvailable - withEmbeddings} veículos ainda sem embeddings`);
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('\n' + '🚀'.repeat(30));
    console.log('\n🌱 SEED INICIAL - MVP Produção Renatinhu\'s Cars');
    console.log('📍 Source: https://www.renatinhuscars.com.br/');
    console.log('\n' + '🚀'.repeat(30));

    try {
        // Task 14.1: Run scraper
        const vehicles = await runScraper();

        if (vehicles.length === 0) {
            throw new Error('Nenhum veículo disponível para seed');
        }

        // Task 14.2: Sync with database
        await syncWithDatabase(vehicles);

        // Task 14.3: Generate embeddings
        await generateEmbeddings();

        // Final summary
        console.log('\n' + '🎉'.repeat(30));
        console.log('\n✅ SEED INICIAL CONCLUÍDO COM SUCESSO!');
        console.log('\n' + '🎉'.repeat(30));

        // Show final stats
        const stats = await vehicleSyncService.getSyncStats();
        console.log('\n📊 Estatísticas finais:');
        console.log(`  📦 Total de veículos: ${stats.totalVehicles}`);
        console.log(`  ✅ Disponíveis: ${stats.availableVehicles}`);
        console.log(`  ❌ Indisponíveis: ${stats.unavailableVehicles}`);
        console.log(`  🕐 Última sincronização: ${stats.lastSyncTime?.toISOString() || 'N/A'}`);

    } catch (error) {
        console.error('\n❌ ERRO NO SEED:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

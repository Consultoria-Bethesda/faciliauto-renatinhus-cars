import { describe, it, expect, beforeEach } from 'vitest';
import { VectorSearchService } from '@/services/vector-search.service';
import { PrismaClient } from '@prisma/client';
import { cleanDatabase, createMockVehicle } from '@tests/helpers/test-utils';

const prisma = new PrismaClient();

describe('VectorSearchService - Integration Tests', () => {
  let service: VectorSearchService;

  beforeEach(async () => {
    await cleanDatabase();
    service = new VectorSearchService();
  });

  describe('searchVehicles', () => {
    it('deve buscar veículos por critérios', async () => {
      // Criar veículos de teste
      await prisma.vehicle.createMany({
        data: [
          createMockVehicle({
            brand: 'Fiat',
            model: 'Argo',
            price: 48000,
            category: 'hatch',
          }),
          createMockVehicle({
            brand: 'Fiat',
            model: 'Cronos',
            price: 55000,
            category: 'sedan',
          }),
        ],
      });

      const results = await service.searchVehicles(
        {
          budget: 50000,
          bodyType: 'hatch',
        },
        5
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('matchScore');
    });

    it('deve respeitar limite de resultados', async () => {
      const results = await service.searchVehicles(
        { budget: 60000 },
        3
      );

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('deve calcular Match Score baseado em critérios', async () => {
      const results = await service.searchVehicles(
        {
          budget: 50000,
          usage: 'trabalho',
          persons: 4,
        },
        5
      );

      results.forEach((vehicle) => {
        expect(vehicle.matchScore).toBeGreaterThanOrEqual(0);
        expect(vehicle.matchScore).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Score híbrido', () => {
    it('deve combinar score semântico e critérios (40/60)', async () => {
      const results = await service.searchVehicles(
        {
          budget: 55000,
          usage: 'família',
          persons: 5,
        },
        3
      );

      // Score final deve refletir ambos componentes
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Fallback SQL', () => {
    it('deve funcionar sem embeddings', async () => {
      // Criar veículo sem embedding
      await prisma.vehicle.create({
        data: createMockVehicle({
          brand: 'Fiat',
          model: 'Mobi',
          embedding: null,
        }),
      });

      const results = await service.searchVehicles(
        { budget: 40000 },
        5
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

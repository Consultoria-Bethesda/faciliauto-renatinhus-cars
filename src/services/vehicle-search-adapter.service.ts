/**
 * Vehicle Search Adapter
 * 
 * Adapter to use inMemoryVectorStore with the interface expected by VehicleExpertAgent
 */

import { inMemoryVectorStore } from './in-memory-vector.service';
import { prisma } from '../lib/prisma';
import { VehicleRecommendation } from '../types/state.types';
import { logger } from '../lib/logger';

interface SearchFilters {
  maxPrice?: number;
  minPrice?: number;
  minYear?: number;
  maxKm?: number;
  bodyType?: string;
  transmission?: string;
  brand?: string;
  model?: string;  // Modelo específico (ex: "Compass", "Civic")
  limit?: number;
  // Uber filters
  aptoUber?: boolean;
  aptoUberBlack?: boolean;
  // Family filter
  aptoFamilia?: boolean;
  // Work filter
  aptoTrabalho?: boolean;
}

export class VehicleSearchAdapter {
  /**
   * Search vehicles using semantic search + filters
   * When brand is specified, does DIRECT database search (not semantic)
   */
  async search(
    query: string,
    filters: SearchFilters = {}
  ): Promise<VehicleRecommendation[]> {
    try {
      const limit = filters.limit || 5;

      // Se tem filtro de marca ou modelo específico, fazer busca DIRETA no banco
      // (não depender da busca semântica que pode não retornar o veículo)
      if (filters.brand || filters.model) {
        logger.info({ brand: filters.brand, model: filters.model, query }, 'Direct database search for specific brand/model');
        return this.searchDirectByBrandModel(filters);
      }

      // Get vehicle IDs from semantic search
      const vehicleIds = await inMemoryVectorStore.search(query, limit * 2); // Get more to filter

      // Se busca semântica não retornou nada, fazer fallback para busca SQL
      if (vehicleIds.length === 0) {
        logger.info({ query, filters }, 'Semantic search returned empty, falling back to SQL');
        return this.searchFallbackSQL(filters);
      }

      // Fetch full vehicle data
      const vehicles = await prisma.vehicle.findMany({
        where: {
          id: { in: vehicleIds },
          disponivel: true,
          // Apply filters
          ...(filters.maxPrice && { preco: { lte: filters.maxPrice } }),
          ...(filters.minPrice && { preco: { gte: filters.minPrice } }),
          ...(filters.minYear && { ano: { gte: filters.minYear } }),
          ...(filters.maxKm && { km: { lte: filters.maxKm } }),
          ...(filters.bodyType && { carroceria: { equals: filters.bodyType, mode: 'insensitive' } }),
          ...(filters.transmission && { cambio: { equals: filters.transmission, mode: 'insensitive' } }),
          ...(filters.brand && { marca: { equals: filters.brand, mode: 'insensitive' } }),
          // Uber filters
          ...(filters.aptoUber && { aptoUber: true }),
          ...(filters.aptoUberBlack && { aptoUberBlack: true }),
          // Family filter
          ...(filters.aptoFamilia && { aptoFamilia: true }),
          // Work filter
          ...(filters.aptoTrabalho && { aptoTrabalho: true }),
        },
        take: limit,
        orderBy: [
          { preco: 'desc' },  // Mais caro primeiro
          { km: 'asc' },      // Menos rodado
          { ano: 'desc' },    // Mais novo
        ],
      });

      // Se filtrou por bodyType e não encontrou nada, buscar SEM o filtro de IDs
      // para verificar se existem veículos desse tipo no estoque
      if (vehicles.length === 0 && filters.bodyType) {
        const existsInStock = await prisma.vehicle.count({
          where: {
            disponivel: true,
            carroceria: { equals: filters.bodyType, mode: 'insensitive' },
          },
        });
        
        if (existsInStock === 0) {
          logger.info({ bodyType: filters.bodyType }, 'Body type not available in stock');
          return []; // Retorna vazio para trigger "não temos X no estoque"
        }
        
        // Se existe no estoque mas não veio da busca semântica, fazer fallback SQL
        return this.searchFallbackSQL(filters);
      }

      // Convert to VehicleRecommendation format
      return vehicles.map((vehicle, index) => ({
        vehicleId: vehicle.id,
        matchScore: Math.max(95 - index * 5, 70), // Simple scoring based on order
        reasoning: `Veículo ${index + 1} mais relevante para sua busca`,
        highlights: this.generateHighlights(vehicle),
        concerns: [],
        vehicle: {
          id: vehicle.id,
          brand: vehicle.marca,
          model: vehicle.modelo,
          year: vehicle.ano,
          price: vehicle.preco,
          mileage: vehicle.km,
          bodyType: vehicle.carroceria,
          transmission: vehicle.cambio,
          fuelType: vehicle.combustivel,
          color: vehicle.cor,
          imageUrl: vehicle.fotoUrl || null,
          detailsUrl: vehicle.url || null,
        }
      }));

    } catch (error) {
      logger.error({ error, query, filters }, 'Error searching vehicles');
      return [];
    }
  }

  /**
   * Busca direta por marca e/ou modelo específico (não usa busca semântica)
   */
  private async searchDirectByBrandModel(filters: SearchFilters): Promise<VehicleRecommendation[]> {
    const limit = filters.limit || 5;

    const vehicles = await prisma.vehicle.findMany({
      where: {
        disponivel: true,
        // Filtro de marca (se especificado)
        ...(filters.brand && { marca: { contains: filters.brand, mode: 'insensitive' } }),
        // Filtro de modelo (se especificado)
        ...(filters.model && { modelo: { contains: filters.model, mode: 'insensitive' } }),
        // Apply other filters
        ...(filters.maxPrice && { preco: { lte: filters.maxPrice } }),
        ...(filters.minPrice && { preco: { gte: filters.minPrice } }),
        ...(filters.minYear && { ano: { gte: filters.minYear } }),
        ...(filters.maxKm && { km: { lte: filters.maxKm } }),
        ...(filters.bodyType && { carroceria: { equals: filters.bodyType, mode: 'insensitive' } }),
        ...(filters.transmission && { cambio: { equals: filters.transmission, mode: 'insensitive' } }),
      },
      take: limit,
      orderBy: [
        { preco: 'desc' },
        { km: 'asc' },
        { ano: 'desc' },
      ],
    });

    logger.info({ brand: filters.brand, model: filters.model, found: vehicles.length }, 'Direct brand/model search results');

    return this.formatVehicleResults(vehicles);
  }

  /**
   * Busca SQL fallback quando busca semântica não retorna resultados
   */
  private async searchFallbackSQL(filters: SearchFilters): Promise<VehicleRecommendation[]> {
    const limit = filters.limit || 5;

    const vehicles = await prisma.vehicle.findMany({
      where: {
        disponivel: true,
        ...(filters.maxPrice && { preco: { lte: filters.maxPrice } }),
        ...(filters.minPrice && { preco: { gte: filters.minPrice } }),
        ...(filters.minYear && { ano: { gte: filters.minYear } }),
        ...(filters.maxKm && { km: { lte: filters.maxKm } }),
        ...(filters.bodyType && { carroceria: { equals: filters.bodyType, mode: 'insensitive' } }),
        ...(filters.transmission && { cambio: { equals: filters.transmission, mode: 'insensitive' } }),
        ...(filters.brand && { marca: { equals: filters.brand, mode: 'insensitive' } }),
        ...(filters.aptoUber && { aptoUber: true }),
        ...(filters.aptoUberBlack && { aptoUberBlack: true }),
        ...(filters.aptoFamilia && { aptoFamilia: true }),
        ...(filters.aptoTrabalho && { aptoTrabalho: true }),
      },
      take: limit,
      orderBy: [
        { preco: 'desc' },
        { km: 'asc' },
        { ano: 'desc' },
      ],
    });

    logger.info({ filters, found: vehicles.length }, 'SQL fallback search results');

    return this.formatVehicleResults(vehicles);
  }

  /**
   * Formata veículos para o formato VehicleRecommendation
   */
  private formatVehicleResults(vehicles: any[]): VehicleRecommendation[] {
    return vehicles.map((vehicle, index) => ({
      vehicleId: vehicle.id,
      matchScore: Math.max(95 - index * 5, 70),
      reasoning: `Veículo ${index + 1} mais relevante para sua busca`,
      highlights: this.generateHighlights(vehicle),
      concerns: [],
      vehicle: {
        id: vehicle.id,
        brand: vehicle.marca,
        model: vehicle.modelo,
        year: vehicle.ano,
        price: vehicle.preco,
        mileage: vehicle.km,
        bodyType: vehicle.carroceria,
        transmission: vehicle.cambio,
        fuelType: vehicle.combustivel,
        color: vehicle.cor,
        imageUrl: vehicle.fotoUrl || null,
        detailsUrl: vehicle.url || null,
      }
    }));
  }

  /**
   * Generate highlights for a vehicle
   */
  private generateHighlights(vehicle: any): string[] {
    const highlights: string[] = [];

    // Low mileage
    if (vehicle.km < 50000) {
      highlights.push(`Baixa quilometragem: ${vehicle.km.toLocaleString('pt-BR')}km`);
    }

    // Recent year
    const currentYear = new Date().getFullYear();
    if (vehicle.ano >= currentYear - 3) {
      highlights.push(`Veículo recente: ${vehicle.ano}`);
    }

    // Features
    const features = [];
    if (vehicle.arCondicionado) features.push('Ar condicionado');
    if (vehicle.direcaoHidraulica) features.push('Direção hidráulica');
    if (vehicle.airbag) features.push('Airbag');
    if (vehicle.abs) features.push('ABS');

    if (features.length > 0) {
      highlights.push(`Equipado: ${features.slice(0, 2).join(', ')}`);
    }

    return highlights.slice(0, 3); // Max 3 highlights
  }
}

// Singleton export
export const vehicleSearchAdapter = new VehicleSearchAdapter();

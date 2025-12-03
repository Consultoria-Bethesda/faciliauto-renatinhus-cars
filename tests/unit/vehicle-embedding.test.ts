/**
 * Unit tests for Vehicle Embedding Service
 * 
 * Tests the generateVehicleEmbeddingText function to ensure
 * it correctly combines all vehicle attributes for semantic search.
 */

import { describe, it, expect } from 'vitest';
import {
    generateVehicleEmbeddingText,
    VehicleForEmbedding,
} from '../../src/services/vehicle-embedding.service';

describe('Vehicle Embedding Service - Unit Tests', () => {
    describe('generateVehicleEmbeddingText', () => {
        it('deve incluir todos os atributos obrigatórios no texto', () => {
            const vehicle: VehicleForEmbedding = {
                id: 'test-id',
                marca: 'Fiat',
                modelo: 'Uno',
                versao: '1.0 Fire',
                ano: 2020,
                km: 45000,
                preco: 35000,
                carroceria: 'Hatch',
                combustivel: 'Flex',
                cambio: 'Manual',
            };

            const text = generateVehicleEmbeddingText(vehicle);

            // Verificar que todos os campos obrigatórios estão presentes
            expect(text).toContain('Fiat');
            expect(text).toContain('Uno');
            expect(text).toContain('1.0 Fire');
            expect(text).toContain('2020');
            expect(text).toContain('45.000'); // km formatado
            expect(text).toContain('R$'); // preço formatado
            expect(text).toContain('35.000'); // preço
            expect(text).toContain('Hatch');
            expect(text).toContain('Flex');
            expect(text).toContain('Manual');
        });

        it('deve funcionar sem versão', () => {
            const vehicle: VehicleForEmbedding = {
                id: 'test-id',
                marca: 'Volkswagen',
                modelo: 'Gol',
                ano: 2019,
                km: 60000,
                preco: 42000,
                carroceria: 'Hatch',
                combustivel: 'Flex',
                cambio: 'Manual',
            };

            const text = generateVehicleEmbeddingText(vehicle);

            expect(text).toContain('Volkswagen');
            expect(text).toContain('Gol');
            expect(text).toContain('2019');
        });

        it('deve incluir descrição quando disponível', () => {
            const vehicle: VehicleForEmbedding = {
                id: 'test-id',
                marca: 'Honda',
                modelo: 'Civic',
                ano: 2021,
                km: 30000,
                preco: 95000,
                carroceria: 'Sedan',
                combustivel: 'Flex',
                cambio: 'Automático',
                descricao: 'Único dono, revisões em dia',
            };

            const text = generateVehicleEmbeddingText(vehicle);

            expect(text).toContain('Único dono, revisões em dia');
        });

        it('deve lançar erro para veículo sem marca', () => {
            const vehicle = {
                id: 'test-id',
                marca: '',
                modelo: 'Civic',
                ano: 2021,
                km: 30000,
                preco: 95000,
                carroceria: 'Sedan',
                combustivel: 'Flex',
                cambio: 'Automático',
            } as VehicleForEmbedding;

            expect(() => generateVehicleEmbeddingText(vehicle)).toThrow(
                'Veículo deve ter marca e modelo definidos'
            );
        });

        it('deve lançar erro para veículo sem modelo', () => {
            const vehicle = {
                id: 'test-id',
                marca: 'Honda',
                modelo: '',
                ano: 2021,
                km: 30000,
                preco: 95000,
                carroceria: 'Sedan',
                combustivel: 'Flex',
                cambio: 'Automático',
            } as VehicleForEmbedding;

            expect(() => generateVehicleEmbeddingText(vehicle)).toThrow(
                'Veículo deve ter marca e modelo definidos'
            );
        });

        it('deve formatar km com separador de milhar', () => {
            const vehicle: VehicleForEmbedding = {
                id: 'test-id',
                marca: 'Toyota',
                modelo: 'Corolla',
                ano: 2022,
                km: 150000,
                preco: 120000,
                carroceria: 'Sedan',
                combustivel: 'Flex',
                cambio: 'Automático',
            };

            const text = generateVehicleEmbeddingText(vehicle);

            // Deve conter km formatado (150.000 ou 150,000 dependendo do locale)
            expect(text).toMatch(/150[.,]000/);
        });

        it('deve formatar preço como moeda brasileira', () => {
            const vehicle: VehicleForEmbedding = {
                id: 'test-id',
                marca: 'Chevrolet',
                modelo: 'Onix',
                ano: 2023,
                km: 10000,
                preco: 75500,
                carroceria: 'Hatch',
                combustivel: 'Flex',
                cambio: 'Automático',
            };

            const text = generateVehicleEmbeddingText(vehicle);

            // Deve conter R$ e o valor formatado
            expect(text).toContain('R$');
            expect(text).toMatch(/75[.,]500/);
        });
    });
});

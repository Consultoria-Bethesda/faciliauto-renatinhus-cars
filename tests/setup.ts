import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Carregar variáveis de ambiente de teste
dotenv.config({ path: '.env.test' });

// Instância global do Prisma para testes
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./test.db',
    },
  },
});

// Setup global antes de todos os testes
beforeAll(async () => {
  console.log('🚀 Iniciando setup de testes...');
  
  // Garantir que estamos em ambiente de teste
  if (process.env.NODE_ENV !== 'test') {
    console.warn('⚠️  NODE_ENV não está configurado como "test"');
    process.env.NODE_ENV = 'test';
  }

  // Conectar ao banco de teste
  try {
    await prisma.$connect();
    console.log('✅ Conectado ao banco de teste');
  } catch (error) {
    console.error('❌ Erro ao conectar ao banco:', error);
    throw error;
  }
});

// Cleanup após todos os testes
afterAll(async () => {
  console.log('🧹 Limpando ambiente de teste...');
  
  try {
    await prisma.$disconnect();
    console.log('✅ Desconectado do banco de teste');
  } catch (error) {
    console.error('❌ Erro ao desconectar:', error);
  }
});

// Limpar dados antes de cada teste (opcional)
beforeEach(async () => {
  // Adicionar limpeza de tabelas se necessário
  // await prisma.conversation.deleteMany();
  // await prisma.consultation.deleteMany();
});

afterEach(async () => {
  // Cleanup adicional se necessário
});

// Helper para resetar banco entre testes
export async function resetDatabase() {
  const tables = ['Conversation', 'Consultation', 'Message', 'Recommendation'];
  
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
    } catch (error) {
      // Tabela pode não existir ainda
      console.warn(`⚠️  Não foi possível limpar tabela ${table}`);
    }
  }
}

// Helper para criar dados de teste
export async function seedTestData() {
  // Adicionar seed de dados de teste aqui
  console.log('🌱 Seed de dados de teste (se necessário)');
}

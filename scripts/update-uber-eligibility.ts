/**
 * Script para atualizar elegibilidade de veículos para Uber/aplicativos
 * 
 * ATUALIZADO: Usa whitelist rigorosa de modelos permitidos
 * 
 * Critérios Uber X / 99Pop:
 * - Ano: 2012+
 * - Modelo na whitelist Uber X
 * - Ar-condicionado obrigatório
 * - 4 portas
 * - NÃO é SUV grande ou Picape
 * 
 * Critérios Uber Black / 99TOP:
 * - Ano: 2018+
 * - Modelo na whitelist Uber Black
 * - Sedan premium apenas
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Whitelist de modelos permitidos pelo Uber
const UBER_X_MODELS = {
  honda: ['civic', 'city', 'fit'],
  toyota: ['corolla', 'etios', 'yaris'],
  chevrolet: ['onix', 'prisma', 'cruze', 'cobalt'],
  volkswagen: ['gol', 'voyage', 'polo', 'virtus', 'jetta', 'fox'],
  fiat: ['argo', 'cronos', 'siena', 'grand siena', 'palio', 'uno', 'mobi'],
  ford: ['ka', 'fiesta'],
  hyundai: ['hb20', 'hb20s', 'accent', 'elantra'],
  nissan: ['march', 'versa', 'sentra'],
  renault: ['logan', 'sandero', 'kwid'],
  peugeot: ['208', '2008'],
  citroën: ['c3', 'c4']
};

const UBER_BLACK_MODELS = {
  honda: ['civic'],
  toyota: ['corolla'],
  chevrolet: ['cruze'],
  volkswagen: ['jetta', 'passat'],
  nissan: ['sentra']
};

// Tipos NUNCA permitidos
const NEVER_ALLOWED_TYPES = ['suv', 'pickup', 'picape', 'minivan', 'van'];

function normalizeString(str: string): string {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isModelInWhitelist(marca: string, modelo: string, whitelist: any): boolean {
  const marcaNorm = normalizeString(marca);
  const modeloNorm = normalizeString(modelo);
  
  if (!whitelist[marcaNorm]) return false;
  
  return whitelist[marcaNorm].some((allowedModel: string) => 
    modeloNorm.includes(allowedModel) || allowedModel.includes(modeloNorm)
  );
}

function isNeverAllowedType(carroceria: string): boolean {
  const carrNorm = normalizeString(carroceria);
  return NEVER_ALLOWED_TYPES.some(type => carrNorm.includes(type));
}

async function updateUberEligibility() {
  console.log('🚖 Atualizando elegibilidade Uber...\n');
  
  try {
    // 1. Buscar todos os veículos
    const vehicles = await prisma.vehicle.findMany();
    
    console.log(`📊 Total de veículos: ${vehicles.length}\n`);
    
    let uberXCount = 0;
    let uberBlackCount = 0;
    let familiaCount = 0;
    let trabalhoCount = 0;
    
    for (const vehicle of vehicles) {
      const updates: any = {};
      
      // Check if vehicle type is NEVER allowed (SUV, Pickup, etc)
      const isNeverAllowed = isNeverAllowedType(vehicle.carroceria);
      
      // Critérios Uber X / 99Pop (com whitelist)
      const isUberX = !isNeverAllowed &&
        vehicle.ano >= 2012 &&
        vehicle.arCondicionado === true &&
        vehicle.portas >= 4 &&
        isModelInWhitelist(vehicle.marca, vehicle.modelo, UBER_X_MODELS);
      
      // Critérios Uber Black / 99TOP (com whitelist rigorosa)
      const isUberBlack = !isNeverAllowed &&
        vehicle.ano >= 2018 &&
        vehicle.arCondicionado === true &&
        vehicle.portas === 4 &&
        vehicle.carroceria.toLowerCase().includes('sedan') &&
        isModelInWhitelist(vehicle.marca, vehicle.modelo, UBER_BLACK_MODELS);
      
      // Classificação de economia de combustível
      let economiaCombustivel = 'media';
      if (vehicle.carroceria.toLowerCase().includes('hatch') || vehicle.km < 50000) {
        economiaCombustivel = 'alta';
      } else if (vehicle.carroceria.toLowerCase().includes('suv') || vehicle.km > 150000) {
        economiaCombustivel = 'baixa';
      }
      
      // Recomendado para família
      const aptoFamilia = 
        vehicle.portas >= 4 &&
        (vehicle.carroceria.toLowerCase().includes('suv') ||
         vehicle.carroceria.toLowerCase().includes('sedan') ||
         vehicle.carroceria.toLowerCase().includes('minivan'));
      
      // Bom para trabalho
      const aptoTrabalho = 
        vehicle.economiaCombustivel !== 'baixa' &&
        vehicle.arCondicionado === true;
      
      updates.aptoUber = isUberX;
      updates.aptoUberBlack = isUberBlack;
      updates.economiaCombustivel = economiaCombustivel;
      updates.aptoFamilia = aptoFamilia;
      updates.aptoTrabalho = aptoTrabalho;
      
      // Atualizar veículo
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: updates
      });
      
      if (isUberX) uberXCount++;
      if (isUberBlack) uberBlackCount++;
      if (aptoFamilia) familiaCount++;
      if (aptoTrabalho) trabalhoCount++;
      
      // Log veículos aptos para Uber
      if (isUberX || isUberBlack) {
        const tags = [];
        if (isUberX) tags.push('Uber X');
        if (isUberBlack) tags.push('Uber Black');
        
        console.log(`✅ ${vehicle.marca} ${vehicle.modelo} ${vehicle.ano} - ${tags.join(', ')}`);
        console.log(`   Preço: R$ ${vehicle.preco.toLocaleString('pt-BR')}`);
        console.log(`   Categoria: ${vehicle.carroceria}`);
        console.log(`   KM: ${vehicle.km.toLocaleString('pt-BR')}`);
        console.log();
      }
    }
    
    console.log('\n📊 RESUMO:');
    console.log(`🚖 Aptos Uber X / 99Pop: ${uberXCount} veículos`);
    console.log(`🚖 Aptos Uber Black / 99TOP: ${uberBlackCount} veículos`);
    console.log(`👨‍👩‍👧‍👦 Recomendados para família: ${familiaCount} veículos`);
    console.log(`💼 Bons para trabalho: ${trabalhoCount} veículos`);
    console.log();
    
    // Mostrar alguns exemplos de Uber
    console.log('\n💡 EXEMPLOS DE VEÍCULOS UBER:');
    
    const uberVehicles = await prisma.vehicle.findMany({
      where: { aptoUber: true },
      orderBy: { preco: 'asc' },
      take: 5
    });
    
    console.log('\n🚖 Top 5 mais baratos para Uber X:');
    for (const v of uberVehicles) {
      console.log(`   ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}`);
    }
    
    const blackVehicles = await prisma.vehicle.findMany({
      where: { aptoUberBlack: true },
      orderBy: { preco: 'asc' },
      take: 5
    });
    
    if (blackVehicles.length > 0) {
      console.log('\n🚖 Top 5 mais baratos para Uber Black:');
      for (const v of blackVehicles) {
        console.log(`   ${v.marca} ${v.modelo} ${v.ano} - R$ ${v.preco.toLocaleString('pt-BR')}`);
      }
    }
    
    console.log('\n✅ Atualização concluída!');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateUberEligibility();

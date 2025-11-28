# 🚖 Critérios Uber/99 - Lista Oficial Atualizada

**Fonte:** Uber Brasil 2024 + 99Pop

---

## 📋 Critérios Gerais (Todos os Níveis)

### Obrigatórios:
- ✅ Ar-condicionado funcionando
- ✅ 4 portas
- ✅ 5 lugares (motorista + 4 passageiros)
- ✅ Documentação em dia
- ✅ Sem sinistro
- ✅ Vidros elétricos (pelo menos dianteiros)
- ✅ Direção hidráulica ou elétrica

---

## 🚗 Uber X / 99Pop (Básico)

### Critérios:
- **Ano:** 2012 ou mais recente (alguns estados 2010+)
- **Tipo:** Sedan ou Hatch
- **Portas:** 4
- **Cilindrada:** Mínimo 1.0

### ❌ NÃO PERMITIDO:
- Picapes
- SUVs grandes (Pajero, L200, etc)
- Caminhonetes
- Veículos 2 portas
- Utilitários

### ✅ Marcas/Modelos Permitidos (Exemplos):

**Sedans:**
- Honda: Civic, City, Fit Sedan
- Toyota: Corolla, Etios Sedan
- Chevrolet: Onix Plus, Prisma, Cruze
- Volkswagen: Voyage, Polo Sedan, Virtus, Jetta
- Fiat: Grand Siena, Cronos
- Ford: Ka Sedan
- Hyundai: HB20S, Accent, Elantra
- Nissan: Versa

**Hatchs (até porte médio):**
- Honda: Fit, City hatch
- Toyota: Etios hatch, Yaris
- Chevrolet: Onix, Prisma
- Volkswagen: Gol, Polo, Fox
- Fiat: Palio, Uno, Argo, Mobi
- Ford: Ka, Fiesta
- Hyundai: HB20
- Nissan: March

---

## 🚙 Uber Comfort / 99TOP

### Critérios:
- **Ano:** 2015 ou mais recente
- **Tipo:** Sedan médio/grande APENAS
- **Porta-malas:** Mínimo 450 litros
- **Cilindrada:** Mínimo 1.6
- **Banco traseiro:** Espaço generoso

### ✅ Modelos Permitidos:
- Honda: Civic (2015+)
- Toyota: Corolla (2015+)
- Chevrolet: Cruze (2015+)
- Volkswagen: Jetta (2015+)
- Nissan: Sentra (2015+)
- Hyundai: Elantra (2015+)

### ❌ NÃO PERMITIDO:
- Hatchs (todos)
- SUVs
- Sedans compactos (Voyage, Prisma, etc)

---

## 🎩 Uber Black / 99Lux

### Critérios RIGOROSOS:
- **Ano:** 2018 ou mais recente
- **Tipo:** Sedan PREMIUM apenas
- **Cor:** Preto preferencialmente
- **Interior:** Couro ou similar (obrigatório)
- **Cilindrada:** Mínimo 2.0

### ✅ Modelos Permitidos (Lista Restrita):
- Honda: Civic Touring/Sport (2018+)
- Toyota: Corolla Altis/XEI (2018+)
- Chevrolet: Cruze Premier (2018+)
- Volkswagen: Jetta Comfortline+ (2018+)
- Nissan: Sentra SL/SV (2018+)

### ❌ NÃO PERMITIDO:
- SUVs (mesmo premium)
- Versões básicas (Ex: Corolla GLI)
- Hatchs
- Sedans compactos

---

## 🚫 NUNCA Permitido para Uber:

### Tipos de Veículo:
- ❌ SUVs grandes (Pajero, Hilux SW4, Tiguan Allspace, etc)
- ❌ Picapes (Hilux, Ranger, S10, etc)
- ❌ Minivans (Spin, Zafira, etc) - apenas UberXL específico
- ❌ Caminhonetes
- ❌ Veículos 2 portas
- ❌ Conversíveis
- ❌ Carros esportivos
- ❌ Veículos rebaixados
- ❌ GNV (alguns estados)

### Marcas Geralmente NÃO Aceitas:
- ❌ Mitsubishi (Pajero, L200, ASX)
- ❌ Jeep Compass (algumas cidades não aceitam SUV)
- ❌ SUVs em geral (Tucson, Sportage, Tiguan, etc)

---

## 📊 Resumo por Categoria

| Categoria | Ano Mín. | Tipos Aceitos | Exemplos |
|-----------|----------|---------------|----------|
| **Uber X** | 2012+ | Sedan compacto/médio, Hatch | Civic, Corolla, Onix, Gol |
| **Comfort** | 2015+ | Sedan médio/grande APENAS | Civic, Corolla, Cruze |
| **Black** | 2018+ | Sedan PREMIUM APENAS | Civic Touring, Corolla Altis |

---

## 🔧 Como Implementar

### Criar lista whitelist de modelos:

```typescript
const UBER_ALLOWED_MODELS = {
  'uber_x': {
    'honda': ['civic', 'city', 'fit'],
    'toyota': ['corolla', 'etios'],
    'chevrolet': ['onix', 'prisma', 'cruze'],
    'volkswagen': ['gol', 'voyage', 'polo', 'virtus', 'jetta', 'fox'],
    'fiat': ['argo', 'cronos', 'siena', 'palio', 'uno'],
    'ford': ['ka', 'fiesta'],
    'hyundai': ['hb20', 'accent', 'elantra'],
    'nissan': ['march', 'versa']
  },
  'uber_black': {
    'honda': ['civic touring', 'civic sport'],
    'toyota': ['corolla altis', 'corolla xei'],
    'chevrolet': ['cruze premier'],
    'volkswagen': ['jetta comfortline'],
    'nissan': ['sentra sl', 'sentra sv']
  }
};
```

### Lógica de validação:
1. ❌ Rejeitar SUVs (Pajero, Compass, etc)
2. ❌ Rejeitar Picapes (L200, Hilux, etc)
3. ✅ Verificar se marca/modelo está na whitelist
4. ✅ Verificar ano mínimo
5. ✅ Verificar ar-condicionado + 4 portas

---

**Criado:** 2025-11-28  
**Status:** Pendente implementação  
**Próximo:** Atualizar script update-uber-eligibility.ts

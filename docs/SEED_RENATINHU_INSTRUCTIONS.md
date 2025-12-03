# Seed Inicial - Renatinhu's Cars

## Visão Geral

Este documento explica como executar o seed inicial para o MVP de produção da Renatinhu's Cars.

O seed realiza três tarefas:
1. **Task 14.1**: Extrai/carrega veículos (30 veículos do estoque)
2. **Task 14.2**: Sincroniza com o banco de dados PostgreSQL
3. **Task 14.3**: Gera embeddings para busca vetorial

## Pré-requisitos

- Aplicação deployada no Railway
- Variáveis de ambiente configuradas:
  - `DATABASE_URL` - URL do PostgreSQL
  - `OPENAI_API_KEY` - Chave da API OpenAI para embeddings
  - `SEED_SECRET` - Secret para autenticação do endpoint

## Executando o Seed

### Via HTTP Endpoint (Recomendado para Railway)

O seed pode ser executado via HTTP quando a aplicação está rodando no Railway:

```bash
# Substitua YOUR_APP_URL pela URL do seu app no Railway
# Substitua YOUR_SECRET pelo valor de SEED_SECRET

curl "https://YOUR_APP_URL/admin/seed-renatinhu?secret=YOUR_SECRET"
```

Exemplo:
```bash
curl "https://faciliauto-mvp.up.railway.app/admin/seed-renatinhu?secret=robustcar2025"
```

### Via Script Local (Requer acesso ao banco)

Se você tiver acesso direto ao banco de dados (ex: DATABASE_URL público):

```bash
npm run db:seed:renatinhu-initial
```

## Verificando o Resultado

### Via Endpoint de Stats

```bash
curl "https://YOUR_APP_URL/admin/stats"
```

Resposta esperada:
```json
{
  "success": true,
  "stats": {
    "vehicles": {
      "total": 30,
      "available": 30,
      "withEmbeddings": 30
    },
    "conversations": 0,
    "recommendations": 0,
    "leads": 0
  },
  "byBrand": [
    { "marca": "Chevrolet", "count": 7 },
    { "marca": "Honda", "count": 5 },
    { "marca": "Fiat", "count": 5 },
    ...
  ]
}
```

## Resposta do Seed

O endpoint retorna um JSON com o resultado:

```json
{
  "success": true,
  "message": "✅ Seed Renatinhu's Cars executado com sucesso!",
  "sync": {
    "added": 30,
    "updated": 0,
    "removed": 0,
    "errors": 0
  },
  "embeddings": {
    "generated": 30,
    "errors": 0
  },
  "finalStats": {
    "totalVehicles": 30,
    "availableVehicles": 30,
    "withEmbeddings": 30
  },
  "timestamp": "2025-12-03T..."
}
```

## Troubleshooting

### Erro de Conexão com Banco

Se receber erro de conexão com o banco:
- Verifique se `DATABASE_URL` está configurado corretamente
- O endpoint interno do Railway (`postgres.railway.internal`) só funciona dentro da rede Railway

### Erro de API Key

Se os embeddings falharem:
- Verifique se `OPENAI_API_KEY` está configurado
- Verifique se a chave tem créditos disponíveis

### Timeout

O seed pode demorar alguns minutos devido à geração de embeddings. Se ocorrer timeout:
1. Verifique os logs do Railway
2. Execute novamente - o seed é idempotente

## Arquivos Relacionados

- `src/scripts/seed-initial.ts` - Script de seed local
- `src/scripts/scrape-renatinhu.ts` - Dados estáticos dos veículos
- `src/routes/admin.routes.ts` - Endpoint HTTP do seed
- `src/services/vehicle-sync.service.ts` - Serviço de sincronização
- `src/services/vehicle-embedding.service.ts` - Serviço de embeddings

# 📱 Teste com Número Real - WhatsApp Business API

## ✅ Status Atual

- **API configurada**: ✅ Credenciais válidas
- **Servidor rodando**: ✅ Porta 3000 ativa
- **Embeddings**: ⚠️ Corrigido para usar OpenAI (precisa rodar script)
- **Teste de envio**: ⚠️ Número não autorizado (erro esperado)

## 🎯 Próximos Passos

### 1. Adicionar Número na Lista de Permitidos (2 min)

O erro `#131030` significa que você precisa autorizar seu número no Meta Developers:

**Passo a passo:**

1. Acesse: https://developers.facebook.com/
2. Vá em **"Meus Apps"** → Selecione seu app **"FaciliAuto WhatsApp Bot"**
3. No menu lateral: **WhatsApp → Primeiros Passos**
4. Procure a seção **"Para"** (ou "Send test messages")
5. Digite seu número no formato: **+55 11 93776-1896**
6. Clique em **"Adicionar destinatário"** ou **"Add"**
7. Você receberá um código de verificação no WhatsApp
8. Digite o código para confirmar

### 2. Configurar Webhook para Receber Mensagens (5 min)

Você tem duas opções:

#### Opção A: Usar ngrok (Teste Local - Recomendado)

```bash
# Instalar ngrok
npm install -g ngrok

# Expor servidor local
ngrok http 3000

# Copie a URL gerada (ex: https://abc123.ngrok.io)
```

**Configurar no Meta:**
1. WhatsApp → **Configuração** → **Webhook**
2. Clique em **"Editar"**
3. **URL de callback**: `https://abc123.ngrok.io/webhooks/whatsapp`
4. **Token de verificação**: `faciliauto_webhook_2025`
5. Clique em **"Verificar e salvar"**
6. Em **"Campos do webhook"**, ative:
   - ✅ `messages`
   - ✅ `message_status`

#### Opção B: Deploy Railway (Produção)

Se já fez deploy no Railway:

1. Pegue a URL do Railway (ex: `faciliauto-mvp-v2-production.up.railway.app`)
2. Configure webhook: `https://sua-url.railway.app/webhooks/whatsapp`
3. Token: `faciliauto_webhook_2025`

### 3. Gerar Embeddings OpenAI (1 min)

O código estava usando Jina (mock), mas está configurado para OpenAI. Execute:

```bash
export PATH="/home/rafaelnovaes22/nodejs/bin:$PATH"
cd /home/rafaelnovaes22/faciliauto-mvp-v2

# Verificar status
npm run embeddings:stats

# Gerar embeddings com OpenAI
npm run embeddings:generate

# Verificar novamente
npm run embeddings:stats
```

### 4. Reiniciar Servidor (30s)

```bash
# Parar servidor atual
pkill -f "tsx src/index.ts"

# Iniciar novamente
export PATH="/home/rafaelnovaes22/nodejs/bin:$PATH"
cd /home/rafaelnovaes22/faciliauto-mvp-v2
npx tsx src/index.ts > server.log 2>&1 &

# Verificar logs
tail -f server.log
```

### 5. Testar Envio (30s)

```bash
# Editar test-whatsapp-complete.ts e colocar seu número
# Formato: 5511937761896 (sem + e sem espaços)

npx tsx test-whatsapp-complete.ts
```

### 6. Testar Conversa Completa (2 min)

1. Abra o WhatsApp
2. Você receberá a mensagem do bot
3. Responda: **"Oi"**
4. O bot deve responder automaticamente
5. Continue a conversa para testar o fluxo completo

---

## 🔍 Verificações Úteis

### Verificar se servidor está rodando
```bash
curl http://localhost:3000/health
```

### Verificar webhooks recebidos
```bash
tail -f server.log | grep webhook
```

### Verificar embeddings
```bash
npm run embeddings:stats
```

### Testar busca de veículos
```bash
curl http://localhost:3000/stats
```

---

## 🐛 Troubleshooting

### Erro: "Recipient phone number not in allowed list"
- ✅ **Solução**: Adicione seu número em Meta Developers (passo 1)

### Webhook não recebe mensagens
- Verifique se o webhook está configurado corretamente
- Teste a URL: `curl https://sua-url/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=faciliauto_webhook_2025&hub.challenge=123`
- Deve retornar: `123`

### Bot não responde
- Verifique logs: `tail -f server.log`
- Verifique se Groq API está funcionando
- Verifique se embeddings foram gerados

### Erro de embeddings
- Confirme que OPENAI_API_KEY está no .env
- Execute: `npm run embeddings:force`

---

## 📊 Checklist Final

Antes de testar:

- [ ] Número adicionado na lista de permitidos
- [ ] Webhook configurado (ngrok ou Railway)
- [ ] Embeddings gerados (28/28)
- [ ] Servidor rodando sem erros
- [ ] Groq API Key válida
- [ ] OpenAI API Key válida
- [ ] Meta WhatsApp Token válido

---

## 🚀 Comando Rápido (All-in-One)

```bash
# Setup completo
export PATH="/home/rafaelnovaes22/nodejs/bin:$PATH"
cd /home/rafaelnovaes22/faciliauto-mvp-v2

# Parar servidor
pkill -f "tsx src/index.ts"

# Gerar embeddings
npm run embeddings:generate

# Iniciar servidor
npx tsx src/index.ts > server.log 2>&1 &

# Ver logs
tail -f server.log

# Em outro terminal, testar envio
npx tsx test-whatsapp-complete.ts
```

---

## 📞 Seu Número de Teste

**Formato correto**: `5511937761896`  
**WhatsApp**: +55 11 93776-1896

Após adicionar na lista de permitidos, você pode enviar mensagens para este número via API!

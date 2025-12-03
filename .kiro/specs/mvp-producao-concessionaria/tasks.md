# Implementation Plan

## MVP Produção Concessionária Renatinhu's Cars

- [x] 1. Configurar Web Scraper para Renatinhu's Cars





  - [x] 1.1 Criar scraper service para extrair veículos do site


    - Implementar função para fazer request HTTP ao site https://www.renatinhuscars.com.br/
    - Parsear HTML para extrair lista de veículos da página principal
    - Extrair URL do botão "MAIS DETALHES" de cada veículo
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Implementar extração de detalhes completos do veículo


    - Acessar página de detalhes de cada veículo
    - Extrair: marca, modelo, versão, ano, km, preço, cor, combustível, câmbio, carroceria
    - Extrair URL da foto principal e fotos adicionais
    - Extrair descrição do veículo
    - _Requirements: 1.1, 1.3_
  - [x] 1.3 Implementar validação de dados extraídos


    - Criar função de validação para campos obrigatórios
    - Retornar erros detalhados para campos faltantes
    - Continuar processamento mesmo com erros em veículos individuais
    - _Requirements: 1.4, 1.5_
  - [x] 1.4 Write property tests for scraper









    - **Property 1: Scraper extracts all required vehicle fields**
    - **Property 2: Scraper captures URL for each vehicle**
    - **Property 3: Validation catches missing required fields**
    - **Validates: Requirements 1.1, 1.2, 1.4**

- [x] 2. Implementar Sincronização de Estoque





  - [x] 2.1 Criar vehicle sync service


    - Implementar função para comparar veículos do scraper com banco de dados
    - Criar novos veículos que não existem no banco
    - Atualizar veículos existentes com dados novos
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 Implementar lógica de remoção de veículos


    - Identificar veículos no banco que não estão mais no site
    - Marcar como indisponíveis (disponivel=false) em vez de deletar
    - Preservar histórico de recomendações
    - _Requirements: 2.3_
  - [x] 2.3 Garantir persistência do campo URL


    - Verificar que URL é salvo corretamente no banco
    - Validar que URL aponta para página de detalhes válida
    - _Requirements: 2.4_
  - [x] 2.4 Implementar logging de sincronização


    - Logar contagem de veículos adicionados, atualizados e removidos
    - Logar erros encontrados durante sincronização
    - _Requirements: 2.5_
  - [x] 2.5 Write property tests for sync service





    - **Property 4: Sync is idempotent (no duplicates)**
    - **Property 5: Sync marks removed vehicles as unavailable**
    - **Validates: Requirements 2.2, 2.3**

- [x] 3. Checkpoint - Verificar scraper e sync funcionando





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Configurar Geração de Embeddings





  - [x] 4.1 Implementar geração de texto para embedding


    - Criar função que combina atributos do veículo em texto descritivo
    - Incluir: marca, modelo, versão, ano, km, preço, carroceria, combustível, câmbio
    - Formatar texto de forma otimizada para busca semântica
    - _Requirements: 3.2_
  - [x] 4.2 Integrar com embedding router existente


    - Usar OpenAI text-embedding-3-small como primário
    - Configurar fallback para Cohere embed-multilingual-v3.0
    - _Requirements: 3.1, 3.3_

  - [x] 4.3 Implementar persistência de embeddings

    - Serializar embedding como JSON array no campo do veículo
    - Registrar modelo usado e timestamp de geração
    - _Requirements: 3.4, 3.5, 3.6_
  - [x] 4.4 Write property tests for embeddings





    - **Property 6: Embedding text representation includes all attributes**
    - **Property 7: Embedding serialization round-trip**
    - **Validates: Requirements 3.2, 3.5, 3.6**

- [x] 5. Adaptar Fluxo Conversacional





  - [x] 5.1 Atualizar greeting node


    - Personalizar mensagem de boas-vindas para Renatinhu's Cars
    - Manter disclosure de IA conforme ISO42001
    - Solicitar nome do cliente
    - _Requirements: 4.1_

  - [x] 5.2 Atualizar discovery node

    - Remover pergunta sobre quantidade de passageiros
    - Manter perguntas sobre budget, uso pretendido e preferências
    - Armazenar respostas no perfil do cliente
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 5.3 Implementar transição para recomendação


    - Verificar se perfil tem budget e pelo menos uma preferência
    - Transicionar automaticamente quando perfil estiver completo
    - _Requirements: 4.5_
  - [x] 5.4 Write property tests for conversation flow





    - **Property 8: Name input triggers state transition**
    - **Property 9: Preference extraction from answers**
    - **Property 10: Profile completeness triggers recommendation phase**
    - **Validates: Requirements 4.2, 4.4, 4.5**

- [x] 6. Checkpoint - Verificar fluxo conversacional





  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implementar Engine de Recomendação





  - [x] 7.1 Adaptar busca vetorial para top 5


    - Modificar recommendation agent para retornar 5 veículos
    - Manter ordenação por match score descendente
    - _Requirements: 5.1, 5.4_
  - [x] 7.2 Implementar filtro de budget com tolerância


    - Aplicar filtro de ±20% do budget informado
    - Garantir que todos os resultados estejam dentro da tolerância
    - _Requirements: 5.2_

  - [x] 7.3 Incluir URL nos resultados















    - Garantir que cada recomendação inclua URL do veículo
    - Validar que URL aponta para página "MAIS DETALHES"
    - _Requirements: 5.5_
  - [x] 7.4 Write property tests for recommendation engine





    - **Property 11: Budget filter applies ±20% tolerance**
    - **Property 12: Recommendations return at most 5 vehicles**
    - **Validates: Requirements 5.2, 5.4**

- [x] 8. Implementar Formatação de Mensagens







  - [x] 8.1 Criar formatador de card de veículo


    - Incluir marca, modelo, ano, km, preço e descrição breve
    - Usar markdown do WhatsApp (negrito, itálico)
    - Incluir URL como link clicável com call-to-action
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 8.2 Implementar numeração de veículos


    - Usar emojis numéricos (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣)
    - Facilitar referência pelo cliente
    - _Requirements: 6.4_
  - [x] 8.3 Implementar split de mensagens longas


    - Dividir mensagens que excedem 4096 caracteres
    - Preservar integridade do conteúdo ao dividir
    - _Requirements: 6.5_
  - [x] 8.4 Write property tests for message formatter





    - **Property 13: Vehicle formatting includes all required fields and URL**
    - **Property 14: Message formatting uses markdown and numbering**
    - **Property 15: Long messages are split correctly**
    - **Validates: Requirements 5.5, 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 9. Checkpoint - Verificar recomendações e formatação





  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Configurar Tratamento de Erros





  - [x] 10.1 Verificar fallback de LLM


    - Testar que sistema usa Groq quando OpenAI falha
    - Implementar mensagem amigável quando ambos falham
    - _Requirements: 7.1, 7.2_

  - [x] 10.2 Implementar tratamento de busca vazia

    - Retornar sugestões quando não há resultados
    - Oferecer opções para ampliar critérios
    - _Requirements: 7.3_

  - [x] 10.3 Implementar tratamento de erro de banco

    - Retornar mensagem de serviço indisponível
    - Logar erro com contexto completo
    - _Requirements: 7.4, 7.5_

- [x] 11. Verificar Integração WhatsApp Meta API





  - [x] 11.1 Validar webhook signature


    - Implementar validação HMAC-SHA256
    - Rejeitar requests com assinatura inválida
    - _Requirements: 8.1_
  - [x] 11.2 Verificar envio de mensagens


    - Testar envio via Meta Cloud API
    - Implementar retry com backoff exponencial
    - _Requirements: 8.2, 8.4_
  - [x] 11.3 Implementar verificação de webhook


    - Responder challenge token corretamente
    - _Requirements: 8.3_
  - [x] 11.4 Write property test for webhook





    - **Property 16: Webhook signature validation**
    - **Validates: Requirements 8.1**

- [x] 12. Verificar Segurança e Guardrails





  - [x] 12.1 Verificar sanitização de input


    - Testar remoção de caracteres de controle
    - Testar remoção de HTML
    - _Requirements: 9.1_

  - [x] 12.2 Verificar detecção de prompt injection

    - Testar bloqueio de padrões conhecidos
    - Logar tentativas de injection
    - _Requirements: 9.2_

  - [x] 12.3 Verificar rate limiting

    - Testar bloqueio após 10 msgs/min
    - Verificar reset do contador
    - _Requirements: 9.3_

  - [x] 12.4 Verificar validação de output

    - Testar detecção de vazamento de system prompt
    - _Requirements: 9.4_
  - [x] 12.5 Write property tests for guardrails





    - **Property 17: Input sanitization removes bad characters**
    - **Property 18: Prompt injection detection blocks malicious input**
    - **Property 19: Rate limiting blocks excessive requests**
    - **Property 20: Output validation prevents system prompt leakage**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 13. Configurar Monitoramento





  - [x] 13.1 Verificar logging de startup


    - Logar configuração e status de conexões
    - _Requirements: 10.1_

  - [x] 13.2 Implementar métricas de timing

    - Logar tempo total, tempo de LLM, tempo de busca
    - _Requirements: 10.2_

  - [x] 13.3 Verificar logging de recomendações

    - Logar match scores e reasoning
    - _Requirements: 10.3_
  - [x] 13.4 Implementar health endpoint


    - Retornar status de DB, LLM e WhatsApp
    - _Requirements: 10.5_

- [x] 14. Executar Seed Inicial
  - [x] 14.1 Rodar scraper para extrair 27 veículos
    - Executar scraper contra site Renatinhu's Cars
    - Validar que todos os veículos foram extraídos
    - ✅ Implementado: `src/scripts/seed-initial.ts` e endpoint `/admin/seed-renatinhu`
  - [x] 14.2 Sincronizar com banco de dados
    - Executar sync service
    - Verificar que 27 veículos estão no banco
    - ✅ Implementado: Usa `vehicleSyncService.syncFromScraper()`
  - [x] 14.3 Gerar embeddings para todos os veículos

    - Executar geração de embeddings
    - Verificar que todos os veículos têm embedding
    - ✅ Implementado: Gera embeddings via OpenAI text-embedding-3-small
  - 📝 **Nota**: Execute via HTTP endpoint no Railway: `curl "https://YOUR_APP_URL/admin/seed-renatinhu?secret=YOUR_SECRET"`

- [x] 15. Final Checkpoint - Verificar sistema completo
  - Ensure all tests pass, ask the user if questions arise.
-

- [x] 16. Implementar Lead Forwarding Service



  - [x] 16.1 Criar modelo Lead no Prisma

    - Adicionar modelo Lead ao schema.prisma com campos: customerName, customerPhone, vehicleId, vehicle details, conversationSummary, status, timestamps
    - Criar relação com Vehicle e Conversation
    - Executar migration do banco de dados
    - _Requirements: 11.7_

  - [x] 16.2 Implementar detecção de interesse do cliente

    - Criar função detectInterest que analisa mensagens do cliente
    - Implementar padrões de interesse: "quero esse", "tenho interesse", "quero agendar visita", etc.
    - Identificar qual veículo das recomendações o cliente se interessou (1-5)
    - Retornar confidence score da detecção
    - _Requirements: 11.1_

  - [x] 16.3 Implementar captura de dados do lead
    - Criar função captureLead que coleta: nome do cliente, telefone, veículo de interesse, resumo da conversa
    - Extrair preferências do cliente do estado da conversa
    - Gerar resumo automático da conversa usando LLM
    - _Requirements: 11.2_

  - [x] 16.4 Implementar formatação da mensagem para vendedor
    - Criar função formatLeadMessage com template estruturado
    - Incluir: nome do cliente, telefone clicável (wa.me/), detalhes do veículo, preferências, timestamp
    - Usar markdown do WhatsApp para formatação
    - _Requirements: 11.4_

  - [x] 16.5 Implementar envio do lead para vendedor com retry
    - Criar função sendToSeller que envia mensagem para SELLER_WHATSAPP_NUMBER
    - Implementar retry com exponential backoff (até 3 tentativas)
    - Logar erros e tentativas
    - _Requirements: 11.3, 11.6_

  - [x] 16.6 Implementar persistência do lead
    - Criar função persistLead que salva no banco com status "pending"
    - Atualizar status para "sent" após envio bem-sucedido
    - Atualizar status para "failed" após falha de todas as tentativas
    - _Requirements: 11.7_
  - [x] 16.7 Implementar confirmação para o cliente

    - Enviar mensagem de confirmação ao cliente após lead ser enviado
    - Informar que um vendedor entrará em contato em breve
    - _Requirements: 11.5_
  - [x] 16.8 Write property tests for lead forwarding



    - **Property 21: Interest detection identifies purchase intent**
    - **Property 22: Lead capture includes all required fields**
    - **Property 23: Lead message formatting includes all required information**
    - **Property 24: Lead persistence saves with pending status**
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.7**

- [x] 17. Integrar Lead Forwarding no Fluxo Conversacional

  - [x] 17.1 Criar Lead Forwarding Node no LangGraph
    - Adicionar novo node "lead_forwarding" ao grafo de conversação
    - Conectar após recommendation node quando interesse é detectado
    - Manter estado da conversa durante o processo
    - _Requirements: 11.1_

  - [x] 17.2 Configurar variável de ambiente SELLER_WHATSAPP_NUMBER
    - Adicionar SELLER_WHATSAPP_NUMBER ao .env.example
    - Documentar formato esperado (55XXXXXXXXXXX)
    - Validar configuração no startup
    - _Requirements: 11.3_

  - [x] 17.3 Atualizar Message Handler para processar leads

    - Integrar detecção de interesse no fluxo de mensagens
    - Chamar lead forwarding service quando interesse é detectado
    - Manter fluxo normal da conversa após captura do lead
    - _Requirements: 11.1, 11.5_

- [x] 18. Final Checkpoint - Verificar Lead Forwarding completo





  - Ensure all tests pass, ask the user if questions arise.

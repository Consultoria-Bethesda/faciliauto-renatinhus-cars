# Requirements Document

## Introduction

Este documento define os requisitos para um Dashboard de Acompanhamento de Leads multi-concessionária. O dashboard permitirá que equipes de vendas de diferentes concessionárias visualizem, filtrem e gerenciem os leads capturados pelo assistente de WhatsApp, acompanhando métricas de conversão e performance do funil de vendas.

O sistema será projetado para suportar múltiplas concessionárias (como Renatinhu's Cars, entre outras), permitindo visão consolidada para administradores e visão filtrada por concessionária para vendedores.

## Glossary

- **Dashboard**: Interface web para visualização e gestão de leads
- **Lead**: Cliente qualificado capturado pelo assistente de WhatsApp com interesse em um veículo
- **Concessionária (Dealership)**: Loja de veículos cadastrada no sistema, identificada por nome, CNPJ e configurações próprias
- **Tenant**: Contexto de isolamento de dados por concessionária
- **Status do Lead**: Estado atual do lead no funil (pending, sent, contacted, converted, lost)
- **Funil de Vendas**: Representação visual das etapas de conversão dos leads
- **KPI**: Key Performance Indicator - métricas de performance do sistema
- **Filtro**: Critério de seleção para visualização de leads específicos
- **Conversão**: Lead que resultou em venda efetiva
- **Taxa de Conversão**: Percentual de leads que se tornaram vendas
- **Tempo de Resposta**: Intervalo entre captura do lead e primeiro contato do vendedor
- **Usuário Admin**: Usuário com acesso a todas as concessionárias e visão consolidada
- **Usuário Vendedor**: Usuário vinculado a uma concessionária específica
- **Usuário Parceiro (Partner)**: Usuário com visão de todas as concessionárias focada em leads convertidos e comissões
- **Comissão**: Valor percentual ou fixo devido ao parceiro por cada lead convertido em venda
- **Valor da Venda**: Preço final do veículo vendido através do lead

## Requirements

### Requirement 1: Gestão de Concessionárias (Multi-tenant)

**User Story:** As a system administrator, I want to manage multiple dealerships in the system, so that each dealership can have its own leads, vehicles, and users.

#### Acceptance Criteria

1. WHEN a new dealership is registered THEN the Dashboard SHALL create a tenant record with: name, CNPJ, website URL, logo, and seller WhatsApp number
2. WHEN a dealership is created THEN the Dashboard SHALL generate a unique tenant identifier for data isolation
3. WHEN displaying leads THEN the Dashboard SHALL filter by the user's associated dealership (unless admin)
4. WHEN an admin user accesses the dashboard THEN the Dashboard SHALL provide a dealership selector to view consolidated or filtered data
5. WHEN a vehicle is scraped THEN the Dashboard SHALL associate it with the corresponding dealership

### Requirement 2: Visualização de Lista de Leads

**User Story:** As a sales manager, I want to view all captured leads in a list format, so that I can quickly see who needs follow-up.

#### Acceptance Criteria

1. WHEN the user accesses the dashboard THEN the Dashboard SHALL display a paginated list of leads ordered by capture date (most recent first)
2. WHEN displaying a lead THEN the Dashboard SHALL show: dealership name, customer name, phone number, vehicle of interest, status, and capture timestamp
3. WHEN the user clicks on a phone number THEN the Dashboard SHALL open WhatsApp Web with that number pre-filled
4. WHEN the list has more than 20 leads THEN the Dashboard SHALL provide pagination controls
5. WHEN new leads are captured THEN the Dashboard SHALL update the list automatically within 30 seconds

### Requirement 3: Filtros e Busca de Leads

**User Story:** As a sales manager, I want to filter and search leads, so that I can find specific customers or focus on leads that need attention.

#### Acceptance Criteria

1. WHEN the user selects a status filter THEN the Dashboard SHALL display only leads with that status (pending, sent, contacted, converted, lost)
2. WHEN the user selects a date range THEN the Dashboard SHALL display only leads captured within that period
3. WHEN the user types in the search box THEN the Dashboard SHALL filter leads by customer name or phone number
4. WHEN the user selects a vehicle filter THEN the Dashboard SHALL display only leads interested in that specific vehicle
5. WHEN an admin selects a dealership filter THEN the Dashboard SHALL display only leads from that dealership
6. WHEN multiple filters are applied THEN the Dashboard SHALL combine them with AND logic

### Requirement 4: Atualização de Status do Lead

**User Story:** As a salesperson, I want to update the status of a lead, so that the team knows the current state of each opportunity.

#### Acceptance Criteria

1. WHEN the user clicks on a lead's status THEN the Dashboard SHALL display a dropdown with available status options
2. WHEN the user selects a new status THEN the Dashboard SHALL update the lead in the database immediately
3. WHEN a lead status changes to "contacted" THEN the Dashboard SHALL record the contactedAt timestamp
4. WHEN a lead status changes to "converted" THEN the Dashboard SHALL prompt for sale details (optional)
5. IF the status update fails THEN the Dashboard SHALL display an error message and revert to the previous status

### Requirement 5: Métricas e KPIs do Funil

**User Story:** As a sales manager, I want to see key metrics about lead performance, so that I can evaluate the effectiveness of the WhatsApp bot.

#### Acceptance Criteria

1. WHEN the dashboard loads THEN the Dashboard SHALL display total leads count for the selected period
2. WHEN displaying metrics THEN the Dashboard SHALL show leads by status (pending, sent, contacted, converted, lost)
3. WHEN displaying metrics THEN the Dashboard SHALL calculate and show conversion rate (converted/total)
4. WHEN displaying metrics THEN the Dashboard SHALL show average time from capture to first contact
5. WHEN an admin views consolidated metrics THEN the Dashboard SHALL show a breakdown by dealership
6. WHEN the date filter changes THEN the Dashboard SHALL recalculate all metrics for the new period

### Requirement 6: Detalhes do Lead

**User Story:** As a salesperson, I want to view complete details of a lead, so that I can prepare for the follow-up call.

#### Acceptance Criteria

1. WHEN the user clicks on a lead row THEN the Dashboard SHALL display a detail panel with full lead information
2. WHEN displaying lead details THEN the Dashboard SHALL show: dealership info, customer preferences summary, conversation history summary, and vehicle details with photo
3. WHEN displaying vehicle details THEN the Dashboard SHALL include a link to the vehicle page on the dealership website
4. WHEN displaying the lead THEN the Dashboard SHALL show the complete timeline of status changes
5. WHEN the detail panel is open THEN the Dashboard SHALL provide a button to contact the customer via WhatsApp

### Requirement 7: Autenticação e Controle de Acesso

**User Story:** As a system administrator, I want to protect the dashboard with authentication and role-based access, so that users only see data from their dealership.

#### Acceptance Criteria

1. WHEN an unauthenticated user accesses the dashboard THEN the Dashboard SHALL redirect to a login page
2. WHEN the user provides valid credentials THEN the Dashboard SHALL create a session and grant access based on their role
3. WHEN a seller user logs in THEN the Dashboard SHALL restrict data access to their associated dealership only
4. WHEN an admin user logs in THEN the Dashboard SHALL allow access to all dealerships with a selector
5. WHEN the session expires (after 8 hours) THEN the Dashboard SHALL require re-authentication
6. WHEN displaying customer phone numbers THEN the Dashboard SHALL mask the middle digits for privacy (e.g., 11 9****-1234)
7. WHEN the user logs out THEN the Dashboard SHALL invalidate the session and redirect to login

### Requirement 8: Exportação de Dados

**User Story:** As a sales manager, I want to export lead data, so that I can create reports and analyze performance offline.

#### Acceptance Criteria

1. WHEN the user clicks the export button THEN the Dashboard SHALL generate a CSV file with the current filtered leads
2. WHEN exporting THEN the Dashboard SHALL include all lead fields: dealership, name, phone, vehicle, status, timestamps, and preferences
3. WHEN exporting THEN the Dashboard SHALL apply the current filters to the exported data
4. WHEN the export is ready THEN the Dashboard SHALL trigger a browser download
5. WHEN exporting large datasets (>1000 leads) THEN the Dashboard SHALL show a progress indicator

### Requirement 9: Responsividade e Usabilidade

**User Story:** As a salesperson, I want to access the dashboard from my mobile phone, so that I can check leads while away from my desk.

#### Acceptance Criteria

1. WHEN accessed from a mobile device THEN the Dashboard SHALL adapt the layout for smaller screens
2. WHEN on mobile THEN the Dashboard SHALL prioritize essential information (dealership, name, phone, status, action buttons)
3. WHEN on mobile THEN the Dashboard SHALL provide swipe gestures for quick status updates
4. WHEN loading data THEN the Dashboard SHALL display loading indicators to provide feedback
5. WHEN an action is completed THEN the Dashboard SHALL display a toast notification confirming success

### Requirement 10: Visão do Parceiro e Comissões

**User Story:** As a partner, I want to view all converted leads across all dealerships and track my commissions, so that I can monitor my earnings from the platform.

#### Acceptance Criteria

1. WHEN a partner user logs in THEN the Dashboard SHALL display a partner-specific view with all dealerships visible
2. WHEN displaying leads for a partner THEN the Dashboard SHALL show only leads with status "converted" by default
3. WHEN a lead is converted THEN the Dashboard SHALL allow recording the sale value (valor da venda)
4. WHEN displaying converted leads THEN the Dashboard SHALL calculate and show the commission amount based on configured rate
5. WHEN displaying partner metrics THEN the Dashboard SHALL show: total converted leads, total sales value, total commission earned, and commission pending payment
6. WHEN filtering by period THEN the Dashboard SHALL recalculate commission totals for that period
7. WHEN displaying the partner dashboard THEN the Dashboard SHALL show a breakdown of conversions and commissions by dealership

### Requirement 11: Configuração de Comissões por Concessionária

**User Story:** As an admin, I want to configure commission rates per dealership, so that partners receive the correct compensation for each converted lead.

#### Acceptance Criteria

1. WHEN configuring a dealership THEN the Dashboard SHALL allow setting a commission type (percentage or fixed value)
2. WHEN commission type is percentage THEN the Dashboard SHALL calculate commission as (sale value × percentage rate)
3. WHEN commission type is fixed THEN the Dashboard SHALL apply the fixed amount per converted lead
4. WHEN a dealership has no commission configured THEN the Dashboard SHALL use a default rate of 2%
5. WHEN updating commission rates THEN the Dashboard SHALL apply new rates only to future conversions (existing conversions keep original rate)


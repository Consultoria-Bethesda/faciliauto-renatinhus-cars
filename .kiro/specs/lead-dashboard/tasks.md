# Implementation Plan

## 1. Database Schema Updates

- [x] 1.1 Add Dealership model to Prisma schema
  - Create Dealership model with: id, name, cnpj, websiteUrl, logoUrl, sellerWhatsApp, isActive, timestamps
  - Add unique constraint on cnpj
  - _Requirements: 1.1, 1.2_

- [x] 1.2 Add User model for dashboard authentication
  - Create User model with: id, email, passwordHash, name, role, dealershipId, isActive, lastLoginAt, timestamps
  - Add unique constraint on email
  - Add relation to Dealership (optional for admin users)
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 1.3 Update existing models with dealershipId foreign key
  - Add dealershipId to Vehicle model with relation
  - Add dealershipId to Lead model with relation
  - Add dealershipId to Conversation model with relation
  - _Requirements: 1.3, 1.5_

- [x] 1.4 Add LeadEvent model for status timeline
  - Create LeadEvent model with: id, leadId, eventType, previousValue, newValue, userId, timestamp
  - Add relation to Lead
  - _Requirements: 6.4_

- [x] 1.5 Add commission fields to Dealership model
  - Add commissionType field (percentage or fixed, default: percentage)
  - Add commissionRate field (default: 2.0)
  - _Requirements: 11.1, 11.4_

- [x] 1.6 Add Sale model for commission tracking
  - Create Sale model with: id, leadId, saleValue, commissionRate, commissionType, commissionAmount, isPaid, paidAt, timestamps
  - Add unique constraint on leadId
  - Add relation to Lead
  - _Requirements: 10.3, 10.4_

- [x] 1.7 Run Prisma migration
  - Generate and apply migration for all schema changes
  - _Requirements: 1.1, 1.2, 1.3, 10.3, 11.1_

- [ ]* 1.8 Write property test for dealership ID uniqueness
  - **Property 2: Dealership ID Uniqueness**
  - **Validates: Requirements 1.2**

## 2. Authentication Service

- [x] 2.1 Create AuthService with JWT implementation
  - Implement login(email, password) returning JWT token
  - Implement validateToken(token) returning User or null
  - Implement hashPassword and comparePassword using bcrypt
  - Set token expiration to 8 hours
  - _Requirements: 7.1, 7.2, 7.5_

- [x] 2.2 Create auth middleware for protected routes
  - Extract and validate JWT from Authorization header
  - Attach user and dealershipId to request context
  - Return 401 for invalid/missing tokens
  - _Requirements: 7.1, 7.5_

- [ ]* 2.3 Write property test for authentication rejection
  - **Property 12: Authentication Rejection**
  - **Validates: Requirements 7.1**

- [ ]* 2.4 Write property test for valid login token
  - **Property 13: Valid Login Token**
  - **Validates: Requirements 7.2**

- [ ]* 2.5 Write property test for token expiration
  - **Property 15: Token Expiration**
  - **Validates: Requirements 7.5**

## 3. Checkpoint - Ensure all tests pass
  - [x] Ensure all tests pass, ask the user if questions arise.

## 4. Lead Service with Multi-tenant Support

- [x] 4.1 Create LeadService with tenant-aware queries
  - Implement findAll(filters, userId) with automatic dealership filtering for sellers
  - Implement findById(id, userId) with access control
  - Apply dealership filter based on user role (seller = own dealership, admin = all or filtered)
  - _Requirements: 1.3, 2.1, 7.3_

- [ ]* 4.2 Write property test for multi-tenant data isolation
  - **Property 1: Multi-tenant Data Isolation**
  - **Validates: Requirements 1.3, 7.3**

- [x] 4.3 Implement lead filtering logic
  - Filter by status (pending, sent, contacted, converted, lost)
  - Filter by date range (startDate, endDate on capturedAt)
  - Filter by search term (customerName or customerPhone contains)
  - Filter by vehicleId
  - Filter by dealershipId (admin only)
  - Combine all filters with AND logic
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ]* 4.4 Write property test for filter correctness
  - **Property 6: Filter Correctness**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

- [x] 4.5 Implement pagination for lead queries
  - Accept page and limit parameters
  - Return leads array, total count, current page, and totalPages
  - Default limit to 20
  - _Requirements: 2.4_

- [ ]* 4.6 Write property test for pagination correctness
  - **Property 5: Pagination Correctness**
  - **Validates: Requirements 2.4**

- [x] 4.7 Implement lead ordering by capturedAt descending
  - Order all lead queries by capturedAt DESC
  - _Requirements: 2.1_

- [ ]* 4.8 Write property test for lead ordering
  - **Property 3: Lead Ordering**
  - **Validates: Requirements 2.1**

## 5. Lead Status Management

- [x] 5.1 Implement updateStatus in LeadService
  - Update lead status with access control check
  - Set contactedAt timestamp when status changes to "contacted"
  - Create LeadEvent record for status change
  - _Requirements: 4.2, 4.3, 6.4_

- [ ]* 5.2 Write property test for status update persistence
  - **Property 7: Status Update Persistence**
  - **Validates: Requirements 4.2**

- [ ]* 5.3 Write property test for contactedAt timestamp
  - **Property 8: ContactedAt Timestamp**
  - **Validates: Requirements 4.3**

- [x] 5.4 Implement getTimeline in LeadService
  - Return all LeadEvent records for a lead ordered by timestamp
  - _Requirements: 6.4_

## 6. Checkpoint - Ensure all tests pass
  - [x] Ensure all tests pass, ask the user if questions arise.

## 7. Metrics Service

- [x] 7.1 Create MetricsService with dashboard metrics
  - Implement getDashboardMetrics(filters, userId)
  - Calculate totalLeads for period
  - Calculate byStatus breakdown
  - Apply dealership filter based on user role
  - _Requirements: 5.1, 5.2_

- [ ]* 7.2 Write property test for metrics total consistency
  - **Property 9: Metrics Total Consistency**
  - **Validates: Requirements 5.1, 5.2**

- [x] 7.3 Implement conversion rate calculation
  - Calculate conversionRate = converted / totalLeads
  - Handle division by zero (return 0)
  - _Requirements: 5.3_

- [ ]* 7.4 Write property test for conversion rate calculation
  - **Property 10: Conversion Rate Calculation**
  - **Validates: Requirements 5.3**

- [x] 7.5 Implement average response time calculation
  - Calculate mean of (contactedAt - capturedAt) for contacted leads
  - Return result in minutes
  - Handle case with no contacted leads (return 0)
  - _Requirements: 5.4_

- [ ]* 7.6 Write property test for average response time
  - **Property 11: Average Response Time Calculation**
  - **Validates: Requirements 5.4**

- [x] 7.7 Implement dealership breakdown for admin users
  - Group metrics by dealership when user is admin
  - Include dealership name and individual conversion rates
  - _Requirements: 5.5_

## 8. Phone Masking Utility

- [x] 8.1 Create phone masking utility function
  - Mask middle digits of phone number (format: XX X****-XXXX)
  - Apply to customerPhone in all API responses
  - _Requirements: 7.6_

- [ ]* 8.2 Write property test for phone number masking
  - **Property 16: Phone Number Masking**
  - **Validates: Requirements 7.6**

## 9. API Routes

- [x] 9.1 Create auth routes
  - POST /api/auth/login - authenticate and return JWT
  - POST /api/auth/logout - invalidate session
  - _Requirements: 7.1, 7.2, 7.7_

- [x] 9.2 Create leads routes
  - GET /api/leads - list leads with filters and pagination
  - GET /api/leads/:id - get lead details with timeline
  - PATCH /api/leads/:id/status - update lead status
  - Apply auth middleware to all routes
  - _Requirements: 2.1, 2.2, 3.1-3.6, 4.2, 6.1-6.5_

- [ ]* 9.3 Write property test for lead display completeness
  - **Property 4: Lead Display Completeness**
  - **Validates: Requirements 2.2**

- [ ]* 9.4 Write property test for admin access all dealerships
  - **Property 14: Admin Access All Dealerships**
  - **Validates: Requirements 7.4**

- [x] 9.5 Create metrics routes
  - GET /api/metrics - get dashboard metrics
  - Apply auth middleware
  - _Requirements: 5.1-5.6_

- [x] 9.6 Create dealerships routes (admin only)
  - GET /api/dealerships - list all dealerships
  - POST /api/dealerships - create dealership
  - PATCH /api/dealerships/:id - update dealership
  - Apply admin role check
  - _Requirements: 1.1, 1.4_

## 10. Export Functionality

- [x] 10.1 Implement CSV export in LeadService
  - Generate CSV with all lead fields including dealership name
  - Apply current filters to exported data
  - Return CSV string
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 10.2 Create export route
  - GET /api/leads/export - download CSV file
  - Set appropriate Content-Type and Content-Disposition headers
  - _Requirements: 8.1, 8.4_

- [ ]* 10.3 Write property test for export filter consistency
  - **Property 17: Export Filter Consistency**
  - **Validates: Requirements 8.1, 8.2, 8.3**

## 11. Sales and Commission Service

- [x] 11.1 Create SaleService for commission tracking
  - Implement createSale(leadId, saleValue, userId) with commission calculation
  - Get commission rate and type from dealership at time of sale
  - Calculate commission amount based on type (percentage or fixed)
  - _Requirements: 10.3, 10.4, 11.2, 11.3_

- [ ]* 11.2 Write property test for commission calculation percentage
  - **Property 20: Commission Calculation Percentage**
  - **Validates: Requirements 10.4, 11.2**

- [ ]* 11.3 Write property test for commission calculation fixed
  - **Property 21: Commission Calculation Fixed**
  - **Validates: Requirements 10.4, 11.3**

- [ ]* 11.4 Write property test for commission rate immutability
  - **Property 23: Commission Rate Immutability**
  - **Validates: Requirements 11.5**

- [x] 11.5 Implement partner metrics in MetricsService
  - Implement getPartnerMetrics(filters, userId)
  - Calculate totalConverted, totalSalesValue, totalCommissionEarned
  - Calculate commissionPending and commissionPaid
  - Group by dealership
  - _Requirements: 10.5, 10.6, 10.7_

- [ ]* 11.6 Write property test for partner metrics totals consistency
  - **Property 22: Partner Metrics Totals Consistency**
  - **Validates: Requirements 10.5**

- [x] 11.7 Create sales routes
  - POST /api/leads/:id/sale - record sale and calculate commission
  - GET /api/sales - list sales for partner view
  - GET /api/metrics/partner - get partner-specific metrics
  - _Requirements: 10.3, 10.5_

- [ ]* 11.8 Write property test for partner view shows all dealerships
  - **Property 18: Partner View Shows All Dealerships**
  - **Validates: Requirements 10.1**

- [ ]* 11.9 Write property test for partner default filter converted
  - **Property 19: Partner Default Filter Converted**
  - **Validates: Requirements 10.2**

## 12. Checkpoint - Ensure all tests pass
  - [x] Ensure all tests pass, ask the user if questions arise.

## 13. Dashboard Frontend

- [x] 13.1 Create dashboard HTML structure
  - Create src/public/lead-dashboard.html
  - Add header with logo, dealership selector (admin), user menu
  - Add sidebar with navigation
  - Add main content area for metrics cards and lead table
  - _Requirements: 2.1, 5.1, 9.1_

- [x] 13.2 Implement login page
  - Create login form with email/password
  - Handle authentication and store JWT in localStorage
  - Redirect to dashboard on success
  - _Requirements: 7.1, 7.2_

- [x] 13.3 Implement metrics cards component
  - Display total leads, conversion rate, avg response time
  - Display status breakdown (pending, sent, contacted, converted, lost)
  - Update on filter changes
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 13.4 Implement lead table component
  - Display columns: Concessionária, Cliente, Telefone, Veículo, Status, Data
  - Add clickable phone number (opens WhatsApp)
  - Add status dropdown for quick updates
  - Implement pagination controls
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1_

- [x] 13.5 Implement filter controls
  - Add status filter dropdown
  - Add date range picker
  - Add search input
  - Add dealership filter (admin only)
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 13.6 Implement lead detail panel
  - Show full lead information on row click
  - Display vehicle details with photo and link
  - Display status timeline
  - Add WhatsApp contact button
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 13.7 Implement export button
  - Add export button to toolbar
  - Trigger CSV download with current filters
  - _Requirements: 8.1, 8.4_

- [x] 13.8 Add responsive styles for mobile
  - Adapt layout for smaller screens
  - Prioritize essential information on mobile
  - Add loading indicators and toast notifications
  - _Requirements: 9.1, 9.2, 9.4, 9.5_

- [x] 13.9 Implement partner dashboard view
  - Create partner-specific metrics cards (conversions, sales value, commissions)
  - Display commission breakdown by dealership
  - Show pending vs paid commissions
  - Default filter to "converted" status
  - _Requirements: 10.1, 10.2, 10.5, 10.7_

## 14. Seed Data and Migration

- [x] 14.1 Create seed script for initial dealership, admin, and partner users
  - Create Renatinhu's Cars dealership with real data and commission config
  - Create admin user for testing
  - Create partner user for testing
  - Update existing vehicles and leads with dealershipId
  - _Requirements: 1.1, 1.5, 10.1_

## 15. Final Checkpoint - Ensure all tests pass
  - [x] Ensure all tests pass, ask the user if questions arise.

import express from 'express';
import path from 'path';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { inMemoryVectorStore } from './services/in-memory-vector.service';
import { getLLMProvidersStatus } from './lib/llm-router';
import webhookRoutes from './routes/webhook.routes';
import adminRoutes from './routes/admin.routes';
import debugRoutes from './routes/debug.routes';
import authRoutes from './routes/auth.routes';
import leadsRoutes from './routes/leads.routes';
import metricsRoutes from './routes/metrics.routes';
import dealershipsRoutes from './routes/dealerships.routes';
import salesRoutes from './routes/sales.routes';

const app = express();

/**
 * Log startup configuration and connection status
 * Requirements 10.1: Log configuration and connection status on startup
 */
function logStartupConfiguration(): void {
  logger.info('='.repeat(60));
  logger.info('🚀 FaciliAuto - Renatinhu\'s Cars MVP Starting...');
  logger.info('='.repeat(60));

  // Environment
  logger.info({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
  }, '📋 Environment Configuration');

  // Database
  logger.info({
    databaseUrl: env.DATABASE_URL ? `${env.DATABASE_URL.substring(0, 30)}...` : 'NOT SET',
  }, '🗄️  Database Configuration');

  // Redis
  logger.info({
    redisUrl: env.REDIS_URL ? `${env.REDIS_URL.substring(0, 30)}...` : 'NOT SET (using in-memory)',
  }, '📦 Redis Configuration');

  // LLM Providers
  const llmStatus = getLLMProvidersStatus();
  logger.info({
    providers: llmStatus.map(p => ({
      name: p.name,
      model: p.model,
      enabled: p.enabled,
      priority: p.priority,
    })),
  }, '🤖 LLM Providers Configuration');

  // WhatsApp Meta API
  logger.info({
    configured: !!(env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID),
    phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID ? `${env.META_WHATSAPP_PHONE_NUMBER_ID.substring(0, 10)}...` : 'NOT SET',
    webhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN ? 'SET' : 'NOT SET',
    appSecret: env.META_APP_SECRET ? 'SET' : 'NOT SET',
  }, '📱 WhatsApp Meta API Configuration');

  // Feature Flags
  logger.info({
    conversationalMode: env.ENABLE_CONVERSATIONAL_MODE,
    rolloutPercentage: env.CONVERSATIONAL_ROLLOUT_PERCENTAGE,
  }, '🚦 Feature Flags');

  // Lead Forwarding Configuration
  // Requirements 11.3: Validate SELLER_WHATSAPP_NUMBER configuration on startup
  const sellerPhone = env.SELLER_WHATSAPP_NUMBER;
  const isSellerPhoneValid = sellerPhone && /^55\d{10,11}$/.test(sellerPhone);

  logger.info({
    configured: !!sellerPhone,
    valid: isSellerPhoneValid,
    format: sellerPhone ? (isSellerPhoneValid ? 'OK (55XXXXXXXXXXX)' : 'INVALID') : 'NOT SET',
    phone: sellerPhone ? `${sellerPhone.substring(0, 6)}...` : 'NOT SET',
  }, '📞 Lead Forwarding Configuration');

  if (sellerPhone && !isSellerPhoneValid) {
    logger.warn('⚠️  SELLER_WHATSAPP_NUMBER format invalid. Expected: 55XXXXXXXXXXX (country code + DDD + number)');
  }

  if (!sellerPhone) {
    logger.warn('⚠️  SELLER_WHATSAPP_NUMBER not configured. Lead forwarding will not work.');
    logger.warn('Set SELLER_WHATSAPP_NUMBER in .env with format: 55XXXXXXXXXXX');
  }

  logger.info('='.repeat(60));
}

// Capture raw body for webhook signature validation
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Webhook routes for Meta Cloud API
app.use('/webhooks', webhookRoutes);

// Admin routes (seed, management)
app.use('/admin', adminRoutes);

// Debug routes (feature flags, config)
app.use('/debug', debugRoutes);

// Dashboard API routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/dealerships', dealershipsRoutes);
app.use('/api/sales', salesRoutes);

// Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Lead Dashboard
app.get('/leads', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lead-dashboard.html'));
});

// Health check - Basic (for load balancers)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Comprehensive health check endpoint
 * Requirements 10.5: Return status of all dependencies (DB, LLM, WhatsApp)
 */
app.get('/health/detailed', async (req, res) => {
  const startTime = Date.now();
  const health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    checks: {
      database: { status: string; latencyMs?: number; error?: string };
      llm: { status: string; providers: any[]; error?: string };
      whatsapp: { status: string; configured: boolean; leadForwarding?: string; error?: string };
      vectorStore: { status: string; count?: number; error?: string };
      redis: { status: string; latencyMs?: number; error?: string };
    };
    version: string;
  } = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: { status: 'unknown' },
      llm: { status: 'unknown', providers: [] },
      whatsapp: { status: 'unknown', configured: false },
      vectorStore: { status: 'unknown' },
      redis: { status: 'unknown' },
    },
    version: process.env.npm_package_version || '1.0.0',
  };

  let hasFailure = false;
  let hasDegraded = false;

  // Check Database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart,
    };
  } catch (error: any) {
    hasFailure = true;
    health.checks.database = {
      status: 'unhealthy',
      error: error.message,
    };
    logger.error({ error }, 'Health check: Database failed');
  }

  // Check LLM Providers
  try {
    const llmStatus = getLLMProvidersStatus();
    const enabledProviders = llmStatus.filter(p => p.enabled);
    const healthyProviders = enabledProviders.filter(p => !p.circuitBreakerOpen);

    health.checks.llm = {
      status: healthyProviders.length > 0 ? 'healthy' : (enabledProviders.length > 0 ? 'degraded' : 'unhealthy'),
      providers: llmStatus.map(p => ({
        name: p.name,
        model: p.model,
        enabled: p.enabled,
        circuitBreakerOpen: p.circuitBreakerOpen,
      })),
    };

    if (healthyProviders.length === 0 && enabledProviders.length > 0) {
      hasDegraded = true;
    } else if (enabledProviders.length === 0) {
      hasDegraded = true; // Mock mode
    }
  } catch (error: any) {
    hasDegraded = true;
    health.checks.llm = {
      status: 'degraded',
      providers: [],
      error: error.message,
    };
  }

  // Check WhatsApp Meta API
  try {
    const isConfigured = !!(env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID);
    const sellerPhone = env.SELLER_WHATSAPP_NUMBER;
    const isLeadForwardingConfigured = sellerPhone && /^55\d{10,11}$/.test(sellerPhone);

    health.checks.whatsapp = {
      status: isConfigured ? 'healthy' : 'degraded',
      configured: isConfigured,
      leadForwarding: isLeadForwardingConfigured ? 'configured' : 'not configured',
    };
    if (!isConfigured) {
      hasDegraded = true;
    }
  } catch (error: any) {
    hasDegraded = true;
    health.checks.whatsapp = {
      status: 'degraded',
      configured: false,
      error: error.message,
    };
  }

  // Check Vector Store
  try {
    const count = inMemoryVectorStore.getCount();
    health.checks.vectorStore = {
      status: count > 0 ? 'healthy' : 'degraded',
      count,
    };
    if (count === 0) {
      hasDegraded = true;
    }
  } catch (error: any) {
    hasDegraded = true;
    health.checks.vectorStore = {
      status: 'degraded',
      error: error.message,
    };
  }

  // Check Redis (optional)
  try {
    const { cache } = await import('./lib/redis');
    const redisStart = Date.now();
    await cache.set('health_check', 'ok', 10);
    const result = await cache.get('health_check');
    health.checks.redis = {
      status: result === 'ok' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - redisStart,
    };
  } catch (error: any) {
    // Redis is optional, so just mark as degraded
    health.checks.redis = {
      status: 'degraded',
      error: 'Redis not available (using in-memory fallback)',
    };
  }

  // Determine overall status
  if (hasFailure) {
    health.status = 'unhealthy';
  } else if (hasDegraded) {
    health.status = 'degraded';
  }

  // Log health check
  logger.info({
    status: health.status,
    latencyMs: Date.now() - startTime,
    checks: Object.fromEntries(
      Object.entries(health.checks).map(([k, v]) => [k, v.status])
    ),
  }, '🏥 Health check completed');

  // Return appropriate status code
  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(health);
});

// Privacy Policy (required by Meta)
app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'privacy-policy.html'));
});

// Reset conversation endpoint (for testing)
app.post('/api/reset-conversation', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber required' });
    }

    const result = await prisma.conversation.deleteMany({
      where: { phoneNumber }
    });

    logger.info('🗑️ Conversation reset', { phoneNumber, count: result.count });

    res.json({
      success: true,
      message: `${result.count} conversation(s) deleted`,
      phoneNumber
    });
  } catch (error: any) {
    logger.error({ error }, 'Error resetting conversation');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Basic stats endpoint
app.get('/stats', async (req, res) => {
  try {
    const { prisma } = await import('./lib/prisma');

    const [conversations, leads, recommendations] = await Promise.all([
      prisma.conversation.count(),
      prisma.lead.count(),
      prisma.recommendation.count(),
    ]);

    res.json({
      conversations,
      leads,
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching stats');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = env.PORT || 3000;

async function start() {
  try {
    // Requirements 10.1: Log configuration and connection status on startup
    logStartupConfiguration();

    // Push database schema
    logger.info('📦 Setting up database schema...');
    try {
      const { execSync } = require('child_process');
      execSync('npx prisma db push --accept-data-loss', {
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '0' }
      });
      logger.info('✅ Database schema ready');
    } catch (error) {
      logger.error({ error }, '⚠️  Database push failed, continuing...');
    }

    // Check database and seed if needed
    logger.info('🔍 Checking database...');
    const vehicleCount = await prisma.vehicle.count();

    if (vehicleCount === 0) {
      logger.info('🌱 Database empty, running seed...');
      const { execSync } = require('child_process');
      execSync('npm run db:seed:complete', { stdio: 'inherit' });
      logger.info('✅ Seed completed');
    } else {
      logger.info(`✅ Database has ${vehicleCount} vehicles`);
    }

    // Initialize vector store in background (non-blocking)
    logger.info('🧠 Starting vector store initialization in background...');
    inMemoryVectorStore.initialize().then(() => {
      logger.info(`✅ Vector store ready with ${inMemoryVectorStore.getCount()} embeddings`);
    }).catch((error) => {
      logger.error({ error }, '⚠️  Vector store failed, will use SQL fallback');
    });

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Dashboard: http://localhost:${PORT}`);
      logger.info(`📊 Stats: http://localhost:${PORT}/stats`);
      logger.info(`📊 Health: http://localhost:${PORT}/health`);
      logger.info(`📊 Health (detailed): http://localhost:${PORT}/health/detailed`);
      logger.info(`📱 Webhook: http://localhost:${PORT}/webhooks/whatsapp`);
      logger.info(`🔧 Admin: http://localhost:${PORT}/admin/health`);

      // Check if Meta Cloud API is configured
      if (env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID) {
        logger.info('✅ Meta Cloud API configured');
        logger.info(`📱 Phone Number ID: ${env.META_WHATSAPP_PHONE_NUMBER_ID.substring(0, 10)}...`);
      } else {
        logger.warn('⚠️  Meta Cloud API not configured');
        logger.warn('Set META_WHATSAPP_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID in .env');
        logger.warn('See META_CLOUD_API_SETUP.md for instructions');
      }
    });
  } catch (error) {
    logger.error({ error }, '❌ Failed to start application');
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

start();

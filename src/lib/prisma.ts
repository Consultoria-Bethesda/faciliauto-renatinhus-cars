import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Test connection
prisma.$connect()
  .then(() => logger.info('✅ Database connected'))
  .catch((err) => logger.error('❌ Database connection failed:', err));

/**
 * Custom error class for database errors
 * Requirements 7.4, 7.5: Handle database connection failures with proper logging
 */
export class DatabaseError extends Error {
  public readonly originalError: Error;
  public readonly context: Record<string, any>;

  constructor(message: string, originalError: Error, context: Record<string, any> = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
    this.context = context;
  }
}

/**
 * Get friendly error message for database failures
 * Requirements 7.4: Return service unavailable message
 */
export function getDatabaseErrorMessage(): string {
  return `😔 Desculpe, nosso sistema está temporariamente indisponível.

Por favor, tente novamente em alguns instantes ou digite *vendedor* para falar com nossa equipe.

Pedimos desculpas pelo inconveniente! 🙏`;
}

/**
 * Check if an error is a Prisma/database error
 */
export function isDatabaseError(error: unknown): boolean {
  if (error instanceof DatabaseError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return true;
  if (error instanceof Prisma.PrismaClientUnknownRequestError) return true;
  if (error instanceof Prisma.PrismaClientRustPanicError) return true;
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientValidationError) return true;

  // Check for connection errors by message
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('connection') ||
      message.includes('database') ||
      message.includes('prisma') ||
      message.includes('timeout') ||
      message.includes('econnrefused')) {
      return true;
    }
  }

  return false;
}

/**
 * Log database error with full context
 * Requirements 7.5: Log error with full context for debugging
 */
export function logDatabaseError(
  error: unknown,
  operation: string,
  context: Record<string, any> = {}
): void {
  const errorDetails = {
    operation,
    context,
    errorName: error instanceof Error ? error.name : 'Unknown',
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  };

  // Add Prisma-specific details if available
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    Object.assign(errorDetails, {
      prismaCode: error.code,
      prismaMeta: error.meta,
    });
  }

  logger.error(errorDetails, `Database error during ${operation}`);
}

/**
 * Wrapper for database operations with error handling
 * Requirements 7.4, 7.5: Handle database errors gracefully with logging
 */
export async function withDatabaseErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context: Record<string, any> = {}
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logDatabaseError(error, operation, context);
    throw new DatabaseError(
      `Database operation failed: ${operation}`,
      error instanceof Error ? error : new Error(String(error)),
      context
    );
  }
}

export default prisma;

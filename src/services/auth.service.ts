/**
 * Authentication Service for Lead Dashboard
 * 
 * Implements JWT-based authentication with password hashing.
 * Token expiration: 8 hours
 * 
 * _Requirements: 7.1, 7.2, 7.5_
 */

import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// JWT secret from environment or generate a random one
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRATION_HOURS = 8;

export interface JWTPayload {
    userId: string;
    email: string;
    role: string;
    dealershipId: string | null;
    iat: number;
    exp: number;
}

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: string;
    dealershipId: string | null;
    isActive: boolean;
}

export interface LoginResult {
    token: string;
    user: AuthUser;
}

/**
 * Hash a password using PBKDF2
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Compare a password with a hash
 */
export function comparePassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}


/**
 * Create a JWT token
 */
function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JWTPayload = {
        ...payload,
        iat: now,
        exp: now + (TOKEN_EXPIRATION_HOURS * 60 * 60),
    };

    // Create header
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

    // Create signature
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Validate and decode a JWT token
 */
export function validateToken(token: string): JWTPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [headerB64, payloadB64, signature] = parts;

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return null;
        }

        // Decode payload
        const payload: JWTPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            logger.debug({ exp: payload.exp, now }, 'Token expired');
            return null;
        }

        return payload;
    } catch (error) {
        logger.debug({ error }, 'Token validation failed');
        return null;
    }
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<LoginResult | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user || !user.isActive) {
            logger.debug({ email }, 'User not found or inactive');
            return null;
        }

        if (!comparePassword(password, user.passwordHash)) {
            logger.debug({ email }, 'Invalid password');
            return null;
        }

        // Update last login
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        const token = createToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            dealershipId: user.dealershipId,
        });

        logger.info({ userId: user.id, role: user.role }, 'User logged in');

        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                dealershipId: user.dealershipId,
                isActive: user.isActive,
            },
        };
    } catch (error) {
        logger.error({ error, email }, 'Login error');
        return null;
    }
}

/**
 * Get user from token
 */
export async function getUserFromToken(token: string): Promise<AuthUser | null> {
    const payload = validateToken(token);
    if (!payload) return null;

    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user || !user.isActive) return null;

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            dealershipId: user.dealershipId,
            isActive: user.isActive,
        };
    } catch (error) {
        logger.error({ error }, 'Error getting user from token');
        return null;
    }
}

export const authService = {
    login,
    validateToken,
    getUserFromToken,
    hashPassword,
    comparePassword,
};

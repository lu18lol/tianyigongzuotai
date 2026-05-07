import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import logger from './logger';

let privateKey: string | null = null;
let publicKey: string | null = null;

function getPrivateKey(): string {
  if (!privateKey) {
    const keyPath = process.env.JWT_PRIVATE_KEY_PATH || path.resolve(__dirname, '../../keys/private.pem');
    try {
      privateKey = fs.readFileSync(keyPath, 'utf8');
    } catch {
      logger.warn('JWT private key not found, using fallback secret');
      privateKey = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    }
  }
  return privateKey;
}

function getPublicKey(): string {
  if (!publicKey) {
    const keyPath = process.env.JWT_PUBLIC_KEY_PATH || path.resolve(__dirname, '../../keys/public.pem');
    try {
      publicKey = fs.readFileSync(keyPath, 'utf8');
    } catch {
      logger.warn('JWT public key not found, using fallback secret');
      publicKey = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    }
  }
  return publicKey;
}

export interface JwtPayload {
  userId: number;
  role: string;
  name: string;
  larkOpenId?: string;
}

export function signToken(payload: JwtPayload): string {
  const key = getPrivateKey();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const isRs256 = key.includes('-----BEGIN');
  return jwt.sign(payload, key, {
    algorithm: isRs256 ? 'RS256' : 'HS256',
    expiresIn,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: number): string {
  const key = getPrivateKey();
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  const isRs256 = key.includes('-----BEGIN');
  return jwt.sign({ userId, type: 'refresh' }, key, {
    algorithm: isRs256 ? 'RS256' : 'HS256',
    expiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const key = getPublicKey();
  const isRs256 = key.includes('-----BEGIN');
  return jwt.verify(token, key, {
    algorithms: [isRs256 ? 'RS256' : 'HS256'],
  }) as JwtPayload;
}

export function verifyRefreshToken(token: string): { userId: number } {
  const key = getPublicKey();
  const isRs256 = key.includes('-----BEGIN');
  const payload = jwt.verify(token, key, {
    algorithms: [isRs256 ? 'RS256' : 'HS256'],
  }) as any;
  if (payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return { userId: payload.userId };
}

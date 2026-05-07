import express from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import logger from './lib/logger';
import { corsMiddleware } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import bossRoutes from './routes/boss';
import salesRoutes from './routes/sales';
import commonRoutes from './routes/common';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Global middleware ──────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());

// ─── Health check ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', version: '2.0.0' } });
});

// ─── Routes ─────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/common', commonRoutes);
app.use('/api/boss', bossRoutes);
app.use('/api/sales', salesRoutes);

// ─── Error handling ─────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start server ───────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'Server started');
});

export default app;

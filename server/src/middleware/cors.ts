import cors from 'cors';

const raw = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174').replace(/"/g, '');
const allowedOrigins = raw.split(',').map(s => s.trim());

console.log('[CORS] allowed origins:', allowedOrigins);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow requests without origin (curl, server-to-server)
    if (!origin) { callback(null, true); return; }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('[CORS] rejected origin:', origin, 'allowed:', allowedOrigins);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

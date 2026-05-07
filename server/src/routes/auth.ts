import { Router, Request, Response } from 'express';
import { authService } from '../services/auth';
import logger from '../lib/logger';

const router = Router();

// GET /api/auth/login - Redirect to Feishu OAuth
router.get('/login', (_req: Request, res: Response) => {
  const authUrl = authService.getAuthUrl();
  res.redirect(authUrl);
});

// GET /api/auth/callback - OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing authorization code' },
      });
      return;
    }

    const { userInfo } = await authService.exchangeCode(code);
    const user = await authService.findOrCreateUser(userInfo);
    const tokens = authService.generateTokens(user);

    logger.info({ userId: user.id, name: user.name }, 'User logged in via Feishu OAuth');

    // Return tokens as JSON (frontend stores them)
    // In production, consider redirecting to frontend with token in query
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'OAuth callback failed');
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_FAILED', message: error?.message || 'Authentication failed' },
    });
  }
});

// POST /api/auth/refresh - Refresh JWT token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing refresh token' },
      });
      return;
    }

    const tokens = await authService.refreshAccessToken(refreshToken);
    res.json({ success: true, data: tokens });
  } catch (error: any) {
    logger.error({ error }, 'Token refresh failed');
    res.status(401).json({
      success: false,
      error: { code: 'REFRESH_FAILED', message: error?.message || 'Token refresh failed' },
    });
  }
});

// POST /api/auth/dev-login - Dev mode password login
router.post('/dev-login', async (req: Request, res: Response) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '请输入用户名和密码' },
      });
      return;
    }

    const result = await authService.devLogin(name, password);
    logger.info({ userId: result.user.id, name: result.user.name }, 'User logged in via dev-login');

    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ error }, 'Dev login failed');
    res.status(401).json({
      success: false,
      error: { code: 'LOGIN_FAILED', message: error?.message || '登录失败' },
    });
  }
});

// POST /api/auth/logout (client-side: discard tokens)
router.post('/logout', (_req: Request, res: Response) => {
  // Stateless JWT - client discards the token
  // In future: add token blacklist if needed
  res.json({ success: true, data: null });
});

export default router;

import axios from 'axios';
import logger from '../lib/logger';
import { prisma } from '../lib/prisma';
import { signToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';

interface FeishuTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface FeishuUserInfo {
  open_id: string;
  name: string;
  mobile?: string;
  email?: string;
  avatar_url?: string;
}

export class AuthService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;

  constructor() {
    this.appId = process.env.FEISHU_APP_ID || '';
    this.appSecret = process.env.FEISHU_APP_SECRET || '';
    this.redirectUri = process.env.FEISHU_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
  }

  /**
   * Get Feishu OAuth authorization URL.
   */
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: this.redirectUri,
      state: state || 'login',
    });
    return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for user access token and user info.
   */
  async exchangeCode(code: string): Promise<{ userInfo: FeishuUserInfo; accessToken: string }> {
    // Step 1: Get app access token
    const appTokenRes = await axios.post<FeishuTokenResponse>(
      'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
      { app_id: this.appId, app_secret: this.appSecret },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const appToken = appTokenRes.data.access_token;

    // Step 2: Exchange code for user access token
    const userTokenRes = await axios.post<{ data: FeishuTokenResponse }>(
      'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
      {
        grant_type: 'authorization_code',
        code,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appToken}`,
        },
      }
    );

    const tokenData = userTokenRes.data.data;
    const userAccessToken = tokenData.access_token;

    // Step 3: Get user info
    const userInfoRes = await axios.get<{ data: FeishuUserInfo }>(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      {
        headers: { Authorization: `Bearer ${userAccessToken}` },
      }
    );

    return {
      userInfo: userInfoRes.data.data,
      accessToken: userAccessToken,
    };
  }

  /**
   * Find or create user by Feishu open_id.
   * Returns the user record from our database.
   */
  async findOrCreateUser(userInfo: FeishuUserInfo): Promise<{
    id: number;
    name: string;
    role: string;
    lark_open_id: string;
  }> {
    const existing = await prisma.user.findUnique({
      where: { lark_open_id: userInfo.open_id },
    });

    if (existing) {
      // Update name if changed
      if (existing.name !== userInfo.name) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { name: userInfo.name },
        });
      }
      return {
        id: existing.id,
        name: existing.name,
        role: existing.role,
        lark_open_id: existing.lark_open_id!,
      };
    }

    // New user: create as 'sales' by default; boss role assigned manually
    const created = await prisma.user.create({
      data: {
        name: userInfo.name,
        phone: userInfo.mobile,
        lark_open_id: userInfo.open_id,
        role: 'sales',
        status: 'active',
      },
    });

    logger.info({ userId: created.id, name: created.name }, 'New user created via Feishu OAuth');
    return {
      id: created.id,
      name: created.name,
      role: created.role,
      lark_open_id: created.lark_open_id!,
    };
  }

  /**
   * Generate JWT tokens for a user.
   */
  generateTokens(user: { id: number; name: string; role: string; lark_open_id: string }) {
    const accessToken = signToken({
      userId: user.id,
      role: user.role,
      name: user.name,
      larkOpenId: user.lark_open_id,
    });

    const refreshToken = signRefreshToken(user.id);

    return { accessToken, refreshToken };
  }

  /**
   * Dev login: validate password and return user with tokens.
   */
  async devLogin(name: string, password: string) {
    const enabled = process.env.DEV_LOGIN_ENABLED === 'true';
    if (!enabled) {
      throw new Error('Dev login is not enabled');
    }

    const devPassword = process.env.DEV_LOGIN_PASSWORD || '123456';
    if (password !== devPassword) {
      throw new Error('密码错误');
    }

    const user = await prisma.user.findFirst({
      where: { name },
    });

    if (!user) {
      throw new Error(`用户 "${name}" 不存在`);
    }

    if (user.status !== 'active') {
      throw new Error('该账号已被禁用');
    }

    const tokens = this.generateTokens({
      id: user.id,
      name: user.name,
      role: user.role,
      lark_open_id: user.lark_open_id || '',
    });

    return {
      user: { id: user.id, name: user.name, role: user.role },
      ...tokens,
    };
  }

  /**
   * Refresh access token using a valid refresh token.
   */
  async refreshAccessToken(token: string) {
    const { userId } = verifyRefreshToken(token);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') {
      throw new Error('User not found or inactive');
    }

    return this.generateTokens({
      id: user.id,
      name: user.name,
      role: user.role,
      lark_open_id: user.lark_open_id || '',
    });
  }
}

export const authService = new AuthService();

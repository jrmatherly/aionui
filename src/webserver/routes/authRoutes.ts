/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { verifyQRTokenDirect } from '@/process/bridge/webuiBridge';
import { AuthMiddleware } from '@/webserver/auth/middleware/AuthMiddleware';
import { TokenUtils } from '@/webserver/auth/middleware/TokenMiddleware';
import { OIDC_CONFIG } from '@/webserver/auth/config/oidcConfig';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { OidcService } from '@/webserver/auth/service/OidcService';
import type { Express, Request, Response } from 'express';
import { AUTH_CONFIG, getCookieOptions } from '../config/constants';
import { createAppError } from '../middleware/errorHandler';
import { apiRateLimiter, authRateLimiter, authenticatedActionLimiter } from '../middleware/security';
import { originGuard } from '@/webserver/auth/middleware/OriginGuard';

/**
 * QR login page HTML (static, no user input embedded)
 * JavaScript reads token directly from URL params to prevent XSS
 */
const QR_LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QR Login - AionUI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; }
    .loading { color: #3498db; font-size: 18px; }
    .success { color: #27ae60; }
    .error { color: #e74c3c; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { margin-bottom: 16px; }
    p { color: #666; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container" id="content">
    <div class="spinner"></div>
    <p class="loading">Verifying... / 验证中...</p>
  </div>
  <script>
    (async function() {
      var container = document.getElementById('content');
      var params = new URLSearchParams(window.location.search);
      var qrToken = params.get('token');
      if (!qrToken) {
        container.innerHTML = '<h2 class="error">Invalid QR Code</h2><p>The QR code is invalid or missing.</p><p>二维码无效或缺失。</p>';
        return;
      }
      try {
        var response = await fetch('/api/auth/qr-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrToken: qrToken }),
          credentials: 'include'
        });
        var data = await response.json();
        if (data.success) {
          container.innerHTML = '<h2 class="success">Login Successful!</h2><p>Redirecting... / 登录成功，正在跳转...</p>';
          setTimeout(function() { window.location.href = '/'; }, 1000);
        } else {
          // XSS Security fix: Use textContent instead of innerHTML for error message
          var h2 = document.createElement('h2');
          h2.className = 'error';
          h2.textContent = 'Login Failed';
          var p1 = document.createElement('p');
          p1.textContent = data.error || 'QR code expired or invalid';
          var p2 = document.createElement('p');
          p2.textContent = '二维码已过期或无效，请重新扫描。';
          container.innerHTML = '';
          container.appendChild(h2);
          container.appendChild(p1);
          container.appendChild(p2);
        }
      } catch (e) {
        container.innerHTML = '<h2 class="error">Error</h2><p>Network error. Please try again.</p><p>网络错误，请重试。</p>';
      }
    })();
  </script>
</body>
</html>`;

/**
 * Register authentication routes
 */
export function registerAuthRoutes(app: Express): void {
  /**
   * Login endpoint
   * POST /login
   */
  // Login attempts are strictly rate limited to defend against brute force
  app.post('/login', authRateLimiter, AuthMiddleware.validateLoginInput, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // Get user from database
      const user = UserRepository.findByUsername(username);
      if (!user) {
        // Use constant time verification to prevent timing attacks
        await AuthService.constantTimeVerify('dummy', 'dummy', true);
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
        return;
      }

      // Verify password with constant time
      const isValidPassword = await AuthService.constantTimeVerify(password, user.password_hash, true);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        });
        return;
      }

      // Generate access token (short-lived) + refresh token (long-lived)
      const accessToken = AuthService.generateToken(user);
      const refreshToken = AuthService.generateRefreshToken(user.id);

      // Update last login
      UserRepository.updateLastLogin(user.id);

      // Set access token cookie (short-lived, used for API auth)
      res.cookie(AUTH_CONFIG.COOKIE.NAME, accessToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      // Set refresh token in httpOnly cookie (long-lived, used for silent renewal)
      res.cookie('aionui-refresh', refreshToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
        path: '/api/auth/refresh', // Only sent to refresh endpoint
      });

      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
        },
        token: accessToken,
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * Logout endpoint
   * POST /logout
   */
  // Authenticated endpoints reuse shared limiter keyed by user/IP
  app.post('/logout', apiRateLimiter, AuthMiddleware.authenticateToken, authenticatedActionLimiter, (req: Request, res: Response) => {
    // Blacklist current access token
    const token = TokenUtils.extractFromRequest(req);
    if (token) {
      AuthService.blacklistToken(token);
    }

    // Blacklist refresh token if present
    const refreshToken = req.cookies?.['aionui-refresh'];
    if (refreshToken) {
      AuthService.blacklistToken(refreshToken);
    }

    // Revoke all refresh tokens for this user (belt + suspenders)
    if (req.user?.id) {
      AuthService.revokeAllUserTokens(req.user.id);
    }

    res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
    res.clearCookie('aionui-refresh', { path: '/api/auth/refresh' });
    res.json({ success: true, message: 'Logged out successfully' });
  });

  /**
   * Get authentication status
   * GET /api/auth/status
   */
  // Rate limit auth status endpoint to prevent enumeration
  app.get('/api/auth/status', apiRateLimiter, (_req: Request, res: Response) => {
    try {
      const hasUsers = UserRepository.hasUsers();
      const userCount = UserRepository.countUsers();

      res.json({
        success: true,
        needsSetup: !hasUsers,
        userCount,
        isAuthenticated: false, // Will be determined by frontend based on token
        oidcEnabled: OIDC_CONFIG.enabled && OidcService.isReady(),
      });
    } catch (error) {
      console.error('Auth status error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Get current user (protected route)
   * GET /api/auth/user
   */
  // Add rate limiting for authenticated user info endpoint
  app.get('/api/auth/user', apiRateLimiter, AuthMiddleware.authenticateToken, authenticatedActionLimiter, (req: Request, res: Response) => {
    res.json({
      success: true,
      user: {
        id: req.user!.id,
        username: req.user!.username,
        role: req.user!.role,
        authMethod: req.user!.auth_method,
      },
    });
  });

  /**
   * Change password endpoint (protected route)
   * POST /api/auth/change-password
   */
  app.post('/api/auth/change-password', apiRateLimiter, AuthMiddleware.authenticateToken, authenticatedActionLimiter, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          error: 'Current password and new password are required',
        });
        return;
      }

      // Validate new password strength
      const passwordValidation = AuthService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        res.status(400).json({
          success: false,
          error: 'New password does not meet security requirements',
          details: passwordValidation.errors,
        });
        return;
      }

      // Get current user
      const user = UserRepository.findById(req.user!.id);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Verify current password
      const isValidPassword = await AuthService.verifyPassword(currentPassword, user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: 'Current password is incorrect',
        });
        return;
      }

      // Hash new password
      const newPasswordHash = await AuthService.hashPassword(newPassword);

      // Update password and invalidate all tokens
      UserRepository.updatePassword(user.id, newPasswordHash);
      AuthService.invalidateAllTokens();
      AuthService.revokeAllUserTokens(user.id);

      // Clear cookies — user must re-authenticate
      res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      res.clearCookie('aionui-refresh', { path: '/api/auth/refresh' });

      res.json({
        success: true,
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Token refresh endpoint
   * POST /api/auth/refresh
   */
  app.post('/api/auth/refresh', apiRateLimiter, originGuard, (req: Request, res: Response) => {
    try {
      // Prefer refresh token from httpOnly cookie, fall back to body
      const refreshToken = req.cookies?.['aionui-refresh'] || req.body?.refreshToken;

      if (!refreshToken) {
        // Legacy fallback: try old-style access token refresh (body.token)
        const { token } = req.body;
        if (token) {
          const newToken = AuthService.refreshToken(token);
          if (!newToken) {
            res.status(401).json({ success: false, error: 'Invalid or expired token' });
            return;
          }
          res.json({ success: true, token: newToken });
          return;
        }

        res.status(400).json({ success: false, error: 'Refresh token is required' });
        return;
      }

      // Rotate refresh token: revoke old, issue new pair
      const result = AuthService.rotateRefreshToken(refreshToken);
      if (!result) {
        res.clearCookie('aionui-refresh', { path: '/api/auth/refresh' });
        res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
        return;
      }

      // Set new access token cookie
      res.cookie(AUTH_CONFIG.COOKIE.NAME, result.accessToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      // Set new refresh token cookie (rotated)
      res.cookie('aionui-refresh', result.refreshToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
        path: '/api/auth/refresh',
      });

      res.json({
        success: true,
        token: result.accessToken,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * Generate WebSocket token
   * GET /api/ws-token
   *
   * Note: WebSocket now reuses the main token, this endpoint returns the main token for backward compatibility
   */
  // Rate limit WebSocket token endpoint
  app.get('/api/ws-token', apiRateLimiter, authenticatedActionLimiter, (req: Request, res: Response, next) => {
    try {
      const sessionToken = TokenUtils.extractFromRequest(req);

      if (!sessionToken) {
        return next(createAppError('Unauthorized: Invalid or missing session', 401, 'unauthorized'));
      }

      const decoded = AuthService.verifyToken(sessionToken);
      if (!decoded) {
        return next(createAppError('Unauthorized: Invalid session token', 401, 'unauthorized'));
      }

      const user = UserRepository.findById(decoded.userId);
      if (!user) {
        return next(createAppError('Unauthorized: User not found', 401, 'unauthorized'));
      }

      // Return the main token directly, no longer generate a separate WebSocket token
      res.json({
        success: true,
        wsToken: sessionToken, // Reuse the main token
        expiresIn: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE, // Use the main token's expiry time
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * QR code login verification
   * POST /api/auth/qr-login
   */
  app.post('/api/auth/qr-login', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { qrToken } = req.body;

      if (!qrToken) {
        res.status(400).json({
          success: false,
          error: 'QR token is required',
        });
        return;
      }

      // Get client IP (for local network restriction verification)
      const clientIP = req.ip || req.socket.remoteAddress || '';

      // Verify QR token directly (no IPC)
      const result = await verifyQRTokenDirect(qrToken, clientIP);

      if (!result.success || !result.data) {
        res.status(401).json({
          success: false,
          error: result.msg || 'Invalid or expired QR token',
        });
        return;
      }

      // Set session cookie (enable secure flag in remote mode)
      res.cookie(AUTH_CONFIG.COOKIE.NAME, result.data.sessionToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.json({
        success: true,
        user: { username: result.data.username },
        token: result.data.sessionToken,
      });
    } catch (error) {
      console.error('QR login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * QR code login page
   * GET /qr-login
   * Security: Return static HTML, JavaScript reads token from URL to prevent XSS
   */
  app.get('/qr-login', (_req: Request, res: Response) => {
    res.send(QR_LOGIN_PAGE_HTML);
  });

  /* ================================================================== */
  /*  OIDC / EntraID SSO Routes                                         */
  /* ================================================================== */

  /**
   * Initiate OIDC login — redirects to EntraID authorization endpoint.
   * GET /api/auth/oidc/login
   */
  app.get('/api/auth/oidc/login', apiRateLimiter, (req: Request, res: Response) => {
    try {
      if (!OIDC_CONFIG.enabled || !OidcService.isReady()) {
        res.status(404).json({ success: false, error: 'OIDC authentication is not enabled' });
        return;
      }

      const redirectTo = typeof req.query.redirect === 'string' ? req.query.redirect : undefined;
      const { authUrl, state } = OidcService.getAuthorizationUrl(redirectTo);

      // Store state in a short-lived cookie for double-check on callback
      res.cookie('oidc_state', state, {
        httpOnly: true,
        secure: getCookieOptions().secure,
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 min
      });

      res.redirect(authUrl);
    } catch (error) {
      console.error('[OIDC] Login initiation error:', error);
      res.status(500).json({ success: false, error: 'Failed to initiate OIDC login' });
    }
  });

  /**
   * OIDC callback — exchanges authorization code for tokens, provisions user.
   * GET /api/auth/oidc/callback
   */
  app.get('/api/auth/oidc/callback', apiRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!OIDC_CONFIG.enabled || !OidcService.isReady()) {
        res.status(404).send('OIDC authentication is not enabled');
        return;
      }

      // Verify state cookie matches query param (double CSRF check)
      const stateCookie = req.cookies?.['oidc_state'];
      if (!stateCookie || stateCookie !== req.query.state) {
        res.status(400).send('Invalid state token — possible CSRF attack. Please try again.');
        return;
      }
      res.clearCookie('oidc_state');

      const result = await OidcService.handleCallback(req.query as Record<string, string>);

      if (!result.success || !result.user) {
        // Show a simple error page with a link back to login
        res.status(401).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Auth Failed</title>` + `<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}` + `.box{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.1)}` + `a{color:#3498db}</style></head><body><div class="box">` + `<h2>Authentication Failed</h2><p>${result.error || 'Unknown error'}</p>` + `<a href="/#/login">Back to login</a></div></body></html>`);
        return;
      }

      // Issue access + refresh tokens
      const sessionToken = AuthService.generateToken({
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        auth_method: result.user.auth_method,
      });
      const refreshToken = AuthService.generateRefreshToken(result.user.id);

      res.cookie(AUTH_CONFIG.COOKIE.NAME, sessionToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.cookie('aionui-refresh', refreshToken, {
        ...getCookieOptions(),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
        path: '/api/auth/refresh',
      });

      // Redirect to the originally requested page, or home
      const redirectTo = result.redirectTo || '/';
      res.redirect(redirectTo);
    } catch (error) {
      console.error('[OIDC] Callback error:', error);
      res.status(500).send('Authentication failed — please try again.');
    }
  });
}

export default registerAuthRoutes;

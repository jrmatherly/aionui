/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { app as electronApp } from 'electron';
import type { Express, Request, Response } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { AUTH_CONFIG } from '../config/constants';
import { createRateLimiter } from '../middleware/security';
import { httpLogger as log } from '@/common/logger';

/**
 * Register static assets and page routes
 */
const resolveRendererPath = () => {
  // Webpack assets are always inside app.asar in production or project directory in development
  // electronApp.getAppPath() returns the correct path for both cases
  const appPath = electronApp.getAppPath();
  const baseRoot = path.join(appPath, '.webpack', 'renderer');
  const indexHtml = path.join(baseRoot, 'main_window', 'index.html');

  if (fs.existsSync(indexHtml)) {
    return { indexHtml, staticRoot: baseRoot } as const;
  }

  throw new Error(`Renderer assets not found at ${indexHtml}`);
};

export function registerStaticRoutes(app: Express): void {
  const { staticRoot, indexHtml } = resolveRendererPath();
  const indexHtmlPath = indexHtml;

  // Create a lenient rate limiter for static page requests to prevent DDoS
  const pageRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute (very lenient)
    message: 'Too many requests, please try again later',
  });

  const serveApplication = (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const token = TokenMiddleware.extractToken(req);
      if (token && !TokenMiddleware.isTokenValid(token)) {
        res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      }

      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      log.error({ err: error }, 'Error serving index.html');
      res.status(500).send('Internal Server Error');
    }
  };

  /**
   * Homepage
   * GET /
   */
  app.get('/', pageRateLimiter, serveApplication);

  /**
   * Handle favicon requests
   * GET /favicon.ico
   */
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    // Try packaged resources first (electron-builder extraResource), then project root
    const candidates = [path.join(process.resourcesPath || '', 'app.ico'), path.join(electronApp.getAppPath(), '..', 'app.ico'), path.join(electronApp.getAppPath(), 'resources', 'app.ico')];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(candidate);
        return;
      }
    }
    res.status(204).end();
  });

  /**
   * Handle SPA sub-routes (React Router)
   * Exclude: api, static, main_window, and webpack chunk directories (react, arco, vendors, etc.)
   * Also exclude files with extensions (.js, .css, .map, etc.)
   */
  app.get(/^\/(?!api|static|main_window|react|arco|vendors|markdown|codemirror)(?!.*\.[a-zA-Z0-9]+$).*/, pageRateLimiter, serveApplication);

  /**
   * Static assets
   */
  // Mount the compiled output directory directly so files are accessible after webpack writes them
  app.use(express.static(staticRoot));

  const mainWindowDir = path.join(staticRoot, 'main_window');
  if (fs.existsSync(mainWindowDir) && fs.statSync(mainWindowDir).isDirectory()) {
    app.use('/main_window', express.static(mainWindowDir));
  }

  const staticDir = path.join(staticRoot, 'static');
  if (fs.existsSync(staticDir) && fs.statSync(staticDir).isDirectory()) {
    app.use('/static', express.static(staticDir));
  }

  /**
   * React Syntax Highlighter language packs
   */
  if (fs.existsSync(staticRoot)) {
    app.use(
      '/react-syntax-highlighter_languages_highlight_',
      express.static(staticRoot, {
        setHeaders: (res, filePath) => {
          if (filePath.includes('react-syntax-highlighter_languages_highlight_')) {
            res.setHeader('Content-Type', 'application/javascript');
          }
        },
      })
    );
  }
}

export default registerStaticRoutes;

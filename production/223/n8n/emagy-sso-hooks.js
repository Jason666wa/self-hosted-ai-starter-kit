/**
 * Electromagnify → n8n Editor SSO (Community Edition)
 *
 * 重要：n8n 2.x 在 n8n.ready 里 app.get() 会落在 SPA fallback 之后，
 * 浏览器访问 /emagy-sso/consume 会直接拿到前端 404。
 * 必须像 Authelia Trusted Header 一样，把中间件插到 cookieParser 之后。
 *
 * EXTERNAL_HOOK_FILES=/home/node/.n8n/emagy-sso-hooks.js
 */
'use strict';

const { resolve, dirname } = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const usedJti = new Map();

function purgeJti(now) {
  for (const [k, exp] of usedJti.entries()) {
    if (exp <= now) usedJti.delete(k);
  }
}

function splitName(name) {
  const n = String(name || '').trim();
  if (!n) return { firstName: null, lastName: null };
  const parts = n.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0].slice(0, 32), lastName: null };
  return {
    firstName: parts[0].slice(0, 32),
    lastName: parts.slice(1).join(' ').slice(0, 32),
  };
}

function allowedRole(role) {
  const r = String(role || '').trim();
  const ok = new Set(['global:member', 'global:admin', 'global:chatUser']);
  if (ok.has(r)) return r;
  return 'global:member';
}

function maskEmail(email) {
  return String(email).replace(/(.{2}).+(@.+)/, '$1***$2');
}

module.exports = {
  n8n: {
    ready: [
      async function ({ app }) {
        const secret = (process.env.N8N_SSO_JWT_SECRET || '').trim();
        const iss = (process.env.N8N_SSO_ISS || 'electromagnify').trim();
        const aud = (process.env.N8N_SSO_AUD || 'n8n-editor').trim();
        const landing =
          (process.env.N8N_SSO_LANDING_PATH || '/home').trim() || '/home';
        const defaultRole = allowedRole(process.env.N8N_SSO_DEFAULT_ROLE);

        if (!secret) {
          console.warn('[emagy-sso] N8N_SSO_JWT_SECRET missing; consume disabled');
          return;
        }

        const n8nRoot = dirname(require.resolve('n8n/package.json'));
        const { issueCookie } = require(resolve(n8nRoot, 'dist/auth/jwt.js'));
        const { Container } = require('@n8n/di');
        const { UserRepository } = require('@n8n/db');
        let AuthService;
        try {
          AuthService = require(resolve(n8nRoot, 'dist/auth/auth.service.js')).AuthService;
        } catch (_) {
          AuthService = null;
        }

        // Express 4: app._router.stack；Express 5 / router: app.router.stack 或 app._router.stack
        const router = (app && (app._router || app.router)) || null;
        const stack = router && router.stack;
        if (!Array.isArray(stack)) {
          console.error(
            '[emagy-sso] app router stack missing; cannot inject middleware',
          );
          return;
        }

        const cookieIdx = stack.findIndex((l) => l && l.name === 'cookieParser');
        const insertAt = cookieIdx >= 0 ? cookieIdx + 1 : 0;

        // pnpm 下 router 不是 n8n 的直接依赖，require('router/lib/layer') 会失败。
        // 直接复用已挂载中间件 Layer 的 constructor（Express 4/5 通用）。
        const template =
          (cookieIdx >= 0 && stack[cookieIdx]) ||
          stack.find((l) => l && typeof l.handle === 'function' && !l.route);
        const Layer =
          template && typeof template.constructor === 'function'
            ? template.constructor
            : null;
        if (!Layer) {
          console.error(
            '[emagy-sso] cannot obtain Layer constructor from app._router.stack',
          );
          return;
        }

        const handler = async (req, res, next) => {
          const urlPath = (req.path || req.url || '').split('?')[0];
          if (urlPath !== '/emagy-sso/consume') {
            return next();
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
          }

          try {
            const ticket = String(
              (req.query && req.query.ticket) || '',
            ).trim();
            if (!ticket) {
              res.status(400).type('text/plain').send('missing ticket');
              return;
            }

            let payload;
            try {
              payload = jwt.verify(ticket, secret, {
                algorithms: ['HS256'],
                issuer: iss,
                audience: aud,
              });
            } catch (e) {
              console.error('[emagy-sso] ticket verify failed:', e && e.message);
              res.status(401).type('text/plain').send('invalid ticket');
              return;
            }

            const email = String(payload.email || '')
              .trim()
              .toLowerCase();
            if (!email) {
              res.status(400).type('text/plain').send('ticket missing email');
              return;
            }

            const jti = String(payload.jti || '').trim();
            const now = Date.now();
            purgeJti(now);
            if (jti) {
              if (usedJti.has(jti)) {
                res.status(401).type('text/plain').send('ticket already used');
                return;
              }
              usedJti.set(jti, payload.exp ? Number(payload.exp) * 1000 : now + 120000);
            }

            const userRepository = Container.get(UserRepository);
            let user = await userRepository.findOne({
              where: { email },
              relations: ['role'],
            });

            let created = false;
            if (!user) {
              const { firstName, lastName } = splitName(payload.name);
              const roleSlug = allowedRole(payload.role || defaultRole);
              try {
                const result = await userRepository.createUserWithProject({
                  email,
                  firstName: firstName || email.split('@')[0].slice(0, 32),
                  lastName: lastName || '',
                  password: crypto.randomBytes(32).toString('hex'),
                  role: { slug: roleSlug },
                });
                user = result.user;
                created = true;
                console.log(
                  '[emagy-sso] created user',
                  maskEmail(email),
                  'role=',
                  roleSlug,
                );
              } catch (createErr) {
                console.error(
                  '[emagy-sso] createUser failed:',
                  createErr && createErr.message,
                );
                // 单用户 license：尝试匹配 Owner（仅当库里只有 1 个用户且提示升级）
                const owners = await userRepository.find({
                  relations: ['role'],
                  take: 2,
                });
                if (
                  owners.length === 1 &&
                  owners[0].role &&
                  owners[0].role.slug === 'global:owner'
                ) {
                  res
                    .status(403)
                    .type('text/plain')
                    .send(
                      'n8n license allows only 1 user. Set n8n Owner email to ' +
                        email +
                        ' (Settings → Users), or upgrade plan to create additional users.',
                    );
                  return;
                }
                res
                  .status(403)
                  .type('text/plain')
                  .send(
                    'cannot create n8n user: ' +
                      ((createErr && createErr.message) || 'unknown error'),
                  );
                return;
              }
            }

            if (!user || user.disabled) {
              res.status(403).type('text/plain').send('user disabled or missing');
              return;
            }

            if (!user.role) {
              user = await userRepository.findOne({
                where: { id: user.id },
                relations: ['role'],
              });
            }

            try {
              if (AuthService) {
                Container.get(AuthService).clearCookie(res);
              } else {
                res.clearCookie('n8n-auth');
              }
            } catch (_) {
              res.clearCookie('n8n-auth');
            }

            try {
              issueCookie(res, user);
            } catch (cookieErr) {
              console.error(
                '[emagy-sso] issueCookie failed:',
                cookieErr && cookieErr.message,
              );
              res
                .status(403)
                .type('text/plain')
                .send(
                  String(
                    (cookieErr && cookieErr.message) ||
                      'issueCookie failed (users quota?)',
                  ),
                );
              return;
            }

            const dest = landing.startsWith('/') ? landing : `/${landing}`;
            console.log(
              '[emagy-sso] ok',
              created ? 'new' : 'existing',
              maskEmail(email),
              'role=',
              user.role && user.role.slug,
              '->',
              dest,
            );
            res.redirect(302, dest);
          } catch (e) {
            console.error('[emagy-sso] consume error:', e);
            res.status(500).type('text/plain').send('sso consume failed');
          }
        };

        stack.splice(
          insertAt,
          0,
          new Layer(
            '/',
            { sensitive: false, strict: false, end: false },
            handler,
          ),
        );

        console.log(
          '[emagy-sso] middleware injected after cookieParser (idx=' +
            insertAt +
            ', Layer=' +
            (Layer.name || 'anonymous') +
            '); landing=' +
            landing,
        );
      },
    ],
  },
};

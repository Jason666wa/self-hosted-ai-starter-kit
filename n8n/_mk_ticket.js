'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const secret = process.env.N8N_SSO_JWT_SECRET;
const email = process.argv[2] || 'admin@electromagnify.com';
const token = jwt.sign(
  {
    email,
    name: '系统管理员',
    role: 'global:member',
    jti: crypto.randomUUID(),
  },
  secret,
  {
    algorithm: 'HS256',
    issuer: process.env.N8N_SSO_ISS || 'electromagnify',
    audience: process.env.N8N_SSO_AUD || 'n8n-editor',
    expiresIn: '2m',
  },
);
process.stdout.write(token);

'use strict';
const { resolve, dirname } = require('path');
const { createRequire } = require('module');
try {
  const n8nRoot = dirname(require.resolve('n8n/package.json'));
  console.log('n8nRoot', n8nRoot);
  const n8nRequire = createRequire(resolve(n8nRoot, 'package.json'));
  try {
    const Layer = n8nRequire('router/lib/layer');
    console.log('OK router/lib/layer', typeof Layer);
  } catch (e) {
    console.log('FAIL router/lib/layer', e.message);
  }
  try {
    console.log('resolve router', n8nRequire.resolve('router/package.json'));
  } catch (e) {
    console.log('FAIL resolve router', e.message);
  }
  try {
    console.log('resolve express', n8nRequire.resolve('express/package.json'));
  } catch (e) {
    console.log('FAIL resolve express', e.message);
  }
} catch (e) {
  console.log('TOP FAIL', e.message);
}

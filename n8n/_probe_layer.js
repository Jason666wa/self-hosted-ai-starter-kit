'use strict';
const path = require('path');
try {
  const Layer = require('router/lib/layer');
  console.log('router/lib/layer OK', typeof Layer);
} catch (e) {
  console.log('router/lib/layer FAIL', e.message);
}
try {
  const p = require.resolve('router/package.json');
  console.log('router pkg', p);
  const Layer2 = require(path.join(path.dirname(p), 'lib/layer.js'));
  console.log('resolved layer OK', typeof Layer2);
} catch (e) {
  console.log('resolved FAIL', e.message);
}

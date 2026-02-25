const express = require('express');
const app = express();
try {
  app.options('*', (req, res) => res.send('ok'));
  console.log('* works');
} catch (e) {
  console.log('* failed:', e.message);
}
try {
  app.options('/*', (req, res) => res.send('ok'));
  console.log('/* works');
} catch (e) {
  console.log('/* failed:', e.message);
}
try {
  app.options(/(.*)/, (req, res) => res.send('ok'));
  console.log('/(.*)/ works');
} catch (e) {
  console.log('/(.*)/ failed:', e.message);
}

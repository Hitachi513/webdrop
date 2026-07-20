#!/usr/bin/env node
// Minify static assets for production deployment.
// Run: node build.js  (executed in Dockerfile before npm prune --production)
const { minify } = require('terser');
const CleanCSS   = require('clean-css');
const fs         = require('fs');

async function run() {
  const jsFiles  = ['public/app.js', 'public/i18n.js'];
  const cssFiles = ['public/style.css'];

  for (const src of jsFiles) {
    const raw = fs.readFileSync(src, 'utf8');
    const res = await minify(raw, {
      compress: { passes: 2 },
      mangle: true,
      format: { comments: false },
    });
    fs.writeFileSync(src, res.code);
    console.log(`${src}: ${kb(raw)} → ${kb(res.code)}`);
  }

  const cc = new CleanCSS({ level: { 1: { specialComments: 0 }, 2: { all: true } } });
  for (const src of cssFiles) {
    const raw = fs.readFileSync(src, 'utf8');
    const res = cc.minify(raw);
    if (res.errors.length) { console.error('CSS errors:', res.errors); process.exit(1); }
    fs.writeFileSync(src, res.styles);
    console.log(`${src}: ${kb(raw)} → ${kb(res.styles)}`);
  }
}

const kb = s => `${(s.length / 1024).toFixed(1)}KB`;
run().catch(e => { console.error(e); process.exit(1); });

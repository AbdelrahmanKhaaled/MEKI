#!/usr/bin/env node
// Static frontend ↔ backend integration check. Finds every API call in apps/web and apps/admin, resolves its method and
// path, and checks that the exact (method, path) exists in the generated OpenAPI document (packages/api-client/openapi.json).
//   node scripts/api-integration-matrix.mjs            → summary + exit 1 when a call has no backend route
//   node scripts/api-integration-matrix.mjs --md       → Markdown tables (used in docs/FINAL_FULLSTACK_API_INTEGRATION_MATRIX.md)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const spec = JSON.parse(readFileSync(join(ROOT, 'packages/api-client/openapi.json'), 'utf8'));
const routes = [];
for (const [p, ops] of Object.entries(spec.paths)) {
  for (const m of Object.keys(ops)) {
    const rel = p.replace(/^\/api\/v1/, '');
    routes.push({ method: m.toUpperCase(), path: p, rel, re: new RegExp('^' + rel.replace(/\{[^}]+\}/g, '[^/]+') + '$') });
  }
}

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return f === 'node_modules' || f === 'generated' ? [] : walk(p);
  return /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\./.test(f) ? [p] : [];
});

// Call helpers and the HTTP method they imply (null = read `method:` from the options object).
const HELPERS = { apiGet: 'GET', apiList: 'GET', apiPost: 'POST', apiPatch: 'PATCH', apiPut: 'PUT', apiDelete: 'DELETE', apiUpload: 'POST', apiDownload: 'GET', apiCount: 'GET', fetchPublicContent: 'GET', fetchPublicResource: 'GET', clientApiBlob: 'GET', clientApi: null, serverApi: null, request: 'ARG' };
const CALL = new RegExp(`\\b(${Object.keys(HELPERS).join('|')})\\s*(?:<[^()]*?>)?\\(\\s*(?:"(GET|POST|PATCH|PUT|DELETE)"\\s*,\\s*)?([\`"'])((?:\\\\.|(?!\\3).)*?)\\3`, 'gs');

// String-literal union types (e.g. type CampaignAction = "submit" | "archive") so `${action}` segments can be expanded.
const unions = new Map();
for (const f of ['web', 'admin'].flatMap((app) => walk(join(ROOT, 'apps', app, 'src')))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/type (\w+) = ((?:"[^"]+"\s*\|\s*)+"[^"]+");/g)) unions.set(m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}
const literalUnion = (t) => (t.startsWith('"') ? [...t.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : unions.get(t));
const TERNARY = /\$\{[^{}?]*\?\s*["'`]([^"'`]*)["'`]\s*:\s*["'`]([^"'`]*)["'`]\s*\}/;

/** Expands ternary and union-typed segments into concrete paths; other expressions become {x}; query strings are dropped. */
function variants(raw, context) {
  let outs = [raw.replace(/^\/api\/v1/, '')];
  while (outs.some((o) => TERNARY.test(o))) outs = outs.flatMap((o) => { const m = TERNARY.exec(o); return m ? [o.replace(m[0], m[1]), o.replace(m[0], m[2])] : [o]; });
  outs = outs.flatMap((o) => {
    let acc = [o];
    for (const m of o.matchAll(/\$\{(\w+)\}/g)) {
      const t = new RegExp(`\\b${m[1]}\\??\\s*:\\s*((?:"[^"]+"\\s*\\|\\s*)+"[^"]+"|\\w+)`).exec(context)?.[1];
      const vals = t && literalUnion(t);
      if (vals) acc = acc.flatMap((a) => vals.map((v) => a.replace(m[0], v)));
    }
    return acc;
  });
  return outs.map((o) => o.replace(/\$\{[^}]*\}/g, '{x}').replace(/\?.*$/, '').replace(/([^/])\{x\}$/, '$1'));
}

const calls = [];
for (const app of ['web', 'admin']) {
  for (const file of walk(join(ROOT, 'apps', app, 'src'))) {
    let src = readFileSync(file, 'utf8');
    // Inline local path builders such as `const e = (id: string) => \`/admin/events/${...}\`` (same line count preserved).
    for (const d of [...src.matchAll(/const (\w+) = \([^)]*\)(?:: string)? => `([^`\n]+)`/g)]) {
      const [, name, body] = d;
      if (!body.startsWith('/')) continue;
      src = src.replace(new RegExp(`\\$\\{${name}\\([^()]*(?:\\([^()]*\\))?[^()]*\\)\\}`, 'g'), () => body);
      src = src.replace(new RegExp(`\\(\\s*${name}\\([^()]*\\)\\s*([,)])`, 'g'), (_, end) => `(\`${body}\`${end}`);
    }
    for (const m of src.matchAll(CALL)) {
      const [, helper, argMethod, , raw] = m;
      if (!raw.startsWith('/') || raw.startsWith('/api/v1/') === false && !/^\/(public|admin|webhooks|integrations|health|media)/.test(raw)) continue;
      let method = HELPERS[helper];
      if (method === 'ARG') method = argMethod ?? null;
      if (method === null) {
        const opts = src.slice(m.index + m[0].length, m.index + m[0].length + 240);
        method = /^\s*,\s*\{[^}]*?method:\s*"(\w+)"/s.exec(opts)?.[1] ?? 'GET';
      }
      const line = src.slice(0, m.index).split('\n').length;
      for (const path of variants(raw, src.slice(Math.max(0, m.index - 400), m.index))) {
        const probe = path.replace(/\{x\}/g, 'X');
        const route = routes.find((r) => r.method === method && r.re.test(probe));
        calls.push({ app, file: relative(ROOT, file).replace(/\\/g, '/'), line, helper, method, path, route: route?.path ?? null });
      }
    }
  }
}

const used = new Set(calls.filter((c) => c.route).map((c) => `${c.method} ${c.route}`));
const unused = routes.filter((r) => !used.has(`${r.method} ${r.path}`));
const missing = calls.filter((c) => !c.route);

if (process.argv.includes('--md')) {
  for (const app of ['web', 'admin']) {
    const rows = calls.filter((c) => c.app === app);
    console.log(`\n### ${app === 'web' ? 'Website (apps/web)' : 'Admin dashboard (apps/admin)'} — ${rows.length} call sites\n`);
    console.log('| Method | Frontend path | Backend route (OpenAPI) | Call site | Status |');
    console.log('|---|---|---|---|---|');
    for (const c of rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)))
      console.log(`| ${c.method} | \`${c.path}\` | ${c.route ? `\`${c.route}\`` : '—'} | ${c.file}:${c.line} | ${c.route ? 'PASS' : 'FAIL'} |`);
  }
  console.log(`\n### Backend routes not called by either frontend — ${unused.length}\n`);
  console.log('| Method | Route |');
  console.log('|---|---|');
  for (const r of unused) console.log(`| ${r.method} | \`${r.path}\` |`);
} else {
  console.log(`OpenAPI operations: ${routes.length} (${Object.keys(spec.paths).length} paths)`);
  console.log(`Frontend call sites: web ${calls.filter((c) => c.app === 'web').length}, admin ${calls.filter((c) => c.app === 'admin').length}`);
  console.log(`Operations used by a frontend: ${used.size}; not used: ${unused.length}`);
  console.log(`Call sites WITHOUT a backend route: ${missing.length}`);
  for (const c of missing) console.log(`  FAIL ${c.method} ${c.path}  (${c.file}:${c.line})`);
}
process.exit(missing.length ? 1 : 0);

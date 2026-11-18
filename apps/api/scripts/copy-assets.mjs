// Copies runtime assets (brand logos, bundled OFL fonts) next to the compiled output so that a deployment shipping only
// dist/ (plus node_modules) still finds them: the API resolves apps/api/assets first, then dist/assets.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'assets');
const to = resolve(root, 'dist/assets');
if (!existsSync(from)) throw new Error('apps/api/assets is missing');
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('assets copied to dist/assets');

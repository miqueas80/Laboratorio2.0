/**
 * Build a self-hosted Yjs ESM bundle, including its lib0 runtime.
 * Prerequisite: npm install --no-save yjs@13.6.32 esbuild@0.25.9
 * This output is distributed as an artifact and never auto-fetched via CDN.
 */
import {build} from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=path.join(root,'node_modules/yjs/dist/yjs.mjs');
const out=path.join(root,'next/vendor/yjs/yjs.bundle.mjs');
const pkg=JSON.parse(await fs.readFile(path.join(root,'node_modules/yjs/package.json'),'utf8'));
if(pkg.version!=='13.6.32')throw Error('Versión de Yjs no auditada: '+pkg.version);
await fs.mkdir(path.dirname(out),{recursive:true});
await build({
 entryPoints:[entry],outfile:out,bundle:true,format:'esm',platform:'browser',
 target:'es2022',minify:true,legalComments:'eof'
});
const bytes=await fs.readFile(out);
console.log(JSON.stringify({version:pkg.version,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),outfile:'next/vendor/yjs/yjs.bundle.mjs'},null,2));

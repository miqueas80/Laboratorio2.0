/** Release preflight: the entire Edge diff must stay out of stable app files.
 * Runs against the actual merge-base of origin/main, not a stale SHA.
 * This protects future stable voice/mascot changes from an accidental PR.
 */
import {execFileSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',timeout:30000}).trim();
const current=git('rev-parse','HEAD');
const stable=git('rev-parse','origin/main');
const base=git('merge-base','origin/main','HEAD');
if(!/^[0-9a-f]{40}$/.test(base))throw Error('No se encontró el ancestro común con main');
const all=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean);
const safe=path=>
 /^next\//.test(path)||
 /^next-[a-z0-9-]+\.test\.mjs$/.test(path)||
 /^scripts\//.test(path)||
 /^docs\//.test(path)||
 /^\.github\/workflows\//.test(path)||
 path==='offline/edge-sw.js';
const unsafe=all.filter(p=>!safe(p));
const protectedPaths=['app.js','index.html','inventory.json','documents-manifest.json',
 'service-worker.js','sw.js','manifest.json','package.json'];
for(const name of protectedPaths)
 if(all.includes(name)&&!unsafe.includes(name))unsafe.push(name);
const result={current,stable,mergeBase:base,files:all.length,
  productionFilesModified:unsafe,protectedPathsUntouched:unsafe.length===0};
console.log(JSON.stringify(result,null,2));
if(unsafe.length)throw Error('PR modifica archivos fuera del perímetro experimental: '+unsafe.join(', '));

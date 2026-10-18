import {build} from 'esbuild';
import {mkdir,copyFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(resolve(root,'dist'),{recursive:true});
await build({entryPoints:[resolve(root,'frontend/main.jsx')],outfile:resolve(root,'dist/app.js'),bundle:true,minify:true,sourcemap:true,target:['es2022'],format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked',logLevel:'info'});
for(const file of ['index.html','favicon.svg'])await copyFile(resolve(root,'frontend',file),resolve(root,'dist',file));
console.log('Production frontend built in dist/.');

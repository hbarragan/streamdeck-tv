import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,copyFile,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const folder=await mkdtemp(join(tmpdir(),'streamdeck-exe-'));
const exe=join(folder,'StreamDeck-TV.exe');
const children=[];
const fixture=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({tmdbConfigured:true,plexConfigured:false,region:'ES',path:req.url}));});
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
async function availablePort(){const server=createServer();await listen(server);const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const env={...process.env};for(const key of Object.keys(env))if(key==='TMDB_TOKEN'||key==='PORT'||key==='STREAMDECK_API_BASE'||key.startsWith('PLEX_'))delete env[key];
async function start(args){const child=spawn(exe,[...args,'--no-open'],{env,cwd:folder,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('El EXE no arrancó')),10000);child.on('error',reject);child.once('exit',code=>{clearTimeout(timeout);reject(Error('El EXE salió con '+code));});child.stdout.on('data',data=>{if(String(data).includes('disponible')){clearTimeout(timeout);resolve();}});});return child;}
async function stop(child){if(child.exitCode!==null||child.signalCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
try {
  await copyFile(new URL('../dist/StreamDeck-TV.exe',import.meta.url),exe);
  await writeFile(join(folder,'.env'),'TMDB_TOKEN=fixture-not-a-real-key\n');
  const port=await availablePort(),child=await start(['--port',String(port)]),base='http://127.0.0.1:'+port;
  assert.deepEqual(await fetch(base+'/api/status').then(r=>r.json()),{tmdbConfigured:true,plexConfigured:false,region:'ES'});
  for(const name of ['index.html','app.js','style.css','icon.svg','tmdb.svg'])assert.equal(await fetch(base+'/'+name).then(r=>r.text()),await readFile(new URL('../public/'+name,import.meta.url),'utf8'));
  assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/api/status',{method:'POST'})).status,405);
  await stop(child);await unlink(join(folder,'.env'));
  await listen(fixture);const remote='http://127.0.0.1:'+fixture.address().port;
  const proxyPort=await availablePort(),proxy=await start(['--server',remote,'--port',String(proxyPort)]);
  assert.equal((await fetch('http://127.0.0.1:'+proxyPort+'/api/status').then(r=>r.json())).path,'/api/status');
  assert.equal((await fetch('http://127.0.0.1:'+proxyPort+'/api/status',{method:'POST'})).status,405);
  await stop(proxy);
  const occupied=spawn(exe,['--port',String(fixture.address().port),'--no-open'],{env,cwd:folder,windowsHide:true,stdio:'ignore'});
  assert.equal(await new Promise(resolve=>occupied.once('exit',resolve)),1);
  console.log('EXE verificado fuera del proyecto: assets incrustados, .env externo, API, proxy de catálogo, métodos restringidos y puerto ocupado.');
} finally {for(const child of children)await stop(child);await new Promise(resolve=>fixture.close(resolve));await unlink(join(folder,'.env')).catch(()=>{});await unlink(exe);await rmdir(folder);}

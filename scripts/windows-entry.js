import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { getAsset } from 'node:sea';
import { createHandler } from '../server/app.js';

const args=process.argv.slice(2);
if(args.includes('--help')) {
  console.log('StreamDeck TV\n--server URL    Servidor del catálogo (NAS o Vercel)\n--env-file RUTA Archivo privado de configuración\n--port NUMERO  Puerto local (3477 por defecto)\n--no-open      No abrir el navegador');
  process.exit(0);
}
function option(name) {const index=args.indexOf(name);if(index<0)return undefined;const value=args[index+1];if(!value||value.startsWith('--'))throw Error('Falta el valor de '+name);return value;}
try {
  const envPath=option('--env-file') ? resolve(option('--env-file')) : join(dirname(process.execPath),'.env');
  if(existsSync(envPath)) {for(const [key,value] of Object.entries(parseEnv(readFileSync(envPath,'utf8')))) if(process.env[key]===undefined)process.env[key]=value;}
  else if(option('--env-file')) throw Error('No se encuentra el archivo de configuración');
  const port=Number(option('--port')||process.env.PORT||3477);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Puerto inválido');
  const remote=option('--server')||process.env.STREAMDECK_API_BASE||(!process.env.TMDB_TOKEN?'https://streamdeck-tv.vercel.app':'');
  const base=remote?new URL(remote):null;
  if(base&&(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash))throw Error('Dirección del servidor inválida');
  const handler=createHandler({tmdbToken:process.env.TMDB_TOKEN,plexUrl:process.env.PLEX_URL,plexToken:process.env.PLEX_TOKEN,plexServerId:process.env.PLEX_SERVER_ID,plexLibraryIds:process.env.PLEX_LIBRARY_IDS,plexHomeUrl:process.env.PLEX_HOME_URL,plexServerName:process.env.PLEX_SERVER_NAME,readAsset:name=>Buffer.from(getAsset('public/'+name))});
  const server=createServer(async(req,res)=>{
    if(base&&req.url.startsWith('/api/')) {
      try {
        if(req.method!=='GET'){res.writeHead(405);return res.end();}
        const response=await fetch(new URL(req.url,base),{signal:AbortSignal.timeout(65000),redirect:'error'});
        const body=Buffer.from(await response.arrayBuffer());
        res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
      } catch {res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'No se pudo conectar con el servidor del catálogo.'}));}
      return;
    }
    return handler(req,res);
  });
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'El puerto está ocupado. Usa --port con otro número.':'No se pudo iniciar StreamDeck.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>{
    const url='http://localhost:'+port;
    console.log('StreamDeck TV disponible en '+url+'\nMantén esta ventana abierta. Ctrl+C para salir.');
    if(!args.includes('--no-open')){const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('Abre la dirección anterior en tu navegador.'));child.unref();}
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
} catch {console.error('Configuración inválida. Revisa el archivo privado y los argumentos (--help).');process.exitCode=1;}

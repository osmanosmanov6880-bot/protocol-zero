// Optional zero-dependency static server. Main experience needs no API and no backend.
import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8080);
const host=process.env.HOST||'127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.md':'text/plain; charset=utf-8'};
const app=createServer((req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Bad URL');}
 if(pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,engine:'PROTOCOL ZERO CINEMA ENGINE',version:'1.0.0'}));}
 if(pathname==='/'||pathname==='/prototype'||pathname==='/prototype/')pathname=pathname==='/'?'/index.html':'/prototype/index.html';
 const filepath=resolve(root,`.${pathname}`);
 if(filepath!==root&&!filepath.startsWith(root+sep)){res.writeHead(403);return res.end('Forbidden');}
 let stats;try{stats=statSync(filepath);if(!stats.isFile())throw new Error('not a file');}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}
 const type=mime[extname(filepath)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':type,'Content-Length':stats.size,'Cache-Control':filepath.includes(`${sep}assets${sep}`)?'public, max-age=3600':'no-cache'});
 if(req.method==='HEAD')return res.end();
 createReadStream(filepath).pipe(res);
});
app.on('error',e=>{console.error(e.message);process.exitCode=1;});
app.listen(port,host,()=>console.log(`PROTOCOL ZERO — http://${host}:${port}\nFull movie: /\nThree-scene prototype: /prototype/`));

import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
function contentType(path){return types[path.slice(path.lastIndexOf('.')).toLowerCase()]||'application/octet-stream';}
function fileFor(pathname){
  const relative=decodeURIComponent(pathname==='/'?'index.html':pathname).replace(/^[/\\]+/,'');
  const file=resolve(root,relative);
  return file.startsWith(root+sep)||file===root?file:null;
}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
    const target=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);
    const file=fileFor(target.pathname);
    if(!file){res.writeHead(403);return res.end();}
    const info=await stat(file);if(!info.isFile())throw Error('not_file');
    const headers={'Content-Type':contentType(file),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(req.method==='HEAD'){res.writeHead(200,headers);return res.end();}
    res.writeHead(200,headers);res.end(await readFile(file));
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('not found');}
});
server.listen(port,'127.0.0.1',()=>process.stdout.write(`E2E static server listening on ${port}\n`));

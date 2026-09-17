/* Local review of the generated publish directory. No API proxy or live-service
 * bypass. Models this repository's Netlify aliases and security headers only.
 */
import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.PORT || 3002);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml'};
const headerText=await readFile(path.join(root,'_headers'),'utf8');
const groups=[];let group;
for(const line of headerText.split('\n')) {
 if(line.startsWith('/')){group={pattern:line,headers:{}};groups.push(group);}
 else if(group && line.includes(':')) {const i=line.indexOf(':');group.headers[line.slice(0,i).trim()]=line.slice(i+1).trim();}
}
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:'+port);
 for(const g of groups) if(g.pattern==='/*'||url.pathname.startsWith(g.pattern.replace(/\*$/,''))) for(const [name,value] of Object.entries(g.headers))res.setHeader(name,value);
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try {
  const decoded=decodeURIComponent(url.pathname);
  if(decoded.split('/').some(p=>p==='..'||p.startsWith('.')&&p!=='.well-known') || /\\/.test(decoded)) throw Error('Invalid path');
  let file=path.join(root,decoded);
  try {if((await stat(file)).isDirectory())file=path.join(file,'index.html');}
  catch{if(!path.extname(file))file+='.html';}
  if(!file.startsWith(root))throw Error('Invalid path');
  const data=await readFile(file);
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);
 }catch {res.writeHead(404,{'Content-Type':'text/html'});res.end(await readFile(path.join(root,'404.html')));}
}).listen(port,'127.0.0.1',()=>console.log(`V2 publish directory: http://127.0.0.1:${port} (test services required for local authentication)`));

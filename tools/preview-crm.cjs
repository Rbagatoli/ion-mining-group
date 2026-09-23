/* Loopback preview; serves only declared public application assets. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),crm=new Map(require('./build-crm.cjs').assets().map(a=>['/crm/'+a.to,a.from]));
const app=JSON.parse(fs.readFileSync(path.join(root,'tools/app-assets.json'),'utf8'));
app.forEach(a=>crm.set('/app/'+a,a));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
function createServer(){return http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(e){res.writeHead(400);return res.end();}
  if(pathname==='/'){res.writeHead(302,{Location:'/crm/'});return res.end();}
  if(pathname==='/crm'||pathname==='/app'){res.writeHead(302,{Location:pathname+'/'});return res.end();}
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=crm.get(pathname);if(!file){res.writeHead(404);return res.end('Undeclared asset');}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(path.join(root,file)).pipe(res);
});}
module.exports={createServer};
if(require.main===module){const port=Number(process.env.PROTON_CRM_PORT||8767);createServer().listen(port,'127.0.0.1',()=>console.log('Proton CRM: http://127.0.0.1:'+port+'/crm/'));}

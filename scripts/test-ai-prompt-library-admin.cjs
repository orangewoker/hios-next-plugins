const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const html=fs.readFileSync(path.join(__dirname,'../plugins/ai-prompt-library/runtime/index.html'));
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'hios-admin-login-')));
let expire=false;const requests=[];
const server=http.createServer((req,res)=>{
 const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(req.url==='/plugin'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
 if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end('<iframe src="/plugin" style="width:600px;height:1000px"></iframe><script>window.messages=[];addEventListener("message",e=>messages.push(e.data))</script>');}
 if(req.url==='/api/v1/auth/login'){
  let body='';req.on('data',d=>body+=d);req.on('end',()=>{
   const v=JSON.parse(body);assert.equal(req.headers['x-api-key'],undefined);assert.equal(req.headers.authorization,undefined);
   if(v.password!=='fixture-password')return json(401,{detail:'bad password'});
   const send=()=>json(200,{access_token:'fixture-admin-token',role:v.username==='reader'?'user':'admin',username:v.username});
   v.username==='slow'?setTimeout(send,250):send();
  });return;
 }
 if(req.url.startsWith('/api/')){
  requests.push({path:req.url,auth:req.headers.authorization,key:req.headers['x-api-key']});
  if(expire||req.headers.authorization!=='Bearer fixture-admin-token')return json(401,{});
  if(req.url==='/api/v1/health')return json(200,{status:'ok'});
  if(req.method==='POST')return json(200,{id:2,name:'管理员新分类'});
  return json(200,[{id:1,name:'已有分类'}]);
 }
 res.writeHead(404);res.end();
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const win=new BrowserWindow({show:false,width:900,height:1100,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const js=s=>win.webContents.executeJavaScript(s);
 const frame=s=>js(`(()=>{const w=frames[0],d=w.document;${s}})()`);
 const until=async(check)=>{for(let n=0;n<150;n++){if(await check())return;await delay(20);}throw Error('timeout');};
 const status=()=>frame(`return d.querySelector('#adminLoginStatus').textContent`);
 const login=async(user,pass='fixture-password')=>{await frame(`d.querySelector('#adminUsername').value=${JSON.stringify(user)};d.querySelector('#adminPassword').value=${JSON.stringify(pass)};d.querySelector('#adminLogin').click();`);await until(()=>frame(`return !d.querySelector('#adminLogin').disabled`));};
 try{
  await win.loadURL(origin);await until(()=>frame(`return !!d.querySelector('#adminLogin')`));
  await frame(`d.querySelector('#serverUrl').value=${JSON.stringify(origin)};d.querySelector('#serverUrl').dispatchEvent(new w.Event('change'));d.querySelector('#adminLoginPanel').open=true;`);
  await login('admin','wrong');assert.match(await status(),/账号或密码错误/);
  await login('reader');assert.match(await status(),/不是管理员/);
  await login('admin');assert.match(await status(),/已登录/);
  assert.equal(await frame(`return d.querySelector('#status').textContent`),'已连接');
  assert.equal(await frame(`return d.querySelector('#adminPassword').value`),'');
  assert.ok(requests.length>0&&requests.every(r=>r.auth==='Bearer fixture-admin-token'&&!r.key));
  await frame(`d.querySelector('#newCategoryName').value='管理员新分类';d.querySelector('#createCategory').click();`);
  await until(()=>frame(`return d.querySelector('#saveCategory').value==='2'`));
  const persisted=await frame(`return JSON.stringify({...w.localStorage})+JSON.stringify({...w.sessionStorage})`);
  assert.ok(!persisted.includes('fixture-admin-token')&&!persisted.includes('fixture-password'));
  assert.ok(!(await js('JSON.stringify(messages)')).includes('fixture-admin-token'));
  await frame(`d.querySelector('#adminLogout').click()`);assert.match(await status(),/已退出/);
  assert.equal(await frame(`return d.querySelectorAll('#saveCategory option').length`),1);
  await login('admin');expire=true;await frame(`d.querySelector('#refreshSaveCategories').click()`);
  await until(async()=>/过期/.test(await status()));assert.equal(await frame(`return d.querySelector('#adminLogout').hidden`),true);
  expire=false;await login('admin');await frame(`d.querySelector('#serverUrl').value+='x';d.querySelector('#serverUrl').dispatchEvent(new w.Event('input'));`);
  assert.equal(await frame(`return d.querySelector('#adminLogout').hidden`),true);
  await frame(`d.querySelector('#serverUrl').value=${JSON.stringify(origin)};d.querySelector('#serverUrl').dispatchEvent(new w.Event('change'));d.querySelector('#adminUsername').value='slow';d.querySelector('#adminPassword').value='fixture-password';d.querySelector('#adminLogin').click();`);
  await delay(40);await frame(`d.querySelector('#serverUrl').value+='other';d.querySelector('#serverUrl').dispatchEvent(new w.Event('input'));`);await delay(350);
  assert.equal(await frame(`return d.querySelector('#adminLogout').hidden`),true,'late login must not authorize a different service');
  console.log('PASS: admin login, incorrect credentials, non-admin rejection, bearer-only requests, category creation, logout, expiry, config changes, late response isolation, no persisted passwords/tokens');
  server.close();app.exit(0);
 }catch(e){console.error(e);server.close();app.exit(1);}
});

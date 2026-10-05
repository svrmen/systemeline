const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const assets=[...html.matchAll(/<script src="([^"]+)"/g)].map(match=>match[1]);
const build=fs.readFileSync('routes.js','utf8').match(/SYSTEMELINE_BUILD='([^']+)'/)[1];
function browser({storage=new Map(),missingColumnsModule=false,oldMarkup=false}={}){
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
 if(oldMarkup)ids.delete('routeStartColumn');
 const defaults={mat:'AL',rating:'400',conductors:'5',orientation:'FLAT',ip:'IP55',startType:'NKU',endType:'ENDCAP',startW:600,startD:600,startH:2200,endW:600,endD:600,endH:2200,moduleLen:3000,mountOn:'1',mountStep:1000,routeKind:'TR_NKU'};
 const elements=new Map(),events={},errors={};
 const canvas=new Proxy({measureText:text=>({width:String(text).length*7})},{get:(o,k)=>o[k]??(()=>{})});
 function element(id){
  const item={id,value:defaults[id]??'',style:{},dataset:{},options:[],children:[],clientWidth:820,clientHeight:760,classList:{toggle(){},add(){},remove(){}},setAttribute(){},focus(){},setPointerCapture(){},querySelector:()=>element(),addEventListener(name,fn){this[name]=fn;},getContext:()=>canvas,appendChild(child){this.children.push(child);this.options.push(child);if(child.id)elements.set(child.id,child);},getBoundingClientRect:()=>({left:0,top:0,width:820,height:760})};
  Object.defineProperty(item,'innerHTML',{get:()=>'',set:()=>{item.children=[];item.options=[];}});
  return item;
 }
 const header=element('header'),body=element('body');
 const sandbox={document:{body,getElementById:id=>{if(!ids.has(id)&&!elements.has(id))return null;if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},querySelector:selector=>selector==='header'?header:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{events[name]=fn;},createElement:()=>element()},window:{devicePixelRatio:2,location:{href:'http://127.0.0.1:8767/?keep=1'},addEventListener:(name,fn)=>{errors[name]=fn;}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},URL,Blob,console,alert(){},addEventListener(){},setTimeout(){}};
 vm.createContext(sandbox);
 for(const src of assets){const file=src.split('?')[0];if(missingColumnsModule&&file==='nku-columns.js')continue;vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});}
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],sandbox,{filename:'index.html'});
 const run=source=>vm.runInContext(source,sandbox);
 return {sandbox,storage,elements,run,boot:()=>events.DOMContentLoaded(),fail:()=>errors.error()};
}
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
check('all browser assets use the same build revision and resolve to existing files',()=>{
 assert.equal(assets.length,6);
 for(const src of assets){assert.equal(new URL(src,'http://localhost/').searchParams.get('v'),build);assert.ok(fs.existsSync(src.split('?')[0]));}
 assert.ok(assets.findIndex(src=>src.startsWith('nku-columns.js'))<assets.length);
});
check('actual empty-project startup initializes the route picker and add button',()=>{
 const b=browser();b.boot();assert.equal(b.sandbox.window.systemelineReady,true);assert.equal(b.run('state.routes.length'),1);assert.equal(b.elements.get('routeSelect').value,'r1');assert.equal(typeof b.elements.get('routeAdd').onclick,'function');
 assert.equal(b.elements.get('routeAdd').onclick(),'r2');assert.equal(b.run('state.routes.length'),2);assert.equal(b.run('state.activeRouteId'),'r2');assert.equal(b.elements.get('routeSelect').options.length,2);
});
check('creation from empty startup builds two feeds and an NKU link and reloads',()=>{
 const b=browser();b.boot();b.run("addEquipment('TR');addEquipment('NKU');$('routeStartEquipment').value='e1';$('routeEndEquipment').value='e2';routeColumnControl('start','e1',null);routeColumnControl('end','e2','c1')");
 assert.equal(b.elements.get('routeBuild').onclick(),true,b.elements.get('routeStatus').textContent);
 assert.equal(b.elements.get('routeCopy').onclick(),'r2');b.run("$('routeKind').value='NKU_NKU'");assert.equal(b.elements.get('routeAdd').onclick(),'r3');
 assert.equal(b.run('boundRouteGap()'),null);assert.equal(b.run('specForScope().nkuBlocks'),4);assert.equal(b.run('specForScope().trBlocks'),2);
 const before=b.run('JSON.stringify(projectSnapshot())'),saved=b.storage.get('BUS_PROJECT_V6');assert.ok(saved);
 const reload=browser({storage:b.storage});reload.boot();assert.equal(reload.run('JSON.stringify(projectSnapshot())'),before);assert.equal(reload.run('state.routes.length'),3);assert.equal(reload.run('state.equipment.length'),4);
});
check('v5 saved project boots without moving geometry or changing its original key',()=>{
 const b=browser();b.boot();b.run("addEquipment('TR');addEquipment('NKU');$('routeStartEquipment').value='e1';$('routeEndEquipment').value='e2';routeColumnControl('start','e1',null);routeColumnControl('end','e2','c1');buildEquipmentRoute()");
 const old=JSON.parse(b.run('JSON.stringify(projectSnapshot())'));old.version=5;old.equipment.forEach(e=>delete e.columns);old.routes.forEach(r=>delete r.ports);const raw=JSON.stringify(old),storage=new Map([['BUS_PROJECT_V5',raw]]);
 const reload=browser({storage});reload.boot();assert.equal(reload.sandbox.window.systemelineReady,true);assert.deepEqual(JSON.parse(reload.run('JSON.stringify(state.routes.map(r=>r.segs))')),old.routes.map(r=>r.segs));assert.equal(storage.get('BUS_PROJECT_V5'),raw);assert.equal(reload.run('state.equipment[1].columns.length'),1);
});
check('old markup with a missing module has a visible recovery link and preserves storage',()=>{
 const storage=new Map([['BUS_PROJECT_V5','original-project']]),b=browser({storage,missingColumnsModule:true,oldMarkup:true});
 assert.throws(()=>b.boot(),/emptyPorts/);b.fail();const banner=b.elements.get('startupFailure');assert.equal(banner.hidden,false);assert.match(banner.textContent,/не запустился/);const url=new URL(banner.children.at(-1).href);assert.equal(url.origin,'http://127.0.0.1:8767');assert.equal(url.pathname,'/');assert.equal(url.searchParams.get('build'),build);assert.equal(url.searchParams.get('keep'),'1');assert.equal(storage.get('BUS_PROJECT_V5'),'original-project');assert.equal(storage.size,1);
});
console.log(`${count} startup checks passed`);

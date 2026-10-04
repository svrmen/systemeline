const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const calls = [];
const context2d = new Proxy({measureText: text => ({width:text.length*7}), setTransform:(...a)=>calls.push(a),fillRect:(...a)=>calls.push(['fill',context2d.fillStyle,...a])}, {get:(o,k)=>o[k]||(()=>{})});
const values = {mat:'CU',rating:'2000',ip:'IP65',startW:600,startD:600,startH:2200,endW:600,endD:600,endH:2200,startType:'NKU',endType:'ENDCAP',mountOn:'1',mountStep:1000,moduleLen:3000};
function element(id){return {value:values[id]||'',style:{},dataset:{},clientWidth:820,clientHeight:760,innerHTML:'',classList:{toggle(){},add(){},remove(){}},addEventListener(){},getContext:()=>context2d,appendChild(){},querySelector:()=>element(),getBoundingClientRect:()=>({left:0,top:0,width:820,height:760})};}
const elements = new Map();
const sandbox = {document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},querySelectorAll:()=>[],addEventListener(){},createElement:()=>element()},window:{devicePixelRatio:2,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},console,addEventListener(){},setTimeout:()=>{},URL,Blob,alert(){}};
vm.createContext(sandbox); new vm.Script(code).runInContext(sandbox);
const run = s=>vm.runInContext(s,sandbox);
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
check('catalogue Cu widths',()=>{assert.equal(run('WIDTH_CU[1000]'),100);assert.equal(run('WIDTH_CU[2000]'),200);assert.equal(run('WIDTH_CU[4000]'),470);assert.equal(run('BUS_H'),118);});
check('LF arms depend on conductor; LE arms 320',()=>{assert.equal(run("elbowCuts('+Z','+X').a"),320);run("$('mat').value='AL'");assert.equal(run("elbowCuts('+Z','+X').a"),330);assert.equal(run("elbowCuts('+X','+Y').a"),320);run("$('rating').value='4000'");assert.equal(run("elbowCuts('+Z','+X').b"),460);run("$('mat').value='CU'");assert.equal(run("elbowCuts('+Z','+X').b"),450);});
check('rectangular riser agrees with both elbow planes',()=>{run("state.segs=[{dir:'+Z',len:3420},{dir:'+X',len:3420}]");assert.equal(run('verticalProfile(0,470,118).w'),118);assert.equal(run('verticalProfile(0,470,118).d'),470);run("state.segs[1].dir='+Y'");assert.equal(run('verticalProfile(0,470,118).w'),470);assert.equal(run('verticalProfile(0,470,118).d'),118);run('box=(...args)=>globalThis.lastBox=args;segBox([0,0,2200],"+Z",3000,470,118,verticalProfile(0,470,118))');assert.equal(sandbox.lastBox[3],470);assert.equal(sandbox.lastBox[4],118);});
check('IP55/IP65 applies to every enclosure reference',()=>{for(const ip of ['55','65']){run(`$('ip').value='IP${ip}'`);for(const type of ['ST','EL','JPK','FE','FET','GETB','EC'])assert.ok(run(`refFor('${type}',4000)`).endsWith(ip));}assert.equal(run("refFor('HF',4000)"),'DDW508HF');assert.equal(run("refFor('EC',500)"),'DDW511ECM65');assert.equal(run("refFor('EC',6300)"),'DDW513ECM65');});
check('correct catalogue cap pricing key',()=>{run("PRICE.CU.EC['511']=73;PRICE.CU.HF['508']=81");assert.equal(run("priceOf('EC','CU',500)"),73);assert.equal(run("priceOf('HF','CU',4000)"),81);});
check('dimension labels separate and stay inside viewport',()=>{run('dimensionBoxes=[]');const a=run('dimensionPosition(0,{x:400,y:300},"L = 3420 мм")');const b=run('dimensionPosition(1,{x:400,y:300},"L = 3420 мм")');assert.ok(Math.abs(a.y-b.y)>=34);const edge=run('dimensionPosition(2,{x:9999,y:-999},"L = 3420 мм")');assert.ok(edge.x<820 && edge.y>=48);});
check('unsupported nominal and missing orientation section stay explicit',()=>{run("$('rating').value='1200';state.segs=[{dir:'+X',len:3420},{dir:'+Z',len:3420},{dir:'+Y',len:3420}];updateGeometryStatus()");assert.match(run("$('geometryStatus').textContent"),/1200/);assert.match(run("$('geometryStatus').textContent"),/изменения ориентации/);run("$('rating').value='4000';state.segs=[{dir:'+Z',len:100},{dir:'+X',len:100}];updateGeometryStatus()");assert.match(run("$('geometryStatus').textContent"),/недостаточно/);});
check('PNG/PDF overlay uses screen pixel density',()=>{run("state.segs=[];draw=()=>{};captureWithOverlay()");assert.ok(calls.some(a=>a.join(',')==='2,0,0,2,0,0'));});
check('export background stays white outside geometry',()=>assert.ok(calls.some(a=>a[0]==='fill'&&a[1]==='#fff')));
console.log(`${count} targeted checks passed`);


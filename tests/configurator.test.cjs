const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const calls = [];
const context2d = new Proxy({measureText: text => ({width:text.length*7}), setTransform:(...a)=>calls.push(a),moveTo:(...a)=>calls.push(['move',...a]),lineTo:(...a)=>calls.push(['line',...a]),fillRect:(...a)=>calls.push(['fill',context2d.fillStyle,...a])}, {get:(o,k)=>o[k]||(()=>{})});
const values = {mat:'CU',rating:'2000',ip:'IP65',startW:600,startD:600,startH:2200,endW:600,endD:600,endH:2200,startType:'NKU',endType:'ENDCAP',mountOn:'1',mountStep:1000,moduleLen:3000};
function element(id){return {value:values[id]||'',style:{},dataset:{},options:[],children:[],clientWidth:820,clientHeight:760,innerHTML:'',classList:{toggle(){},add(){},remove(){}},listeners:{},setAttribute(){},focus(){},setPointerCapture(){},addEventListener(name,fn){this.listeners[name]=fn;},getContext:()=>context2d,appendChild(child){this.children.push(child);if(id==='rating')this.options.push(child);},querySelector:()=>element(),getBoundingClientRect:()=>({left:0,top:0,width:820,height:760})};}
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
check('correct catalogue cap pricing key; legacy IP55 prices cannot quote IP65',()=>{run("PRICE.CU.EC['511']=73;PRICE.CU.HF['508']=81");assert.equal(run("priceOf('EC','CU',500)"),null);run("$('ip').value='IP55'");assert.equal(run("priceOf('EC','CU',500)"),73);assert.equal(run("priceOf('HF','CU',4000)"),81);});
check('dimension labels separate and stay inside viewport',()=>{run('dimensionBoxes=[]');const a=run('dimensionPosition(0,{x:400,y:300},"L = 3420 мм")');const b=run('dimensionPosition(1,{x:400,y:300},"L = 3420 мм")');assert.ok(Math.abs(a.y-b.y)>=34);const edge=run('dimensionPosition(2,{x:9999,y:-999},"L = 3420 мм")');assert.ok(edge.x<820 && edge.y>=48);});
check('unsupported nominal and missing orientation section stay explicit',()=>{run("$('rating').value='1200';state.segs=[{dir:'+X',len:3420},{dir:'+Z',len:3420},{dir:'+Y',len:3420}];updateGeometryStatus()");assert.match(run("$('geometryStatus').textContent"),/1200/);assert.match(run("$('geometryStatus').textContent"),/изменения ориентации/);run("$('rating').value='4000';state.segs=[{dir:'+Z',len:100},{dir:'+X',len:100}];updateGeometryStatus()");assert.match(run("$('geometryStatus').textContent"),/недостаточно/);});
check('PNG/PDF overlay uses screen pixel density',()=>{run("state.segs=[];draw=()=>{};captureWithOverlay()");assert.ok(calls.some(a=>a.join(',')==='2,0,0,2,0,0'));});
check('export background stays white outside geometry',()=>assert.ok(calls.some(a=>a[0]==='fill'&&a[1]==='#fff')));
check('edge orientation swaps cross-section, elbows and mounting references',()=>{
  run("$('orientation').value='EDGE';$('mat').value='CU';$('rating').value='4000'");
  assert.equal(run('P().busW'),118);assert.equal(run('P().busH'),470);
  assert.equal(run("elbowCuts('+Z','+X').a"),320);assert.equal(run("elbowCuts('+X','+Y').a"),450);
  run("PRICE.CU.HE['508']=99");
  const costs=run('computeCost({lenHoriz:0,lenUp:0,lenDown:0,vert:0,horiz:0,joints:{total:0},nkuBlocks:0,trBlocks:0,endCap:0,mounts:1})');
  assert.equal(costs.lines[0].ref,'DDW508HE');assert.equal(costs.lines[0].price,99);
  run("$('orientation').value='FLAT'");assert.equal(run('P().busW'),470);assert.equal(run('P().busH'),118);
});
check('popup stays readable and inside viewport near every edge',()=>{
  run('placeLengthPopup(epop,{x:99999,y:99999})');const el=elements.get('editPopup');
  assert.equal(parseFloat(el.style.left)+330,808);assert.equal(parseFloat(el.style.top)+150,660);
  run('placeLengthPopup(epop,{x:-99999,y:-99999})');assert.equal(el.style.left,'12px');assert.equal(el.style.top,'84px');
});
check('zoom and pan cannot lose the model; wheel does not scroll page',()=>{
  run("state.segs=[{dir:'+Z',len:3420},{dir:'+X',len:3420}];scale=1;panX=1e9;panY=-1e9;constrainView()");
  assert.ok(run('panX+scale*boundsProjected().minX<=wrap.clientWidth-80'));assert.ok(run('panY+scale*boundsProjected().maxY>=80'));
  for(let i=0;i<100;i++)run('zoomAt(400,300,100000)');const low=run('scale');
  for(let i=0;i<100;i++)run('zoomAt(400,300,-100000)');const high=run('scale');assert.ok(low>0&&high/low<=48.001);
  let prevented=false,stopped=false;
  elements.get('wrap').listeners.wheel({preventDefault(){prevented=true},stopPropagation(){stopped=true},target:{closest:()=>true}});
  assert.ok(prevented&&stopped);
});


check('annotation IDs repair duplicates and reject ghost positions',()=>{
 run("state.annos=[{id:1,text:'A',pos:{ISO:{ax:10,ay:20,bx:30,by:40}}},{id:1,text:'B',pos:{TOP:{ax:0,ay:0,bx:0,by:0}}}];ensureAnnoNumbers()");
 assert.notEqual(run('state.annos[0].id'),run('state.annos[1].id'));assert.ok(run('annoId>state.annos[1].id'));assert.equal(run("annotationLayout(state.annos[1],'TOP')"),null);
});
check('callout text stays inside viewport and does not appear in other views',()=>{
 run("scale=1;panX=0;panY=0;state.annos=[{id:1,text:'Test',pos:{ISO:{ax:100,ay:200,bx:-900,by:9999}}}]");
 const p=run("annotationLayout(state.annos[0],'ISO')");assert.ok(p.x-p.w/2>=12);assert.ok(p.y+p.h/2<=660);assert.equal(run("annotationLayout(state.annos[0],'TOP')"),null);
});
check('unknown prices cannot produce a zero quotation',()=>{
 run("$('ip').value='IP65'");const result=run('computeCost({lenHoriz:3500,lenUp:0,lenDown:0,vert:0,horiz:0,joints:{total:0},nkuBlocks:0,trBlocks:0,endCap:0,mounts:0})');assert.equal(result.total,null);assert.ok(result.missingPrices>0);
});
check('project text is escaped in printable HTML',()=>assert.equal(run(`escapeHtml('<img src=x>"&')`),'&lt;img src=x&gt;&quot;&amp;'));

console.log(`${count} targeted checks passed`);
check('equal spans use identical physical parts in either direction',()=>{
 run("$('mat').value='CU';$('rating').value='4000';$('orientation').value='EDGE';state.module=3000;state.segs=[{dir:'+Z',len:1500},{dir:'+X',len:3500},{dir:'+Y',len:3500},{dir:'-Z',len:1000}]");
 const a=run('straightLayout(1)'),b=run('straightLayout(2)');assert.equal(a.length,b.length);assert.deepEqual(Array.from(a.parts),Array.from(b.parts));assert.equal(a.joints.length,0);assert.equal(b.joints.length,0);
 const sp=run('computeSpec()');assert.equal([...sp.parts].reduce((n,[len,qty])=>n+len*qty,0),sp.straightLen);assert.equal(sp.joints.mod,0);
});
check('drawn module joints exactly match specification and ignore axis sign',()=>{
 run("state.segs=[{dir:'+X',len:6500},{dir:'+Y',len:6500}];state.module=3000");
 assert.deepEqual(Array.from(run('straightLayout(0).joints')),[3000,6000]);
 assert.equal(run('computeSpec().joints.mod'),4);
 run("state.segs=[{dir:'-X',len:6500},{dir:'-Y',len:6500}]");assert.deepEqual(Array.from(run('straightLayout(0).joints')),[3000,6000]);
});
check('exact module and impossible short spans never create phantom joints',()=>{
 run("state.segs=[{dir:'+X',len:3000}]");assert.equal(run('straightLayout(0).joints.length'),0);
 run("state.segs=[{dir:'+Z',len:100},{dir:'+X',len:100}]");assert.equal(run('straightLayout(0).length'),0);assert.equal(run('straightLayout(1).parts.length'),0);
});
console.log(`${count} targeted checks passed`);
check('all drawn connections match BOM including corners and equipment',()=>{
 run("$('startType').value='TR';$('endType').value='NKU';state.segs=[{dir:'+Z',len:1500},{dir:'+X',len:3500},{dir:'+Y',len:3500},{dir:'-Z',len:1000}]");
 assert.equal(run('connectionLayout().length'),8);assert.equal(run('computeSpec().joints.total'),8);assert.equal(run("connectionLayout().filter(j=>j.kind==='corner').length"),6);
 run('state.segs=[]');assert.equal(run('computeSpec().joints.total'),0);
});
check('catalogue rating and orientation matrix preserves layout invariants',()=>{
 for(const mat of ['AL','CU'])for(const orientation of ['FLAT','EDGE'])for(const rating of [400,500,630,800,1000,1250,1600,2000,2500,3200,4000,5000,6300])for(const sign of ['+','-']){
 run(`$('mat').value='${mat}';$('orientation').value='${orientation}';$('rating').value='${rating}';state.module=3000;state.segs=[{dir:'${sign}Z',len:1500},{dir:'${sign}X',len:6500},{dir:'${sign}Y',len:6500}]`);
 const sp=run('computeSpec()');assert.equal(sp.joints.total,run('connectionLayout().length'));
 assert.equal([...sp.parts].reduce((sum,[length,qty])=>sum+length*qty,0),sp.straightLen);
 for(let i=0;i<3;i++){const layout=run(`straightLayout(${i})`);assert.ok(layout.parts.every(n=>n>0&&n<=3000));assert.ok(layout.joints.every(n=>n>0&&n<layout.length));}
 }
});
console.log(`${count} targeted checks passed`);

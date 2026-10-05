const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const exporter = fs.readFileSync('cad-export.js', 'utf8')+'\n'+fs.readFileSync('tariff-import.js','utf8');
const code = exporter + '\n' + html.match(/<script>([\s\S]*?)<\/script>/)[1];
const calls = [];
const context2d = new Proxy({measureText: text => ({width:text.length*7}), setTransform:(...a)=>calls.push(a),moveTo:(...a)=>calls.push(['move',...a]),lineTo:(...a)=>calls.push(['line',...a]),fillRect:(...a)=>calls.push(['fill',context2d.fillStyle,...a])}, {get:(o,k)=>o[k]||(()=>{})});
const values = {mat:'CU',rating:'2000',ip:'IP65',startW:600,startD:600,startH:2200,endW:600,endD:600,endH:2200,startType:'NKU',endType:'ENDCAP',mountOn:'1',mountStep:1000,moduleLen:3000};
function element(id){return {value:values[id]||'',style:{},dataset:{},options:[],children:[],clientWidth:820,clientHeight:760,innerHTML:'',classList:{toggle(){},add(){},remove(){}},listeners:{},setAttribute(){},focus(){},setPointerCapture(){},addEventListener(name,fn){this.listeners[name]=fn;},getContext:()=>context2d,appendChild(child){this.children.push(child);if(id==='rating')this.options.push(child);},querySelector:()=>element(),getBoundingClientRect:()=>({left:0,top:0,width:820,height:760})};}
const elements = new Map();
const sandbox = {document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},querySelectorAll:()=>[],addEventListener(){},createElement:()=>element()},window:{devicePixelRatio:2,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},console,addEventListener(){},setTimeout:()=>{},URL,Blob,alert(){}};
vm.createContext(sandbox); new vm.Script(code).runInContext(sandbox);
const run = s=>vm.runInContext(s,sandbox);
run('globalThis.originalDraw=draw;globalThis.originalBox=box');
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

check('equal spans use identical physical parts in either direction',()=>{
 run("$('mat').value='CU';$('rating').value='4000';$('orientation').value='EDGE';state.module=3000;state.segs=[{dir:'+Z',len:1500},{dir:'+X',len:3500},{dir:'+Y',len:3500},{dir:'-Z',len:1000}]");
 const a=run('straightLayout(1)'),b=run('straightLayout(2)');assert.equal(a.length,b.length);assert.deepEqual(Array.from(a.parts),Array.from(b.parts));assert.equal(a.joints.length,0);assert.equal(b.joints.length,0);
 const sp=run('computeSpec()');assert.equal([...sp.parts].reduce((n,[len,qty])=>n+len*qty,0),sp.straightLen);assert.equal(sp.joints.mod,0);
});
check('drawn module joints exactly match specification and ignore axis sign',()=>{
 run("state.segs=[{dir:'+X',len:6500},{dir:'+Y',len:6500}];state.module=3000");
 assert.equal(run('straightLayout(0).length'),6050);
 assert.deepEqual(Array.from(run('straightLayout(0).parts')),[3000,2600,450]);
 assert.deepEqual(Array.from(run('straightLayout(0).joints')),[3000,5600]);
 assert.equal(run('computeSpec().joints.mod'),4);
 run("state.segs=[{dir:'-X',len:6500},{dir:'-Y',len:6500}]");assert.deepEqual(Array.from(run('straightLayout(0).joints')),[3000,5600]);
});
check('exact module and impossible short spans never create phantom joints',()=>{
 run("state.segs=[{dir:'+X',len:3000}]");assert.equal(run('straightLayout(0).joints.length'),0);
 run("state.segs=[{dir:'+Z',len:100},{dir:'+X',len:100}]");assert.equal(run('straightLayout(0).length'),0);assert.equal(run('straightLayout(1).parts.length'),0);
});
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

check('CAD export produces component blocks, editable dimensions and view callouts',()=>{
 run("draw=originalDraw;box=originalBox;state.segs=[{dir:'+Z',len:1500},{dir:'+X',len:3500},{dir:'+Y',len:3500},{dir:'-Z',len:1000}];state.calc=true;state.module=3000;$('mat').value='CU';$('rating').value='4000';$('orientation').value='EDGE';viewMode='ISO';state.annos=[{id:1,num:1,text:'Подключение',pos:{ISO:{ax:10,ay:20,bx:100,by:200}}}]");
 const model=run('collectCadDrawing()');assert.ok(model.lines.length>0);assert.ok(model.lines.every(e=>e.layer!=='FLOOR'));assert.equal(model.dimensions.length,4);assert.equal(model.annotations.length,1);
 const output=run('buildCadDXF(collectCadDrawing())');assert.match(output,/\nBLOCKS\n/);assert.match(output,/\nINSERT\n/);assert.match(output,/\nATTRIB\n/);assert.match(output,/\nDIMENSION\n/);assert.match(output,/LENGTH_MM/);assert.match(output,/\\U\+041F/);
 fs.writeFileSync('evidence/cad-test.dxf',output);
});
check('CAD coordinates and attributes do not depend on zoom, pan',()=>{
 const before=run('buildCadDXF(collectCadDrawing())');run("scale*=2;panX+=123;panY-=87");const after=run('buildCadDXF(collectCadDrawing())');assert.equal(after,before);
});

if(process.env.SYSTEMELINE_TARIFF_XLSX)check('supplied Excel imports exact references, units and dated source',()=>{
 sandbox.XLSX=require('../vendor/xlsx.full.min.js');sandbox.tariffWorkbook=sandbox.XLSX.read(fs.readFileSync(process.env.SYSTEMELINE_TARIFF_XLSX),{type:'buffer',sheets:['Тариф SE LINE 25.01.2026']});
 run("globalThis.newTariff=parseTariffWorkbook(tariffWorkbook,'БО_SE-LINE_xxxx2026_.xlsx',XLSX)");
 assert.equal(run('newTariff.source.sheet'),'Тариф SE LINE 25.01.2026');assert.equal(run('newTariff.source.date'),'25.01.2026');assert.equal(run('Object.keys(newTariff.entries).length'),2608);assert.equal(run('newTariff.source.duplicates'),16);
 assert.equal(run("newTariff.entries.DDW508ECM65.price"),11950);assert.equal(run("newTariff.entries.DDW508HF.unit"),'piece');
 run("PRICE=validateReferenceTariff(newTariff);$('ip').value='IP65';$('rating').value='4000';$('mat').value='CU'");assert.equal(run("priceOf('EC','CU',4000)"),11950);
 run("$('ip').value='IP55'");assert.equal(run("priceOf('EC','CU',4000)"),11400);
});
check('Excel conflicts and incorrect quantity bases never silently quote',()=>{
 const x=require('../vendor/xlsx.full.min.js');sandbox.XLSX=x;const book=x.utils.book_new();x.utils.book_append_sheet(book,x.utils.aoa_to_sheet([['Референс','Тариф без НДС','Единица измерения'],['DDW4504GM55',100,'за метр'],['DDW4504GM55',200,'за метр']]),'Тариф');sandbox.badTariff=book;
 assert.throws(()=>run("parseTariffWorkbook(badTariff,'bad.xlsx',XLSX)"),/Разные цены/);
 run("PRICE={version:5,entries:{DDW4540GM55:{price:100,unit:'piece'}}};$('rating').value='4000';$('ip').value='IP55'");assert.equal(run("priceOf('ST','CU',4000)"),null);
});
check('short remainder redistributes without changing length or inventing viable cuts',()=>{
 run("state.module=3000;state.segs=[{dir:'+X',len:3100}]");
 assert.deepEqual(Array.from(run('straightLayout(0).parts')),[2650,450]);
 assert.deepEqual(Array.from(run('straightLayout(0).joints')),[2650]);
 run("state.segs=[{dir:'-X',len:6100}]");
 assert.deepEqual(Array.from(run('straightLayout(0).parts')),[3000,2650,450]);
 run("state.module=600;state.segs=[{dir:'+X',len:1250}]");
 assert.deepEqual(Array.from(run('straightLayout(0).parts')),[600,600,50]);
 run("state.module=3000;state.segs=[{dir:'+X',len:3105}]");
 assert.deepEqual(Array.from(run('straightLayout(0).parts')),[3000,105]);
 run("state.segs=[{dir:'+X',len:400}]");assert.deepEqual(Array.from(run('straightLayout(0).parts')),[400]);
});
check('mounting follows physical parts, orientation limits and explicit short-part exclusions',()=>{
 let p=run("horizontalMountPlan([3000,2650,450],5000,'FLAT')");
 assert.equal(p.step,2000);assert.deepEqual(Array.from(p.unsupported),[3]);
 assert.deepEqual(Array.from(p.positions),[300,1500,2700,3300,4325,5350]);
 p=run("horizontalMountPlan([3000,2650,450],5000,'EDGE')");
 assert.equal(p.step,3000);assert.deepEqual(Array.from(p.positions),[1500,4325,5875]);
 assert.deepEqual(Array.from(p.unsupported),[]);
 p=run("horizontalMountPlan([600],1000,'FLAT')");assert.deepEqual(Array.from(p.positions),[300]);
 assert.equal(run("horizontalMountPlan([3000],-1,'FLAT').step"),2000);
 run("state.segs=[{dir:'+X',len:6100}];state.module=3000;$('orientation').value='EDGE';$('mountStep').value=5000;$('mountOn').value='1'");
 assert.equal(run('computeSpec().mounts'),3);assert.equal(run('computeSpec().mountStep'),3000);
 run("$('mountOn').value='0'");assert.equal(run('computeSpec().mounts'),0);
});
check('PER references follow individual tables and cannot reuse body-PE tariffs',()=>{
 run("$('conductors').value='7';$('mat').value='CU';$('ip').value='IP55'");
 assert.equal(run("refFor('ST',3200)"),'DDW4732GM55');
 assert.equal(run("refFor('FE',3200)"),'DDW4632GFEM55');
 assert.equal(run("refFor('FET',3200)"),'DDW4732GFETM55');
 for(const mat of ['AL','CU'])for(const ip of ['55','65']){
 run(`$('mat').value='${mat}';$('ip').value='IP${ip}'`);
 assert.equal(run("refFor('JPK',4000)"),`${mat==='AL'?'BDW':'DDW'}4740GJPKM${ip}`);
 }
 run("$('mat').value='CU';$('ip').value='IP55';PRICE={CU:{ST:{3200:100}}}");assert.equal(run("priceOf('ST','CU',3200)"),null);
 run("PRICE={version:5,entries:{DDW4532GM55:{price:100,unit:'m'},DDW4732GM55:{price:130,unit:'m'}}}");assert.equal(run("priceOf('ST','CU',3200)"),130);
 run("$('conductors').value='5'");assert.equal(run("priceOf('ST','CU',3200)"),100);
});
check('currency keeps kopecks and never renders invalid values as zero',()=>{
 assert.match(run('money(123.45)'),/123,45/);assert.equal(run('money(NaN)'),'—');assert.equal(run('money(null)'),'—');
 run("$('conductors').value='5';$('mat').value='CU';$('rating').value=3200;$('ip').value='IP55';$('mountOn').value='0';$('startType').value='NKU';$('endType').value='ENDCAP';state.segs=[{dir:'+X',len:1010}];state.module=3000;PRICE={version:5,entries:{DDW4532GM55:{price:123.45,unit:'m'},DDW4532GFEM55:{price:10,unit:'piece'},DDW4532GJPKM55:{price:10,unit:'piece'},DDW507ECM55:{price:10,unit:'piece'}}}");
 assert.equal(run('computeCost(computeSpec()).lines[0].sum'),124.68);
 assert.equal(run('computeCost(computeSpec()).total'),154.68);
 run('delete PRICE.entries.DDW4532GFEM55');assert.equal(run('computeCost(computeSpec()).total'),null);
});
if(process.env.SYSTEMELINE_TARIFF_XLSX)check('real tariff matrix verifies PE/PER, IP, quantities and independent line totals',()=>{
 const report=[];const original=run('newTariff');
 for(const mat of ['AL','CU'])for(const conductors of ['5','7'])for(const ip of ['55','65'])for(const orientation of ['FLAT','EDGE'])for(const rating of mat==='CU'?[400,500,630,800,1000,1250,1600,2000,2500,3200,4000,5000,6300]:[400,500,630,800,1000,1250,1600,2000,2500,3200,4000,5000]){
 run(`PRICE=validateReferenceTariff(newTariff);$('mat').value='${mat}';$('conductors').value='${conductors}';$('ip').value='IP${ip}';$('orientation').value='${orientation}';$('rating').value=${rating};$('mountOn').value='1';$('mountStep').value=1000;$('startType').value='TR';$('endType').value='NKU';state.segs=[{dir:'+Z',len:1500},{dir:'+X',len:6500},{dir:'+Y',len:6500},{dir:'-Z',len:1000}];state.module=3000`);
 const cost=run('computeCost(computeSpec())');let cents=0,missing=0;
 for(const line of cost.lines){const e=original.entries[line.ref];const unit=line.title.startsWith('Прямые')?'m':'piece';const expected=e&&e.unit===unit?e.price:null;assert.equal(line.price,expected);if(expected==null){missing++;assert.equal(line.sum,null);}else{const sum=Math.round(parseFloat(line.qty)*expected*100)/100;assert.equal(line.sum,sum);cents+=Math.round(sum*100);}}
 assert.equal(cost.total,missing?null:cents/100);assert.equal(cost.missingPrices,missing);
 report.push({mat,conductors,ip,orientation,rating,missing,total:cost.total,missingRefs:cost.lines.filter(l=>l.price==null).map(l=>l.ref)});
 }
 assert.equal(report.length,200);fs.writeFileSync('evidence/tariff-matrix.json',JSON.stringify(report,null,2));
 console.log('REAL TARIFF: '+report.filter(r=>r.missing===0).length+'/200 complete-price scenarios; unknown references remain explicit');
});
check('true XLSX exports numeric quantities, cached formulas and explicit unknown totals',()=>{
 sandbox.XLSX=require('../vendor/xlsx.full.min.js');
 run("$('conductors').value='5';$('mat').value='CU';$('rating').value=3200;$('ip').value='IP55';$('mountOn').value='0';$('startType').value='NKU';$('endType').value='ENDCAP';state.segs=[{dir:'+X',len:1010}];state.module=3000;PRICE={version:5,entries:{DDW4532GM55:{price:123.45,unit:'m'},DDW4532GFEM55:{price:10,unit:'piece'},DDW4532GJPKM55:{price:10,unit:'piece'},DDW507ECM55:{price:10,unit:'piece'}}}");
 let book=run('buildProjectWorkbook()');assert.deepEqual(Array.from(book.SheetNames),['Проект','Калькуляция','Раскрой','Проверки']);
 assert.equal(book.Sheets['Калькуляция'].D2.v,1.01);assert.equal(book.Sheets['Калькуляция'].G2.f,'ROUND(D2*F2,2)');assert.equal(book.Sheets['Калькуляция'].G2.v,124.68);
 fs.writeFileSync('evidence/export-acceptance.xlsx',sandbox.XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
 run('delete PRICE.entries.DDW4532GFEM55');book=run('buildProjectWorkbook()');
 assert.equal(book.Sheets['Калькуляция'].G4,undefined);assert.match(book.Sheets['Калькуляция'].G6.v,/Не определено/);
});
check('export wraps callout text and print pages explicitly preserve axis sizes and unknown prices',()=>{
 const lines=run("wrapCanvasText({measureText:t=>({width:t.length*7})},'A1. длинныйтекст\\nвтораястрока',42)");
 assert.ok(Array.from(lines).every(s=>s.length<=6));assert.equal(Array.from(lines).join(''),'A1. длинныйтекствтораястрока');
 assert.match(html,/max-height:220mm/);assert.match(html,/\.toolbar\{display:none\}/);
 assert.match(html,/Не определено: есть позиции без цены/);assert.match(html,/ось =/);
});
function withProjectStorage(fn){
 const previous=sandbox.localStorage,stored=new Map();
 sandbox.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
 try{fn(stored);}finally{sandbox.localStorage=previous;run('projectStorageBlocked=false;recoveryProjectRaw=null');}
}
check('changing maximum section length immediately updates cuts, BOM and saved limit',()=>withProjectStorage(stored=>{
 run("$('mat').value='CU';$('rating').value='3200';$('conductors').value='5';$('orientation').value='FLAT';$('ip').value='IP55';state.segs=[{dir:'+X',len:6500}];state.calc=true;state.module=3000;$('moduleLen').value=1000");
 elements.get('moduleLen').listeners.input();
 assert.equal(run('state.module'),1000);assert.equal(run('computeSpec().module'),1000);assert.equal(run("$('spModule').textContent"),'1000 мм');
 assert.ok(Array.from(run('straightLayout(0).parts')).every(n=>n<=1000));
 const saved=JSON.parse(stored.get('BUS_STATE_V3'));assert.equal(saved.module,1000);assert.equal(saved.ui.moduleLen,1000);
 const raw=stored.get('BUS_STATE_V3');
 for(const value of ['',0,-1,Infinity,3100,1001]){elements.get('moduleLen').value=value;elements.get('moduleLen').listeners.input();assert.equal(run('state.module'),1000);assert.equal(stored.get('BUS_STATE_V3'),raw);assert.match(run("$('moduleHint').textContent"),/400.*3000/);}
 run("$('moduleLen').value=1250");elements.get('moduleLen').listeners.input();assert.equal(run('state.module'),1250);assert.equal(run("$('moduleHint').textContent"),'');
}));
check('invalid or stale segment edits explain the error and preserve geometry',()=>withProjectStorage(()=>{
 run("state.segs=[{dir:'+X',len:6500}];openEdit(0)");
 for(const value of ['',100,450.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]){elements.get('editInput').value=value;run('applyEdit()');assert.equal(run('state.segs[0].len'),6500);assert.ok(run("$('editHint').textContent.length")>0);}
 run("state.editingIdx=99;$('editInput').value=4000;applyEdit()");assert.equal(run('state.segs[0].len'),6500);assert.match(run("$('editHint').textContent"),/удалён/);
 run("openEdit(0);$('editInput').value=4000;applyEdit()");assert.equal(run('state.segs[0].len'),4000);assert.equal(run("$('spTotalLen').textContent"),'4000 мм');
}));
check('adding a segment after calculation updates the displayed specification',()=>withProjectStorage(()=>{
 run("state.lastDir='+X';$('lenInput').value='Infinity';commitLength()");assert.equal(run('state.segs[0].len'),4000);
 run("$('lenInput').value=500;commitLength()");assert.equal(run('state.segs[0].len'),4500);assert.equal(run("$('spTotalLen').textContent"),'4500 мм');
 run("state.lastDir='+Y';$('lenInput').value=2000;commitLength()");assert.equal(run('state.segs.length'),2);assert.equal(run("$('spTotalLen').textContent"),'6500 мм');
}));
check('old fractional lengths preserve coordinates and totals without integer truncation',()=>{
 run("state.segs=[{dir:'+X',len:1010.5}]");assert.equal(run('endPoint()[0]-originTop()[0]'),1010.5);assert.equal(run('computeSpec().totalLen'),1010.5);assert.equal(run('straightLayout(0).length'),1010.5);
});
check('saved project round trip keeps conductor/IP, dimensions, metadata and independent callout points',()=>withProjectStorage(stored=>{
 run("$('mat').value='CU';$('rating').value='4000';$('conductors').value='7';$('orientation').value='EDGE';$('ip').value='IP65';$('moduleLen').value=1500;syncModule();state.segs=[{dir:'+Z',len:1500},{dir:'+X',len:6500}];state.calc=true;state.dimOffsets.ISO={'0':{dx:42,dy:-15}};state.annos=[{id:4,text:'Выводы ТР',pos:{ISO:{ax:17,ay:23,bx:-500,by:900},TOP:{ax:10,ay:20,bx:500,by:700}}}];state.meta.title='Проект проверки';saveState()");
 const original=JSON.parse(stored.get('BUS_STATE_V3'));
 run("state.segs=[];state.annos=[];$('conductors').value='5';$('ip').value='IP55';loadState()");
 assert.equal(run("$('conductors').value"),'7');assert.equal(run("$('ip').value"),'IP65');assert.equal(run("$('rating').value"),4000);assert.equal(run('state.module'),1500);
 assert.equal(run('state.meta.title'),'Проект проверки');assert.equal(run('state.annos[0].pos.ISO.ax'),17);assert.equal(run('state.annos[0].pos.ISO.bx'),-500);assert.equal(run('state.dimOffsets.ISO[0].dx'),42);
 run('saveState()');assert.deepEqual(JSON.parse(stored.get('BUS_STATE_V3')),original);
 // Migration from the former stale-module bug follows the saved visible field.
 original.module=3000;stored.set('BUS_STATE_V3',JSON.stringify(original));run('loadState()');assert.equal(run('state.module'),1500);
 // Older projects without new conductor/orientation/metadata fields still load.
 stored.set('BUS_STATE_V3',JSON.stringify({segs:[{dir:'+X',len:3000}],calc:true,module:3000}));run('loadState()');assert.equal(run("$('conductors').value"),'5');assert.equal(run('state.segs[0].len'),3000);
}));
check('corrupt project fails atomically and cannot be overwritten by subsequent autosave',()=>withProjectStorage(stored=>{
 const baseline=JSON.parse(run('JSON.stringify(projectSnapshot())'));
 const cases=[{...baseline,meta:'broken'},{...baseline,module:-1},{...baseline,dimOffsets:{ISO:{0:{dx:'bad',dy:0}}}},{...baseline,annos:[{text:'Bad',pos:{ISO:{ax:null,ay:0,bx:1,by:2}}}]},{...baseline,ui:{...baseline.ui,ip:'IP54'}},{...baseline,ui:{...baseline.ui,mat:'AL',rating:6300}},{...baseline,ui:{...baseline.ui,startW:0}}];
 for(const bad of cases){const before=run('JSON.stringify(projectSnapshot())'),raw=JSON.stringify({...bad,segs:[{dir:'+Y',len:9999}]});stored.set('BUS_STATE_V3',raw);run('loadState()');assert.equal(run('JSON.stringify(projectSnapshot())'),before);assert.equal(run('saveState()'),false);assert.equal(stored.get('BUS_STATE_V3'),raw);assert.match(run("$('storageStatus').textContent"),/защищены/);}
 const raw=stored.get('BUS_STATE_V3');run("$('clear').onclick()");assert.equal(JSON.parse(stored.get('BUS_STATE_V3')).segs.length,0);assert.ok([...stored.entries()].some(([key,value])=>key.startsWith('BUS_STATE_V3.recovery.')&&value===raw));assert.equal(run('computeSpec().endCap'),0);
}));
check('storage write failure never reports a successful save or deletes recovery data',()=>withProjectStorage(stored=>{
 sandbox.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
 assert.equal(run('saveState()'),false);assert.match(run("$('storageStatus').textContent"),/QuotaExceededError/);
 run("$('metaSave').onclick()");assert.match(run("$('msg').textContent"),/не сохранены/);
 stored.set('BUS_STATE_V3','invalid-json');run('loadState()');assert.equal(run('releaseRecoveryStorage()'),false);assert.equal(stored.get('BUS_STATE_V3'),'invalid-json');assert.equal(run('projectStorageBlocked'),true);
}));
check('invalid equipment dimensions retain last valid geometry and prevent a corrupt saved project',()=>withProjectStorage(stored=>{
 run("$('startW').value=2000;P();saveState()");const previous=stored.get('BUS_STATE_V3');
 for(const value of ['',-100,Infinity]){elements.get('startW').value=value;assert.equal(run('P().startW'),2000);assert.equal(run('saveState()'),false);assert.equal(stored.get('BUS_STATE_V3'),previous);}
 run("$('startW').value=600;P()");assert.equal(run('P().startW'),600);
}));
check('unavailable material rating is announced and notice clears after an explicit choice',()=>withProjectStorage(()=>{
 run("$('mat').value='CU';$('rating').value='6300';$('mat').value='AL';fillRatings()");assert.equal(Number(run("$('rating').value")),400);assert.match(run("$('msg').textContent"),/6300.*400/);
 run("$('rating').value='3200'");elements.get('rating').listeners.change();assert.equal(run("$('msg').textContent"),'');
}));
check('unreadable storage cannot be reset without protecting its original content',()=>withProjectStorage(()=>{
 const before=run('JSON.stringify(projectSnapshot())');sandbox.localStorage.getItem=()=>{throw new Error('SecurityError');};run('loadState()');assert.equal(run('releaseRecoveryStorage()'),false);run("$('clear').onclick()");assert.equal(run('JSON.stringify(projectSnapshot())'),before);assert.equal(run('projectStorageBlocked'),true);
}));
console.log(`${count} targeted checks passed`);

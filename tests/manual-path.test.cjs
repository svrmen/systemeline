const assert=require('node:assert/strict');
const {browser}=require('./startup.test.cjs');
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
const json=(b,source)=>JSON.parse(b.run('JSON.stringify('+source+')'));
function manualFixture(){
 const b=browser();b.boot();
 b.run("$('startType').value='TR';$('startW').value=2000;$('startD').value=1400;$('startH').value=1700;$('endType').value='NKU';$('rating').value=1000;addEquipment('TR');addEquipment('NKU')");
 for(const [dir,length]of [['+Z',1500],['+X',10000],['+Y',2500],['-Z',1000]])b.run(`state.lastDir='${dir}';$('lenInput').value=${length};commitLength()`);
 b.run("state.annos=[{id:1,text:'Моя трасса',pos:{ISO:{ax:40,ay:50,bx:100,by:150},TOP:{ax:5,ay:6,bx:7,by:8}}}];state.dimOffsets.TOP={1:{dx:30,dy:50}};saveState();$('routeStartEquipment').value='e1';$('routeEndEquipment').value='e2';routeColumnControl('start','e1',null);routeColumnControl('end','e2','c1')");
 return b;
}
check('primary connection preserves all 15 m segments, world coordinates and annotations',()=>{
 const b=manualFixture(),segments=json(b,'state.segs'),ends=json(b,'[originTop(),endPoint()]'),annos=json(b,'validateProjectSnapshot(projectSnapshot()).annos'),dims=json(b,'state.dimOffsets');
 assert.equal(b.elements.get('routeBuild').textContent,'Подключить мой путь');
 assert.equal(b.elements.get('routeBuild').onclick(),true,b.elements.get('routeStatus').textContent);
 assert.deepEqual(json(b,'state.segs'),segments);assert.deepEqual(json(b,'[originTop(),endPoint()]'),ends);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot()).annos'),annos);assert.deepEqual(json(b,'state.dimOffsets'),dims);
 assert.equal(b.run('computeSpec().totalLen'),15000);assert.equal(b.run('state.routeRouting.mode'),'manual');assert.equal(b.run('boundRouteGap()'),null);
 assert.deepEqual(json(b,'equipmentTerminal(equipmentById("e2"),"c1")'),ends[1]);
 const reload=browser({storage:b.storage});reload.boot();assert.deepEqual(json(reload,'state.segs'),segments);assert.deepEqual(json(reload,'[originTop(),endPoint()]'),ends);
});
check('automatic replacement requires a current preview and is reversible after reload',()=>{
 const b=manualFixture(),before=json(b,'validateProjectSnapshot(projectSnapshot())');
 assert.equal(b.elements.get('routeAutoApply').onclick(),false);
 assert.equal(b.elements.get('routeAuto').onclick(),true);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);assert.match(b.elements.get('routeAutoSummary').textContent,/15000 мм.*9200 мм/);
 assert.equal(b.elements.get('routeAutoApply').onclick(),true);assert.notDeepEqual(json(b,'state.segs'),before.routes[0].segs);
 const reload=browser({storage:b.storage});reload.boot();assert.equal(reload.elements.get('routeBuildUndo').disabled,false);assert.equal(reload.elements.get('routeBuildUndo').onclick(),true);assert.deepEqual(json(reload,'validateProjectSnapshot(projectSnapshot())'),before);
});
check('stale preview and undo cannot overwrite later geometry or tariff parameters',()=>{
 const b=manualFixture();assert.equal(b.elements.get('routeAuto').onclick(),true);b.run("$('routeLevel').value=4200");assert.equal(b.elements.get('routeAutoApply').onclick(),false);assert.equal(b.run('computeSpec().totalLen'),15000);
 assert.equal(b.elements.get('routeAuto').onclick(),true);assert.equal(b.elements.get('routeAutoApply').onclick(),true);b.run("$('ip').value='IP65';saveState()");const after=json(b,'validateProjectSnapshot(projectSnapshot())');assert.equal(b.elements.get('routeBuildUndo').disabled,true);assert.equal(b.run('undoEquipmentAction()'),false);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),after);
});
check('moving equipment to a manual path never changes other connected routes',()=>{
 const b=manualFixture();assert.equal(b.elements.get('routeBuild').onclick(),true);b.run("addRoute('NKU_NKU');state.segs=[{dir:'+X',len:8000}];state.routeRouting.mode='manual';$('routeStartEquipment').value='e2';$('routeEndEquipment').value='e1'");
 // Select another NKU as the target, with the first NKU shared by r1.
 b.run("addEquipment('NKU');$('routeStartEquipment').value='e2';$('routeEndEquipment').value='e3';routeColumnControl('start','e2','c1');routeColumnControl('end','e3','c1')");
 const before=json(b,'validateProjectSnapshot(projectSnapshot())');assert.equal(b.elements.get('routeBuild').onclick(),false);assert.match(b.elements.get('routeStatus').textContent,/уже подключён/);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);
});
check('connection to the fifth NKU column preserves an unbound manual origin',()=>{
 const b=manualFixture();b.run("addEquipment('NKU');updateEquipment('e3',{size:{w:3400,d:600,h:2200},columns:[600,800,400,1000,600].map((width,i)=>({id:'c'+(i+1),name:'Колонна '+(i+1),width}))});$('routeStartEquipment').value='e3';$('routeEndEquipment').value='e2';routeColumnControl('start','e3','c5');routeColumnControl('end','e2','c1')");
 const ends=json(b,'[originTop(),endPoint()]');assert.equal(b.elements.get('routeBuild').onclick(),true);assert.equal(b.run('state.routePorts.start'),'c5');assert.deepEqual(json(b,'[originTop(),endPoint()]'),ends);assert.equal(b.run('boundRouteGap()'),null);
});
function sharedFixture(){
 const b=manualFixture();b.elements.get('routeBuild').onclick();b.run("addRoute('TR_NKU');$('routeStartEquipment').value='e2';$('routeEndEquipment').value='e1';addEquipment('NKU');$('routeStartEquipment').value='e2';$('routeEndEquipment').value='e3';routeColumnControl('start','e2','c1');routeColumnControl('end','e3','c1');$('routePath').value='DIRECT';buildEquipmentRoute();switchRoute('r1')");return b;
}
check('deleting shared NKU preserves every path, clears both ends and removes phantom cabinets',()=>{
 const b=sharedFixture(),paths=json(b,'routeEntries().map(r=>({segs:r.segs,ends:routeWorldEnds(r)}))');b.run("state.equipmentEditMode=true;state.selectedEquipmentId='e2'");assert.equal(b.elements.get('equipmentRemove').onclick(),true);
 assert.equal(b.run('Boolean(equipmentById("e2"))'),false);assert.deepEqual(json(b,'routeEntries().map(r=>({segs:r.segs,ends:routeWorldEnds(r)}))'),paths);assert.equal(b.run('state.routes[0].ui.endType'),'NONE');assert.equal(b.run('state.routes[1].ui.startType'),'NONE');assert.equal(b.run('state.routes.every(r=>r.routing.mode==="manual")'),true);
 const model=b.run('collectCadDrawing()');assert.equal(model.lines.some(e=>e.meta.equipmentId==='e2'),false);assert.equal(b.run('computeSpec().nkuBlocks'),0);
 b.run('switchRoute("r2")');assert.equal(b.run('computeSpec().nkuBlocks'),1);assert.equal(b.run('connectionLayout().filter(j=>j.kind==="nku").length'),1);
 const reload=browser({storage:b.storage});reload.boot();assert.deepEqual(json(reload,'routeEntries().map(r=>({segs:r.segs,ends:routeWorldEnds(r)}))'),paths);assert.equal(reload.elements.get('equipmentUndo').onclick(),true);assert.equal(reload.run('Boolean(equipmentById("e2"))'),true);
});
check('deleting a start bound to column five retains its precise world origin',()=>{
 const b=manualFixture();b.run("addEquipment('NKU');updateEquipment('e3',{size:{w:3400,d:600,h:2200},columns:[600,800,400,1000,600].map((width,i)=>({id:'c'+(i+1),name:'Колонна '+(i+1),width}))});$('routeStartEquipment').value='e3';$('routeEndEquipment').value='e2';routeColumnControl('start','e3','c5');routeColumnControl('end','e2','c1');connectEquipmentToManualRoute();state.selectedEquipmentId='e3'");
 const ends=json(b,'[originTop(),endPoint()]');assert.equal(b.elements.get('equipmentRemove').onclick(),true);assert.deepEqual(json(b,'[originTop(),endPoint()]'),ends);assert.equal(b.run('$("startType").value'),'NONE');assert.equal(b.run('computeSpec().nkuBlocks'),1);
});
check('clearing the path keeps configuration and permits deletion of previously bound equipment',()=>{
 const b=manualFixture();b.elements.get('routeBuild').onclick();b.run("$('ip').value='IP65';$('clear').onclick();state.selectedEquipmentId='e2'");assert.equal(b.run('state.segs.length'),0);assert.equal(b.elements.get('ip').value,'IP65');assert.equal(b.elements.get('equipmentRemove').onclick(),true);assert.equal(b.run('state.routes[0].bindings.end'),null);assert.equal(b.run('Boolean(equipmentById("e2"))'),false);
 b.run("state.selectedEquipmentId='e1';removeEquipment();$('clear').onclick()");assert.equal(b.run('state.equipment.length'),0);assert.equal(b.run('$("startType").value'),'NONE');assert.equal(b.run('collectCadDrawing().lines.some(e=>e.layer==="CAB")'),false);
});
check('storage failure prevents connection or deletion from changing the project',()=>{
 const b=manualFixture(),before=json(b,'validateProjectSnapshot(projectSnapshot())'),saved=b.storage.get('BUS_PROJECT_V7');b.sandbox.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};assert.equal(b.elements.get('routeBuild').onclick(),false);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);b.run("state.selectedEquipmentId='e2'");assert.equal(b.elements.get('equipmentRemove').onclick(),false);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);assert.equal(b.storage.get('BUS_PROJECT_V7'),saved);
});
check('clear is reversible after reload without reviving consumed undo history',()=>{
 const b=manualFixture();b.elements.get('routeBuild').onclick();const before=json(b,'validateProjectSnapshot(projectSnapshot())');assert.equal(b.elements.get('clear').onclick(),true);assert.equal(b.run('state.segs.length'),0);
 const reload=browser({storage:b.storage});reload.boot();assert.equal(reload.elements.get('routeBuildUndo').onclick(),true);assert.deepEqual(json(reload,'validateProjectSnapshot(projectSnapshot())'),before);const again=browser({storage:b.storage});again.boot();assert.equal(again.elements.get('routeBuildUndo').disabled,true);
});
check('a failed second storage write leaves the original project and scene intact',()=>{
 const b=manualFixture(),before=json(b,'validateProjectSnapshot(projectSnapshot())'),raw=b.storage.get('BUS_PROJECT_V7');b.sandbox.localStorage.setItem=(key,value)=>{if(key==='BUS_PROJECT_V7')throw new Error('QuotaExceededError');b.storage.set(key,value);};assert.equal(b.elements.get('routeBuild').onclick(),false);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);assert.equal(b.storage.get('BUS_PROJECT_V7'),raw);const reload=browser({storage:b.storage});reload.boot();assert.equal(reload.elements.get('routeBuildUndo').disabled,true);
});
console.log(`${count} manual-path checks passed`);

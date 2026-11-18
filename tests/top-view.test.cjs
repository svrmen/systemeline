const assert=require('node:assert/strict');
const {browser}=require('./startup.test.cjs');
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
const json=(b,source)=>JSON.parse(b.run('JSON.stringify('+source+')'));
function fixture(){
 const b=browser();b.boot();
 b.run("$('startType').value='TR';$('startW').value=2000;$('startD').value=1400;$('startH').value=1700;$('endType').value='NKU';state.routeOffset={x:-900,y:1200,z:100};state.segs=[{dir:'+Z',len:2000},{dir:'+Y',len:2000},{dir:'+X',len:6000},{dir:'-Z',len:1500}];state.calc=true;importEquipmentFromRoutes();state.annos=[{id:1,text:'Точка на плане',pos:{TOP:{ax:100,ay:1900,bx:-500,by:2200},ISO:{ax:17,ay:23,bx:42,by:51}}}];state.dimOffsets.TOP={1:{dx:35,dy:-20}};saveState()");
 return b;
}
function legacy(snapshot,version=6){
 const result=JSON.parse(JSON.stringify(snapshot));result.version=version;delete result.topViewRevision;
 for(const p of [result,...result.routes])for(const anno of p.annos){if(anno.pos.TOP){anno.pos.TOP.ay*=-1;anno.pos.TOP.by*=-1;}}
 return result;
}
check('asymmetric plan has the same handedness as ISO without changing world coordinates',()=>{
 const b=fixture(),before=json(b,'validateProjectSnapshot(projectSnapshot())');
 const points=[[100,1900,0],[100,3900,0],[6100,3900,0]],turn=([a,c,d])=>(c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]);
 b.run("setProjection('ISO')");const iso=points.map(p=>json(b,`proj(${p.join(',')})`));
 b.run("setProjection('TOP')");const top=points.map(p=>json(b,`proj(${p.join(',')})`));
 assert.equal(Math.sign(turn(iso)),Math.sign(turn(top)));assert.deepEqual(top,[[100,1900],[100,3900],[6100,3900]]);
 assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);
 for(const view of ['ISO','TOP','FRONT','BACK','LEFT','RIGHT','TOP'])b.run(`setProjection('${view}')`);
 assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);assert.equal(b.run('computeSpec().totalLen'),11500);
});
check('v6 migrates only TOP callout Y once and keeps source, routes, columns and offsets',()=>{
 const current=json(fixture(),'validateProjectSnapshot(projectSnapshot())'),old=legacy(current),raw=JSON.stringify(old),storage=new Map([['BUS_PROJECT_V6',raw]]),b=browser({storage});b.boot();
 assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),current);assert.equal(storage.get('BUS_PROJECT_V6'),raw);assert.equal(storage.has('BUS_PROJECT_V7'),false);
 assert.equal(b.run('saveState()'),true);const reload=browser({storage});reload.boot();assert.deepEqual(json(reload,'validateProjectSnapshot(projectSnapshot())'),current);assert.equal(storage.get('BUS_PROJECT_V6'),raw);
 // A still-open old tab cannot overwrite the new project key.
 storage.set('BUS_PROJECT_V6','old tab changes');const again=browser({storage});again.boot();assert.deepEqual(json(again,'validateProjectSnapshot(projectSnapshot())'),current);
});
check('single v3 annotation migration does not double-flip its synthesized route',()=>{
 const old={segs:[{dir:'+X',len:3000}],module:3000,annos:[{id:1,text:'Старая точка',pos:{TOP:{ax:20,ay:-50,bx:30,by:-70}}}]},storage=new Map([['BUS_STATE_V3',JSON.stringify(old)]]),b=browser({storage});b.boot();
 assert.deepEqual(json(b,'state.annos[0].pos.TOP'),{ax:20,ay:50,bx:30,by:70});assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot()).routes[0].annos[0].pos.TOP'),{ax:20,ay:50,bx:30,by:70});
});
check('all independent route annotations migrate and their source objects remain untouched',()=>{
 const b=fixture();b.run("addRoute('TR_NKU',true);state.annos=[{id:1,text:'Вторая точка',pos:{TOP:{ax:50,ay:4900,bx:70,by:5100},ISO:{ax:30,ay:40,bx:50,by:60}}}]");const old=legacy(json(b,'validateProjectSnapshot(projectSnapshot())')),raw=JSON.stringify(old);b.sandbox.oldProject=old;
 const converted=json(b,'validateProjectSnapshot(oldProject)');assert.equal(JSON.stringify(old),raw);assert.equal(converted.routes.length,2);
 for(let i=0;i<2;i++){assert.equal(converted.routes[i].annos[0].pos.TOP.ay,-old.routes[i].annos[0].pos.TOP.ay);assert.equal(converted.routes[i].annos[0].pos.ISO.ay,old.routes[i].annos[0].pos.ISO.ay);}
 b.sandbox.converted=converted;assert.deepEqual(json(b,'validateProjectSnapshot(converted)'),converted);
});
check('bad v7 orientation or column data blocks recovery without replacing the original',()=>{
 const b=fixture(),before=json(b,'validateProjectSnapshot(projectSnapshot())');
 for(const flag of [undefined,1,'2']){const bad={...before,topViewRevision:flag},raw=JSON.stringify(bad);b.storage.set('BUS_PROJECT_V7',raw);b.run('loadState()');assert.equal(b.run('projectStorageBlocked'),true);assert.equal(b.run('saveState()'),false);assert.equal(b.storage.get('BUS_PROJECT_V7'),raw);assert.deepEqual(json(b,'validateProjectSnapshot(projectSnapshot())'),before);}
 const bad=JSON.parse(JSON.stringify(before));delete bad.equipment.find(e=>e.kind==='NKU').columns;b.sandbox.bad=bad;assert.throws(()=>b.run('validateProjectSnapshot(bad)'),/колонн/);
});
check('TOP placement and hit testing use positive screen Y even at negative coordinates and zoom',()=>{
 const b=fixture();b.run("addEquipment('NKU');updateEquipment('e3',{position:{x:-600,y:-800,z:250}});setProjection('TOP');scale=.5;panX=300;panY=600");
 const event=json(b,'localToScreen(-300,-500)');assert.equal(b.run(`equipmentAtPointer({clientX:${event.x},clientY:${event.y}}).id`),'e3');
 const placed=json(b,'plannedEquipmentPosition(equipmentById("e3"),{clientX:1200,clientY:1400})');assert.deepEqual(placed,{x:1500,y:1300,z:250});
 assert.equal(b.run('equipmentAtPointer({clientX:5000,clientY:5000})'),undefined);
});
check('actual pointer handlers move an object down/right with the cursor and preserve Z after reload',()=>{
 const b=fixture();b.run("addEquipment('NKU');updateEquipment('e3',{position:{x:500,y:1000,z:250}});setEquipmentEditing(true);scale=.5;panX=100;panY=50");
 const ev=(clientX,clientY)=>({clientX,clientY,button:0,pointerId:1,target:b.run('cvs'),preventDefault(){},stopImmediatePropagation(){}});
 b.elements.get('wrap').pointerdown(ev(500,700));b.elements.get('wrap').pointermove(ev(650,950));b.elements.get('wrap').pointerup(ev(650,950));
 assert.deepEqual(json(b,'equipmentById("e3").position'),{x:800,y:1500,z:250});const reload=browser({storage:b.storage});reload.boot();assert.deepEqual(json(reload,'equipmentById("e3").position'),{x:800,y:1500,z:250});
});
check('moving a route translates TOP anchors and boxes with the same world Y sign',()=>{
 const b=fixture();b.run("detachEquipmentRoute();setProjection('TOP');$('routeY').value=1700");b.elements.get('routeY').input();
 assert.deepEqual(json(b,'state.annos[0].pos.TOP'),{ax:100,ay:2400,bx:-500,by:2700});assert.equal(b.run('state.dimOffsets.TOP[1].dy'),-20);
});
check('legacy equipment undo is migrated before the new save and survives reload exactly once',()=>{
 const b=fixture();b.run("state.selectedEquipmentId='e2';removeEquipment()");const record=JSON.parse(b.storage.get('BUS_PROJECT_V7.equipmentUndo'));
 record.before=legacy(record.before);record.after=legacy(record.after);const source=JSON.stringify(record),raw=JSON.stringify(record.after),storage=new Map([['BUS_PROJECT_V6',raw],['BUS_PROJECT_V6.equipmentUndo',source]]);
 const upgrade=browser({storage});upgrade.boot();assert.equal(upgrade.elements.get('equipmentUndo').disabled,false);assert.equal(upgrade.run('saveState()'),true);assert.ok(storage.has('BUS_PROJECT_V7.equipmentUndo'));
 const reload=browser({storage});reload.boot();assert.equal(reload.elements.get('equipmentUndo').onclick(),true);assert.equal(reload.run('Boolean(equipmentById("e2"))'),true);assert.equal(reload.run('state.annos[0].pos.TOP.ay'),1900);
 assert.equal(storage.get('BUS_PROJECT_V6'),raw);assert.equal(storage.get('BUS_PROJECT_V6.equipmentUndo'),source);const again=browser({storage});again.boot();assert.equal(again.elements.get('equipmentUndo').disabled,true);
});
check('TOP CAD dimensions and callout leaders agree with the screen while attributes retain world coordinates',()=>{
 const b=fixture();b.run("setProjection('TOP')");const model=json(b,'collectCadDrawing()'),dims=model.dimensions;
 assert.deepEqual(dims.map(d=>d.value),[2000,2000,6000,1500]);assert.deepEqual(dims[1].a,[100,-1900]);assert.deepEqual(dims[1].b,[100,-3900]);assert.deepEqual(dims[2].b,[6100,-3900]);
 const callout=model.annotations.find(a=>a.text.includes('Точка на плане'));assert.deepEqual(callout.anchor,[100,-1900]);assert.deepEqual(callout.point,[-500,-2200]);
 const equipment=model.lines.find(e=>e.meta.equipmentId==='e2'&&e.meta.type==='EQUIPMENT');assert.equal(equipment.meta.equipmentPosition.y,3600);
 assert.match(b.run('buildCadDXF(collectCadDrawing())'),/Y_MM\n/);
});
console.log(`${count} top-view checks passed`);

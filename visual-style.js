/* Presentation only. Uses the engineering primitives; never writes geometry or CAD. */
const VISUAL_STYLE_KEY='BUS_VISUAL_STYLE_V1';
let visualStyle='TECHNICAL';
const visualFrame={active:false,meshes:[],overlays:[],lastFaces:[]};
function beautifulView(){return visualStyle==='BEAUTIFUL'&&!DXF_COLLECT;}
function viewerTopInset(){return Math.max(84,(document.querySelector('.viewbar-top')?.getBoundingClientRect().height||0)+20);}
function setVisualStyle(value,{persist=true,redraw=true}={}){
  if(!['TECHNICAL','BEAUTIFUL'].includes(value))return false;
  visualStyle=value;
  for(const [id,mode] of [['styleTechnical','TECHNICAL'],['styleBeautiful','BEAUTIFUL']]){
    const button=$(id);button.classList.toggle('active',value===mode);button.setAttribute('aria-pressed',String(value===mode));
  }
  if(persist)try{localStorage.setItem(VISUAL_STYLE_KEY,value);}catch(error){msg.textContent='Вид переключён; браузер не сохранил выбор вида.';}
  if(redraw)draw();
  return true;
}
function initVisualStyle(){
  let saved;try{saved=localStorage.getItem(VISUAL_STYLE_KEY);}catch(error){}
  setVisualStyle(saved==='BEAUTIFUL'?'BEAUTIFUL':'TECHNICAL',{persist:false,redraw:false});
  $('styleTechnical').onclick=()=>setVisualStyle('TECHNICAL');
  $('styleBeautiful').onclick=()=>setVisualStyle('BEAUTIFUL');
}
function beginVisualFrame(){
  visualFrame.active=beautifulView();visualFrame.meshes=[];visualFrame.overlays=[];visualFrame.lastFaces=[];
}
function hideTechnicalPrimitive(layer){return visualFrame.active&&layer!=='FLOOR'&&layer!=='ANNOT';}
function queueVisualOverlay(a,b,color,width){
  if(!visualFrame.active)return false;
  visualFrame.overlays.push({a,b,color,width});return true;
}
function queueVisualBox(vertices,layer,kind){
  if(!visualFrame.active)return;
  const faces=[[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(f=>f.map(i=>vertices[i]));
  visualFrame.meshes.push({faces,layer,kind,vertices});
}
function queueVisualExtrusion(up,dn,layer){
  if(!visualFrame.active)return;
  const faces=[dn.slice().reverse(),up];
  for(let i=0;i<up.length;i++){const j=(i+1)%up.length;faces.push([dn[i],dn[j],up[j],up[i]]);}
  visualFrame.meshes.push({faces,layer,vertices:[...dn,...up]});
}
function visualCamera(){return {ISO:[1,1,1],TOP:[0,0,1],FRONT:[0,-1,0],BACK:[0,1,0],LEFT:[-1,0,0],RIGHT:[1,0,0]}[viewMode];}
function faceNormal(points){
  // Newell also handles the concave L-shaped elbow caps.
  const n=[0,0,0];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);}
  const length=Math.hypot(...n)||1;return n.map(v=>v/length);
}
function visibleVisualFaces(meshes=visualFrame.meshes){
  const camera=visualCamera(),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),faces=[];
  for(const mesh of meshes)for(const points of mesh.faces){
    const normal=faceNormal(points);if(dot(normal,camera)<=1e-7)continue;
    const depth=points.reduce((s,p)=>s+dot(p,camera),0)/points.length;
    faces.push({points,normal,depth,mesh});
  }
  return faces.sort((a,b)=>a.depth-b.depth);
}
function visualPalette(layer){
  if(layer==='ELBOW')return [57,105,196];
  if(layer==='JOINT')return [44,157,87];
  if(layer==='CAB')return [211,218,222];
  if(layer==='ENDCAP')return [119,131,141];
  return [219,225,230];
}
function visualRGB(base,light){return 'rgb('+base.map(v=>Math.max(0,Math.min(255,Math.round(v*light)))).join(',')+')';}
function visualPolygon(points,fill,edge='#72808a',width=.7/scale){
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(edge){ctx.strokeStyle=edge;ctx.lineWidth=width;ctx.stroke();}
}
function visualFacePoint(face,u,v){
  const [a,b,c,d]=face.points;
  return [0,1,2].map(i=>a[i]*(1-u)*(1-v)+b[i]*u*(1-v)+c[i]*u*v+d[i]*(1-u)*v);
}
function visualFaceRect(face,u0,v0,u1,v1,fill,edge,width){
  const points=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>proj(...visualFacePoint(face,u,v)));
  visualPolygon(points,fill,edge,width);
}
function visualFaceLine(face,u0,v0,u1,v1,color,width=.6/scale){
  const a=proj(...visualFacePoint(face,u0,v0)),b=proj(...visualFacePoint(face,u1,v1));
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
}
function visualHousingDetails(face){
  if(!['TR','NKU'].includes(face.mesh.kind)||face.points.length!==4||Math.abs(face.normal[2])>.5)return;
  const primary=Math.abs(face.normal[1])>.5;
  visualFaceRect(face,0,0,1,.045,'#727e85',null);
  if(!primary)return;
  // Styling of generic enclosures, not manufacturer door/vent dimensions.
  const doors=face.mesh.kind==='TR'?2:1,gap=.035;
  for(let door=0;door<doors;door++){
    const left=gap+door*(1-2*gap)/doors,right=gap+(door+1)*(1-2*gap)/doors;
    visualFaceRect(face,left,.06,right,.96,null,'#859198',.65/scale);
    const ventWidth=(right-left)*.58,ventX=(left+right-ventWidth)/2;
    for(let i=0;i<7;i++)visualFaceLine(face,ventX,.70+i*.019,ventX+ventWidth,.70+i*.019,'#7c8990',.75/scale);
    const handleX=right-(right-left)*.10;
    visualFaceRect(face,handleX,.39,handleX+.016,.49,'#687780',null);
  }
}
function visualBusDetails(face){
  if(face.mesh.layer!=='BUS'||face.points.length!==4)return;
  const [a,b,,d]=face.points,l1=Math.hypot(...a.map((v,i)=>v-b[i])),l2=Math.hypot(...a.map((v,i)=>v-d[i]));
  if(Math.max(l1,l2)<Math.min(l1,l2)*2)return;
  if(l1>l2){visualFaceLine(face,.008,.12,.992,.12,'rgba(255,255,255,.7)');visualFaceLine(face,.008,.90,.992,.90,'rgba(99,115,128,.28)');}
  else{visualFaceLine(face,.12,.008,.12,.992,'rgba(255,255,255,.7)');visualFaceLine(face,.90,.008,.90,.992,'rgba(99,115,128,.28)');}
}
function renderVisualFace(face){
  const points=face.points.map(p=>proj(...p)),base=visualPalette(face.mesh.layer);
  const normal=face.normal,light=.78+Math.max(0,normal[2])*.30+Math.abs(normal[0])*.10;
  let fill=visualRGB(base,light);
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  if(maxY-minY>.1&&typeof ctx.createLinearGradient==='function'){
    const gradient=ctx.createLinearGradient(0,minY,0,maxY);
    if(gradient&&typeof gradient.addColorStop==='function'){
      gradient.addColorStop(0,visualRGB(base,light+.08));gradient.addColorStop(.48,visualRGB(base,light));gradient.addColorStop(1,visualRGB(base,light-.045));fill=gradient;
    }
  }
  const colored=['ELBOW','JOINT'].includes(face.mesh.layer);
  visualPolygon(points,fill,colored?visualRGB(base,.56):'#81909a',.7/scale);
  visualHousingDetails(face);visualBusDetails(face);
}
function renderVisualContactShadows(){
  if(viewMode!=='ISO'&&viewMode!=='TOP')return;
  ctx.save();ctx.shadowColor='rgba(37,52,65,.20)';ctx.shadowBlur=10/scale;ctx.shadowOffsetY=3/scale;
  for(const mesh of visualFrame.meshes){
    if(!['TR','NKU'].includes(mesh.kind))continue;
    const z=mesh.vertices[0][2];if(Math.abs(z)>1)continue;
    const points=mesh.vertices.slice(0,4).map(p=>proj(p[0],p[1],z));visualPolygon(points,'rgba(41,56,65,.045)',null);
  }
  ctx.restore();
}
function flushVisualFrame(){
  if(!visualFrame.active)return;
  ctx.save();ctx.lineJoin='round';
  try{
    renderVisualContactShadows();const faces=visibleVisualFaces();visualFrame.lastFaces=faces;
    faces.forEach(renderVisualFace);
    for(const {a,b,color,width} of visualFrame.overlays){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}
  }finally{ctx.restore();visualFrame.active=false;}
}

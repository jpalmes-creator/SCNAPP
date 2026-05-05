// ============================================================
// SCN App — Entry Point
// ============================================================
// Importa los módulos del núcleo. El resto del código sigue acá
// como un solo bloque por ahora — en Fase 3 se separa en módulos
// por funcionalidad (cotizador, productos, fichas, etc).
// ============================================================

import { initSentry, setSentryUser, captureError } from './core/sentry.js';
import { sb } from './core/supabase.js';
import { showToast, openModal, closeModal } from './core/ui.js';
import { $$, compImg, f2b64, cleanPathPart, uniqueJpgPath } from './core/utils.js';
import { SCN_LOGO } from './core/logo.js';
import { buildPDF, buildFichaPage } from './core/pdf.js';

// Inicializar tracking de errores ANTES de todo
initSentry();

// Email config

const EMAIL_FROM = 'SCN Neumáticos <onboarding@resend.dev>';
const EMAIL_REPLY_TO = ['recepcion@scnchile.com','pablo@scnchile.com','juan.palmess@gmail.com'];

// `sb` se importa desde ./core/supabase.js

let ME=null,ROLE=null,UNAME=null;
let PRODS=[],SMAP={},CLIS=[];
let Q=[],QNUM=74815,FB='',FT='',FS='';

let PREVIEW_EMAIL = '', PREVIEW_NUM = '';
let PREVIEW_PDF_HTML = '';
let PREVIEW_SHOULD_CLEAR_Q = false;
let QUOTE_BUSY = false;

const SVCS=[
  {id:'s1',nm:'Montaje camión en taller',    pr:22000,ic:'🔧'},
  {id:'s2',nm:'Montaje a terreno (RM)',       pr:35000,ic:'🚛'},
  {id:'s3',nm:'Balanceo computarizado',       pr:8000, ic:'⚖️'},
  {id:'s4',nm:'Reparación pinchadura taller', pr:25000,ic:'🩹'},
  {id:'s5',nm:'Reparación emergencia',        pr:45000,ic:'⚡'},
  {id:'s6',nm:'Revisión e inflado de flota',  pr:4500, ic:'🔍'},
  {id:'s7',nm:'Alineación 3 ejes',            pr:95000,ic:'📐'},
  {id:'s8',nm:'Rotación neumáticos',          pr:18000,ic:'🔄'},
];

async function init(){
  initGmailToken();
  loadLS();
  const{data:{session}}=await sb.auth.getSession();
  if(session)await onLogin(session.user);
  sb.auth.onAuthStateChange(async(ev,sess)=>{
    if(ev==='SIGNED_IN'&&sess)await onLogin(sess.user);
    if(ev==='SIGNED_OUT')showLogin();
  });
}

async function loadLS(){
  try{
    const[p,c,s]=await Promise.all([
      sb.from('productos').select('id',{count:'exact',head:true}),
      sb.from('clientes').select('id',{count:'exact',head:true}),
      sb.from('stock').select('cantidad'),
    ]);
    document.getElementById('ls-p').textContent=(p.count||0).toLocaleString('es-CL');
    document.getElementById('ls-c').textContent=(c.count||0).toLocaleString('es-CL');
    document.getElementById('ls-s').textContent=(s.data||[]).reduce((a,r)=>a+(r.cantidad||0),0).toLocaleString('es-CL');
  }catch(e){}
}

async function doLogin(){
  const em=document.getElementById('le').value.trim();
  const pw=document.getElementById('lp').value;
  if(!em||!pw){showErr('Completa todos los campos');return;}
  const btn=document.getElementById('blg');
  btn.disabled=true;btn.textContent='Ingresando...';
  document.getElementById('lerr').style.display='none';
  const{error}=await sb.auth.signInWithPassword({email:em,password:pw});
  if(error){showErr('Correo o contraseña incorrectos');btn.disabled=false;btn.textContent='Ingresar';}
}
function showErr(m){const e=document.getElementById('lerr');e.textContent=m;e.style.display='block';}
async function doLogout(){await sb.auth.signOut();}

async function onLogin(user){
  ME=user;
  setSentryUser(user); // asocia el usuario logueado al error tracking
  for(let i=0;i<3;i++){
    const{data}=await sb.from('usuarios').select('*').eq('id',user.id).maybeSingle();
    if(data){ROLE=data.rol||'vendedor';UNAME=data.nombre||user.email.split('@')[0];break;}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!ROLE){
    const em=user.email.toLowerCase();
    if(em==='pablo@scnchile.com'){ROLE='gerente';UNAME='Pablo';}
    else if(em==='juan.palmess@gmail.com'){ROLE='admin';UNAME='JP';}
    else{ROLE='vendedor';UNAME=em.split('@')[0];}
  }
  showApp();
}

function showLogin(){
  document.getElementById('login').style.display='flex';
  document.getElementById('app').style.display='none';
  const b=document.getElementById('blg');b.disabled=false;b.textContent='Ingresar';
}

async function showApp(){
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('tav').textContent=UNAME.charAt(0).toUpperCase();
  document.getElementById('tun').textContent=UNAME;
  document.getElementById('trl').textContent={admin:'Administrador',gerente:'Gerente',vendedor:'Vendedor',bodega:'Bodega'}[ROLE]||ROLE;
  const isMgr=ROLE==='gerente'||ROLE==='admin';
  document.getElementById('ng-mgr').style.display=isMgr?'block':'none';
  const bapr=document.getElementById('bapr');
  if(bapr)bapr.style.display=isMgr?'none':'flex';
  await Promise.all([loadProds(),loadSmap(),loadClis()]);
  renderCat();renderSvcs();buildDL();await loadQNum();
  if(isMgr)loadABadge();
  const sel=document.getElementById('dmes');if(sel)sel.value=new Date().getMonth();
}

async function loadProds(){
  const{data}=await sb.from('productos').select('*').eq('es_servicio',false).eq('activo',true).order('marca');
  PRODS=(data||[]).map(p=>({...p,precio_venta:p.precio_venta>0?p.precio_venta:Math.round((p.costo_unitario||0)*1.35)}));
  const brands=[...new Set(PRODS.map(p=>p.marca).filter(Boolean))].sort();
  const bSel=document.getElementById('bch-sel');
  const curBrand=bSel?.value||'';
  if(bSel)bSel.innerHTML='<option value="">Todas las marcas</option>'+brands.map(b=>`<option value="${b}"${b===curBrand?' selected':''}>${b}</option>`).join('');
  const tipos=[...new Set(PRODS.map(p=>p.tipo_uso).filter(Boolean))].sort();
  document.getElementById('tch').innerHTML='<button class="chip on" onclick="st2(\'\',this)">Todos</button>'+
    tipos.map(t=>{const tc=TCLASS(t);return `<button class="chip" onclick="st2('${t}',this)">${t}</button>`;}).join('');
}
async function loadSmap(){
  const{data}=await sb.from('stock').select('*');
  SMAP={};
  (data||[]).forEach(r=>{
    if(!SMAP[r.producto_id])SMAP[r.producto_id]={q:0,a:0,l:0,t:0};
    const s=SMAP[r.producto_id];
    if(r.bodega==='SCN QUILICURA')s.q=r.cantidad;
    if(r.bodega==='BODEGA AUTO')s.a=r.cantidad;
    if(r.bodega==='LOS ANDES')s.l=r.cantidad;
    s.t=s.q+s.a+s.l;
  });
}
async function loadClis(){const{data}=await sb.from('clientes').select('*').order('nombre');CLIS=data||[];}
function buildDL(){document.getElementById('cll').innerHTML=CLIS.map(c=>`<option value="${c.nombre}" data-rut="${c.rut}" data-em="${c.email||''}">`).join('');}
function aFill(){const v=document.getElementById('qcl').value;const c=CLIS.find(x=>x.nombre===v);if(c){document.getElementById('qrt').value=c.rut||'';document.getElementById('qem').value=c.email||'';}}
async function loadQNum(){
  const{data,error}=await sb.from('cotizaciones').select('numero').order('numero',{ascending:false}).limit(1);
  if(error){console.error('loadQNum error:',error);document.getElementById('qnum').textContent='#'+QNUM;return QNUM;}
  QNUM=data&&data.length?Number(data[0].numero)+1:74815;
  document.getElementById('qnum').textContent='#'+QNUM;
  return QNUM;
}
async function loadABadge(){const{count}=await sb.from('cotizaciones').select('id',{count:'exact',head:true}).eq('estado','pendiente');const b=document.getElementById('nb-a');b.textContent=count||0;b.style.display=count?'inline-block':'none';}

const PTITLES={cot:'Cotizador',mis:'Mis Cotizaciones',cli:'Clientes',stk:'Stock Disponible',apr:'Aprobaciones',dash:'Dashboard',pre:'Precios',all:'Todas las Cotizaciones',crit:'Stock Crítico',imp:'Importar Stock',fic:'Fichas Técnicas'};
function go(pg,btn){
  closeSidebar();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on'));
  const el=document.getElementById('pg-'+pg);if(el)el.classList.add('on');
  if(btn)btn.classList.add('on');
  document.getElementById('pg-title').textContent=PTITLES[pg]||pg;
  var mc=document.getElementById('mob-cart');
  if(mc) mc.style.display=(pg==='cot')?'':'none';
  document.querySelector('.qp').classList.remove('mob-open');
  if(pg==='mis')loadMis();
  if(pg==='cli')rCli(CLIS);
  if(pg==='stk')rStk(PRODS);
  if(pg==='apr')loadApr();
  if(pg==='dash')loadDash();
  if(pg==='pre')rPre(PRODS);
  if(pg==='all')loadAll();
  if(pg==='crit')rCrit();
  if(pg==='fic')loadFichas();
}

function getFilt(){
  const q=(document.getElementById('psr')?.value||'').toLowerCase();
  return PRODS.filter(p=>{
    if(FS){const s=SMAP[p.id]||{t:0};if(FS==='si'&&s.t<=0)return false;if(FS==='no'&&s.t>0)return false;}
    if(FB&&p.marca!==FB)return false;
    if(FT&&p.tipo_uso!==FT)return false;
    if(q&&!p.descripcion?.toLowerCase().includes(q)&&!p.marca?.toLowerCase().includes(q)&&!p.medida?.toLowerCase().includes(q)&&!p.modelo?.toLowerCase().includes(q))return false;
    return true;
  });
}

let _rcTimer=null;
function renderCat(){clearTimeout(_rcTimer);_rcTimer=setTimeout(_renderCat,60);}
function _renderCat(){
  const items=getFilt(),inQ=new Set(Q.map(i=>i.id)),grid=document.getElementById('pgrd');
  document.getElementById('pct').textContent=items.length+' neumáticos';
  if(!items.length){grid.innerHTML='<div class="empty"><div class="ei">🔍</div>Sin resultados</div>';return;}
  grid.innerHTML=items.slice(0,60).map(p=>{
    const s=SMAP[p.id]||{t:0};
    const sc=s.t>5?'sok':s.t>0?'slow':'szero';
    const sl=s.t>0?s.t+' ud.':'Sin stock';
    const tc=TCLASS(p.tipo_uso);
    const img=p.foto_url?`<img src="${p.foto_url}" alt="" onerror="this.style.display='none'">`:`<span class="p-ni">🛞</span>`;
    return `<div class="pcard ${inQ.has(p.id)?'pk':''}" onclick="addI('${p.id}','n')">
      <div class="p-img">${img}
        <button class="p-photo-btn" onclick="event.stopPropagation()">📷 Foto<input type="file" accept="image/*" onchange="upPhoto(event,'${p.id}')"></button>
      </div>
      <div class="p-inf">
        <div class="p-brand">${p.marca||'—'}</div>
        <div class="p-name">${p.medida||''} ${p.modelo||''}</div>
        <div class="p-bot"><span class="p-tipo t${tc}">${p.tipo_uso||''}</span><span class="p-stk ${sc}">${sl}</span></div>
        <div class="p-price">${$$(p.precio_venta)}</div>
      </div>
      <button class="p-add">${inQ.has(p.id)?'✓':'+'}</button>
    </div>`;
  }).join('');
  if(items.length>60)grid.innerHTML+=`<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--g500);font-size:11px;">Mostrando 60 de ${items.length} — usa el buscador para filtrar</div>`;
}

function renderSvcs(){
  const inQ=new Set(Q.map(i=>i.id));
  document.getElementById('svl').innerHTML=SVCS.map(s=>`
    <div class="sv-row ${inQ.has(s.id)?'pk':''}" onclick="addI('${s.id}','s')">
      <span class="sv-ic">${s.ic}</span>
      <span class="sv-nm">${s.nm}</span>
      <span class="sv-pr">${$$(s.pr)}</span>
      <button class="sv-add">${inQ.has(s.id)?'✓':'+'}</button>
    </div>`).join('');
}

function TCLASS(t){return{DIRECCIONAL:'D',TRACCION:'T',MIXTO:'M',FAENERO:'F','CITY/TOURING':'CT',SPORT:'SP',SUV:'SV','ALL TERRAIN':'AT','MUD TERRAIN':'MT',COMERCIAL:'CO',LLANTA:'LL',CAMARA:'CA'}[t]||'OT';}
function fp(){renderCat();}
function setFS(v,btn){FS=v;document.querySelectorAll('#stk-tog button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderCat();}
function sb2sel(v){FB=v;renderCat();}
function sb2(v,btn){FB=v;renderCat();}
function sb2mob(v){FB=v;renderCat();}
function st2(v,btn){FT=v;document.querySelectorAll('#tch .chip').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderCat();}
function setTab(t,btn){
  document.getElementById('pn').style.display=t==='n'?'block':'none';
  document.getElementById('ps').style.display=t==='s'?'block':'none';
  document.getElementById('tn').className='t-btn'+(t==='n'?' on':'');
  document.getElementById('ts').className='t-btn'+(t==='s'?' on':'');
  if(t==='s')renderSvcs();
}

// cleanPathPart, uniqueJpgPath se importan desde ./core/utils.js

async function upPhoto(event,pid){
  const input=event.target;
  const file=input.files&&input.files[0];if(!file)return;
  input.disabled=true;
  showToast('Subiendo foto...');
  try{
    const comp=await compImg(file,800);
    const fn=uniqueJpgPath('productos','prod_'+pid);
    const{error:upErr}=await sb.storage.from('fotos-neumaticos').upload(fn,comp,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
    if(upErr){showToast('Error al subir: '+upErr.message);console.error('Storage error:',upErr);return;}
    const{data:ud}=sb.storage.from('fotos-neumaticos').getPublicUrl(fn);
    const url=ud.publicUrl;
    const{error:dbErr}=await sb.from('productos').update({foto_url:url}).eq('id',pid);
    if(dbErr){showToast('Error guardando URL: '+dbErr.message);console.error('DB foto_url error:',dbErr);return;}
    const p=PRODS.find(x=>x.id===pid);if(p)p.foto_url=url;
    // Sincronizar foto a TODOS los productos y fichas del mismo (marca, modelo) — la foto es por modelo, no por SKU
    if(p&&p.marca&&p.modelo){
      const M=p.marca.toUpperCase().trim(), MO=p.modelo.toUpperCase().trim();
      try{
        await sb.from('productos').update({foto_url:url}).ilike('marca',M).ilike('modelo',MO);
        await sb.from('fichas_tecnicas').update({imagen_url:url}).ilike('marca',M).ilike('modelo',MO);
      }catch(e){console.warn('Sync foto a productos/fichas falló (no crítico):',e);}
      // Actualizar caches locales
      PRODS.forEach(x=>{if(x.marca&&x.modelo&&x.marca.toUpperCase().trim()===M&&x.modelo.toUpperCase().trim()===MO)x.foto_url=url;});
      if(typeof FICHAS!=='undefined'&&Array.isArray(FICHAS)){
        FICHAS.forEach(f=>{if(f.marca&&f.modelo&&f.marca.toUpperCase().trim()===M&&f.modelo.toUpperCase().trim()===MO)f.imagen_url=url;});
      }
    }
    renderCat();
    showToast('✓ Foto guardada y sincronizada con la ficha técnica');
  }catch(e){showToast('Error: '+e.message);console.error(e);}
  finally{input.value='';input.disabled=false;}
}

// compImg, f2b64 se importan desde ./core/utils.js

function addI(id,tipo){
  const prod=tipo==='n'?PRODS.find(p=>p.id===id):SVCS.find(s=>s.id===id);
  if(!prod)return;
  const ex=Q.find(i=>i.id===id);
  if(ex){ex.qty++;showToast('+1 agregado');}
  else{Q.push({id,prod,qty:1,tipo,up:tipo==='n'?prod.precio_venta:prod.pr});showToast('Agregado');}
  rQ();renderCat();if(document.getElementById('ps').style.display!=='none')renderSvcs();
}

function chQty(id,d){const i=Q.find(x=>x.id===id);if(!i)return;i.qty+=d;if(i.qty<=0)Q=Q.filter(x=>x.id!==id);rQ();renderCat();}
function setQty(id,v){const i=Q.find(x=>x.id===id);if(!i)return;const qty=Math.max(1,parseInt(v)||1);if(qty===i.qty)return;i.qty=qty;rQ();renderCat();}
function rmI(id){Q=Q.filter(i=>i.id!==id);rQ();renderCat();}
function upP(id,v){const i=Q.find(x=>x.id===id);if(!i)return;i.up=parseFloat(v)||0;const el=document.getElementById('qs-'+id);if(el)el.textContent=$$(i.up*i.qty);rcTot();}
function rcTot(){const n=Q.reduce((a,i)=>a+i.up*i.qty,0),iv=Math.round(n*.19);document.getElementById('tn2').textContent=$$(n);document.getElementById('ti').textContent=$$(iv);document.getElementById('tt').textContent=$$(n+iv);}

function syncQuoteButtons(){
  const hasItems=Q.length>0;
  const bp=document.getElementById('bpdf'),ba=document.getElementById('bapr'),bf=document.getElementById('bfic');
  if(bp)bp.disabled=QUOTE_BUSY||!hasItems;
  if(ba)ba.disabled=QUOTE_BUSY||!hasItems;
  if(bf)bf.disabled=QUOTE_BUSY||!hasItems;
}
function setQuoteBusy(busy){QUOTE_BUSY=!!busy;syncQuoteButtons();}
function snapshotQ(){
  return Q.map(i=>({id:i.id,tipo:i.tipo,qty:Math.max(1,parseInt(i.qty)||1),up:Number(i.up)||0,prod:{...i.prod}}));
}
function calcQuoteTotals(items){
  const neto=(items||[]).reduce((a,i)=>a+(Number(i.up)||0)*(Number(i.qty)||0),0);
  const iva=Math.round(neto*.19);
  return {neto,iva,total:neto+iva};
}

function rQ(){
  const list=document.getElementById('qilist'),empty=document.getElementById('qpempty'),tots=document.getElementById('qtots');
  if(!Q.length){empty.style.display='flex';list.innerHTML='';tots.style.display='none';syncQuoteButtons();updateMobCart();return;}
  empty.style.display='none';tots.style.display='block';syncQuoteButtons();
  const neu=Q.filter(i=>i.tipo==='n'),svc=Q.filter(i=>i.tipo==='s');
  let h='';
  if(neu.length){
    const cnt=neu.reduce((a,i)=>a+i.qty,0);
    h+=`<div class="qsec">Neumáticos <span class="qsec-b">${cnt}</span></div>`;
    h+=neu.map(item=>{
      const ph=item.prod.foto_url;
      return `<div class="qi">
        <div class="qi-img">${ph?`<img src="${ph}">`:'🛞'}</div>
        <div style="min-width:0;">
          <div class="qi-br">${item.prod.marca||'—'}</div>
          <div class="qi-nm">${item.prod.medida||''} ${item.prod.modelo||''}</div>
          <input class="qi-pi" type="number" value="${item.up}" onchange="upP('${item.id}',this.value)" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'">
          <div class="qi-ctrl">
            <button class="qcb" onclick="chQty('${item.id}',-1)">−</button>
            <input type="number" class="qcn" value="${item.qty}" min="1" onchange="setQty('${item.id}',this.value)" onclick="this.select()">
            <button class="qcb" onclick="chQty('${item.id}',1)">+</button>
          </div>
        </div>
        <div class="qi-r">
          <div class="qi-sub" id="qs-${item.id}">${$$(item.up*item.qty)}</div>
          <button class="qi-rm" onclick="rmI('${item.id}')">✕</button>
        </div>
      </div>`;
    }).join('');
  }
  if(svc.length){
    const cnt=svc.reduce((a,i)=>a+i.qty,0);
    h+=`<div class="qsec" style="margin-top:8px">Servicios <span class="qsec-b">${cnt}</span></div>`;
    h+=svc.map(item=>`<div class="qi">
      <div class="qi-img">${item.prod.ic}</div>
      <div style="min-width:0;">
        <div class="qi-br" style="color:var(--g500)">SERVICIO</div>
        <div class="qi-nm">${item.prod.nm}</div>
        <input class="qi-pi" type="number" value="${item.up}" onchange="upP('${item.id}',this.value)" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'">
        <div class="qi-ctrl">
          <button class="qcb" onclick="chQty('${item.id}',-1)">−</button>
          <span class="qcn">${item.qty}</span>
          <button class="qcb" onclick="chQty('${item.id}',1)">+</button>
        </div>
      </div>
      <div class="qi-r">
        <div class="qi-sub" id="qs-${item.id}">${$$(item.up*item.qty)}</div>
        <button class="qi-rm" onclick="rmI('${item.id}')">✕</button>
      </div>
    </div>`).join('');
  }
  list.innerHTML=h;rcTot();
  updateMobCart();
}

async function clearQ(force=false,opts={syncNum:true}){
  const fields=['qcl','qrt','qat','qem'];
  const hasForm=fields.some(id=>(document.getElementById(id)?.value||'').trim());
  if(!force&&(Q.length||hasForm)&&!confirm('¿Limpiar la cotización?'))return false;
  Q=[];
  fields.forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const pg=document.getElementById('qpg');if(pg)pg.value='Contado';
  PREVIEW_PDF_HTML='';PREVIEW_EMAIL='';PREVIEW_NUM='';PREVIEW_SHOULD_CLEAR_Q=false;
  document.querySelector('.qp')?.classList.remove('mob-open');
  rQ();renderCat();
  if(document.getElementById('ps')?.style.display!=='none')renderSvcs();
  if(opts.syncNum!==false){try{await loadQNum();}catch(e){console.error('No se pudo sincronizar QNUM:',e);}}
  return true;
}

async function saveQ(estado,qItems=null){
  if(!ME||!ME.id){showToast('❌ Sesión inválida. Cerrá y volvé a iniciar sesión.');return null;}
  const items=(qItems&&qItems.length?qItems:snapshotQ()).map(i=>({id:i.id,tipo:i.tipo,qty:Math.max(1,parseInt(i.qty)||1),up:Number(i.up)||0,prod:{...i.prod}}));
  if(!items.length){showToast('Agregá al menos un ítem antes de guardar.');return null;}

  const cl=document.getElementById('qcl').value||'—';
  const rt=document.getElementById('qrt').value||'—';
  const at=document.getElementById('qat').value||'—';
  const em=document.getElementById('qem').value||'';
  const pg=document.getElementById('qpg').value;
  const {neto,iva,total}=calcQuoteTotals(items);
  const cr=CLIS.find(c=>c.nombre===cl);
  const payload={cliente_id:cr?.id||null,cliente_nombre:cl,cliente_rut:rt,cliente_contacto:at,cliente_email:em,forma_pago:pg,estado,neto,iva,total,creado_por:ME.id};

  let cot=null,lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    const numero=QNUM;
    const{data,error}=await sb.from('cotizaciones').insert({numero,...payload}).select().single();
    if(!error){cot=data;break;}
    lastError=error;
    if(error.code==='23505'||(error.message||'').toLowerCase().includes('duplicate')){
      console.warn('QNUM '+QNUM+' ya existe, reintentando con número fresco…');
      await loadQNum();
      continue;
    }
    if((error.message||'').includes('creado_por_fkey')||(error.message||'').includes('creado_por')){
      showToast('❌ Tu usuario no está registrado en la tabla usuarios. Avisá al admin.');
      console.error('FK error en creado_por. ME.id =',ME.id,'— hay que insertarlo en tabla usuarios.');
      return null;
    }
    break;
  }
  if(!cot){
    const msg=lastError?lastError.message:'Error desconocido';
    showToast('❌ '+msg);
    console.error('saveQ falló tras reintentos:',lastError);
    return null;
  }

  QNUM=Math.max(QNUM,Number(cot.numero)+1);
  document.getElementById('qnum').textContent='#'+QNUM;

  const rows=items.map(i=>({
    cotizacion_id:cot.id,
    producto_id:i.tipo==='n'?i.id:null,
    descripcion:i.tipo==='n'?(i.prod.marca+' '+(i.prod.descripcion||'')):i.prod.nm,
    marca:i.tipo==='n'?i.prod.marca:'SERVICIO',
    cantidad:i.qty,precio_unit:i.up,total:i.up*i.qty,
  }));
  const{error:itemsErr}=await sb.from('cotizacion_items').insert(rows);
  if(itemsErr){console.error('Error insertando items (cotizacion ya guardada):',itemsErr);showToast('⚠️ Cotización guardada pero items fallaron: '+itemsErr.message);}
  return {...cot,neto,iva,total};
}

async function sendAppr(){
  if(QUOTE_BUSY)return;
  const qSnap=snapshotQ();
  if(!qSnap.length){showToast('Agregá productos o servicios antes de enviar.');return;}
  const btn=document.getElementById('bapr');
  const old=btn?btn.innerHTML:'';
  setQuoteBusy(true);
  if(btn)btn.textContent='Enviando...';
  try{
    const c=await saveQ('pendiente',qSnap);
    if(c){
      showToast('✓ Enviada para aprobación');
      await clearQ(true,{syncNum:true});
      try{await loadABadge();}catch(e){console.error('loadABadge error:',e);}
    }
  }catch(e){
    showToast('Error: '+e.message);
    console.error('sendAppr error:',e);
  }finally{
    if(btn)btn.innerHTML=old;
    setQuoteBusy(false);
  }
}

// buildPDF, buildFichaPage se importan desde ./core/pdf.js

function openPDF(html, email='', num='', showSend=false, clearOnClose=false) {
  PREVIEW_PDF_HTML = html || '';
  PREVIEW_EMAIL = email || '';
  PREVIEW_NUM = num || '';
  PREVIEW_SHOULD_CLEAR_Q = !!clearOnClose;

  const downloadBtn=document.getElementById('btn-download-pdf');
  if(downloadBtn){downloadBtn.disabled=false;downloadBtn.textContent='💾 PDF';}
  const sendBtn = document.getElementById('btn-send-email');
  if(sendBtn){
    sendBtn.disabled=false;
    sendBtn.style.display = (showSend && email) ? 'inline-block' : 'none';
    sendBtn.textContent = '✉️ Enviar';
  }

  const previewDiv = document.getElementById('pdf-preview-div');
  previewDiv.innerHTML = '<iframe id="pdf-iframe" sandbox="allow-same-origin" style="width:100%;height:100%;border:none;background:white;"></iframe>';
  const iframe = document.getElementById('pdf-iframe');
  iframe.srcdoc = PREVIEW_PDF_HTML;

  document.getElementById('pdf-modal-title').textContent = 'Cotización #' + (num||'');
  document.getElementById('pdf-modal').style.display = 'flex';
}

async function closePDFModal() {
  const shouldClear=PREVIEW_SHOULD_CLEAR_Q;
  document.getElementById('pdf-modal').style.display = 'none';
  document.getElementById('pdf-preview-div').innerHTML = '';
  PREVIEW_PDF_HTML='';PREVIEW_EMAIL='';PREVIEW_NUM='';PREVIEW_SHOULD_CLEAR_Q=false;
  const sendBtn=document.getElementById('btn-send-email');
  if(sendBtn){sendBtn.disabled=false;sendBtn.style.display='none';sendBtn.textContent='✉️ Enviar';}
  const dlBtn=document.getElementById('btn-download-pdf');
  if(dlBtn){dlBtn.disabled=false;dlBtn.textContent='💾 PDF';}
  if(shouldClear)await clearQ(true,{syncNum:true});
}

function initGmailToken() {}

// ── MOBILE HELPERS ──
function toggleSidebar() {
  var sb = document.querySelector('.sidebar');
  var ov = document.querySelector('.sidebar-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('show');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('show');
}
function toggleMobCart() {
  document.querySelector('.qp').classList.toggle('mob-open');
}
function updateMobCart() {
  var badge = document.getElementById('mob-cart-n');
  var btn = document.getElementById('mob-cart');
  if (!badge || !btn) return;
  if (Q.length > 0) {
    badge.textContent = Q.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

async function downloadPDF() {
  if (!PREVIEW_PDF_HTML) return;
  const btn = document.getElementById('btn-download-pdf');
  btn.disabled = true; btn.textContent = '📄 Generando...';
  try {
    const container = document.createElement('div');
    container.innerHTML = PREVIEW_PDF_HTML;
    container.style.width = '210mm';
    document.body.appendChild(container);
    await html2pdf().set({
      margin: 0,
      filename: 'Cotizacion_' + PREVIEW_NUM + '_SCN.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save();
    document.body.removeChild(container);
    btn.textContent = '💾 Descargar PDF';
    btn.disabled = false;
  } catch(e) {
    showToast('Error: ' + e.message);
    btn.textContent = '💾 Descargar PDF';
    btn.disabled = false;
  }
}

async function sendEmailFromPreview() {
  if (!PREVIEW_EMAIL) { showToast('No hay email del cliente'); return; }
  const btn = document.getElementById('btn-send-email');
  btn.disabled = true; btn.textContent = '📄 Generando PDF...';
  try {
    const container = document.createElement('div');
    container.innerHTML = PREVIEW_PDF_HTML;
    container.style.width = '210mm';
    document.body.appendChild(container);
    const pdfBlob = await html2pdf().set({
      margin: 0,
      filename: 'Cotizacion_' + PREVIEW_NUM + '_SCN.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).outputPdf('blob');
    document.body.removeChild(container);

    const pdfBase64 = await new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function() { resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    btn.textContent = '✉️ Enviando...';

    const body = {
      from: EMAIL_FROM,
      to: [PREVIEW_EMAIL],
      reply_to: EMAIL_REPLY_TO,
      subject: 'Cotización #' + PREVIEW_NUM + ' - SCN Neumáticos',
      html: '<p>Estimado cliente,</p><p>Adjuntamos la cotización <strong>#' + PREVIEW_NUM + '</strong> de SCN Neumáticos.</p><p>Para confirmar o consultar, responda este correo.</p><br><p>Saludos,<br><strong>Equipo SCN Neumáticos</strong><br>Tel: 228448878 / +569 9632 1722<br>Carretera General San Martín 9360, Bodega 6, Quilicura</p>',
      attachments: [{
        filename: 'Cotizacion_' + PREVIEW_NUM + '_SCN.pdf',
        content: pdfBase64,
        type: 'application/pdf',
      }]
    };

    const res = await fetch(SB_URL + '/functions/v1/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SB_KEY,
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al enviar');

    showToast('✓ Email enviado a ' + PREVIEW_EMAIL);
    btn.textContent = '✓ Enviado';
  } catch(e) {
    showToast('Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = '✉️ Enviar al cliente';
  }
}


async function genPDF(){
  if(QUOTE_BUSY)return;
  const qSnap=snapshotQ();
  if(!qSnap.length){showToast('Agregá productos o servicios antes de generar PDF.');return;}
  const btn=document.getElementById('bpdf');
  const old=btn?btn.innerHTML:'';
  setQuoteBusy(true);
  if(btn)btn.textContent='Generando...';
  try{
    const cot=await saveQ('borrador',qSnap);
    if(!cot)return;
    const email=document.getElementById('qem').value||cot.cliente_email||'';
    const modelMap={};
    qSnap.filter(i=>i.tipo==='n'&&i.prod.modelo&&i.prod.marca).forEach(i=>{
      const key=i.prod.marca+'|'+i.prod.modelo+'|'+(i.prod.medida||'');
      if(!modelMap[key])modelMap[key]={marca:i.prod.marca,modelo:i.prod.modelo,medida:i.prod.medida||'',prod:i.prod};
    });
    let fichasHTML='';
    if(Object.keys(modelMap).length>0){
      const{data:fichas,error:fichasErr}=await sb.from('fichas_tecnicas').select('*');
      if(fichasErr)console.error('Error cargando fichas para PDF:',fichasErr);
      Object.values(modelMap).forEach(m=>{
        const f=fichas?.find(ft=>ft.marca===m.marca&&ft.modelo===m.modelo&&(ft.medida||'')===(m.medida||''));
        fichasHTML+=buildFichaPage(f||{marca:m.marca,modelo:m.modelo,medida:m.medida,segmento:m.prod.tipo_vehiculo||'CAMION',aplicacion:m.prod.tipo_uso||''},[m.prod],fichas||[]);
      });
    }
    const totals=calcQuoteTotals(qSnap);
    const pdfHTML=buildPDF({...cot,...totals},qSnap);
    const fullHTML=fichasHTML?pdfHTML.replace('</body></html>',fichasHTML+'</body></html>'):pdfHTML;
    openPDF(fullHTML,email,cot.numero,!!email,true);
    showToast('Vista previa lista'+(fichasHTML?' (con fichas técnicas)':''));
  }catch(e){
    showToast('Error al generar PDF: '+e.message);
    console.error('genPDF error:',e);
  }finally{
    if(btn)btn.innerHTML=old;
    setQuoteBusy(false);
  }
}

async function loadMis(){
  const today=new Date().toISOString().split('T')[0];
  const{data}=await sb.from('cotizaciones')
    .select('id,numero,cliente_nombre,forma_pago,total,estado,created_at,cliente_email')
    .eq('creado_por',ME.id)
    .gte('created_at',today)
    .order('created_at',{ascending:false});
  const tb=document.getElementById('mistb');
  if(!data?.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--g500)">Sin cotizaciones hoy</td></tr>';return;}
  tb.innerHTML=data.map(c=>`<tr>
    <td class="mn">#${c.numero}</td><td style="font-weight:600">${c.cliente_nombre}</td>
    <td>${c.forma_pago}</td><td class="mn">${$$(c.total)}</td>
    <td><span class="bdg b${c.estado==='pendiente'?'pend':c.estado==='aprobada'?'aprov':c.estado==='rechazada'?'rech':'borr'}">${c.estado.toUpperCase()}</span></td>
    <td>${new Date(c.created_at).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</td>
    <td><button onclick="previewCot(${c.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--g500);" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--g500)'">📄</button></td>
  </tr>`).join('');
  const b=document.getElementById('nb-m');b.textContent=data.length;b.style.display='inline-block';
}

function rCli(data){document.getElementById('clitb').innerHTML=data.slice(0,100).map(c=>`<tr>
  <td class="mn" style="font-size:11px">${c.rut}</td><td style="font-weight:600">${c.nombre}</td>
  <td><span class="bdg b${c.segmento==='VIP'?'vip':c.segmento==='MEDIANO'?'med':'peq'}">${c.segmento||'—'}</span></td>
  <td class="mn">${$$(c.total_ventas_2025)}</td>
  <td style="color:var(--g500);font-size:11px">${c.email||'—'}</td>
  <td style="font-size:11px">${c.telefono||'—'}</td>
  <td><button onclick="openEditCli('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--g400);" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--g400)'">✏️</button></td>
</tr>`).join('');}
function fCli(q){rCli(CLIS.filter(c=>!q||c.nombre.toLowerCase().includes(q.toLowerCase())||c.rut.includes(q)));}

function rStk(data){document.getElementById('stktb').innerHTML=data.slice(0,150).map(p=>{
  const s=SMAP[p.id]||{q:0,a:0,l:0,t:0};
  const sc=s.t>5?'sok':s.t>0?'slow':'szero';
  return`<tr>
    <td style="font-size:11px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.descripcion}</td>
    <td style="font-weight:600;color:var(--red);font-size:11px">${p.marca}</td>
    <td class="mn" style="font-size:11px">${p.medida}</td>
    <td style="text-align:center"><span class="p-stk ${s.q>0?'sok':'szero'}">${s.q}</span></td>
    <td style="text-align:center"><span class="p-stk ${s.a>0?'sok':'szero'}">${s.a}</span></td>
    <td style="text-align:center"><span class="p-stk ${s.l>0?'sok':'szero'}">${s.l}</span></td>
    <td style="text-align:center"><span class="p-stk ${sc}"><strong>${s.t}</strong></span></td>
    <td><button onclick="openEditProd('${p.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--g400);" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--g400)'">✏️</button></td>
  </tr>`;}).join('');}
function fStk(q){rStk(PRODS.filter(p=>!q||p.descripcion?.toLowerCase().includes(q.toLowerCase())||p.marca?.toLowerCase().includes(q.toLowerCase())));}

async function loadApr(){
  const{data}=await sb.from('cotizaciones').select('*,cotizacion_items(*)').eq('estado','pendiente').order('created_at');
  const grid=document.getElementById('aprg');
  if(!data?.length){grid.innerHTML='<div class="empty"><div class="ei">✅</div>Sin cotizaciones pendientes</div>';return;}
  grid.innerHTML=data.map(c=>{
    const items=c.cotizacion_items||[];
    window['it_'+c.id]=items.map(i=>({...i}));
    return`<div class="ac">
      <div class="ach">
        <div><div class="acn">#${c.numero} · ${new Date(c.created_at).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        <div class="acc">${c.cliente_nombre}</div><div class="acm">${c.cliente_rut||''} · ${c.forma_pago}</div></div>
        <span class="bdg bpend">PENDIENTE</span>
      </div>
      <div class="acb">
        <div class="act" id="at-${c.id}">${$$(c.total)}</div>
        <div class="ae-row"><label>Email cliente</label><input id="ae-${c.id}" type="email" placeholder="cliente@empresa.cl" value="${c.cliente_email||''}"></div>
        <div class="ie">
          ${items.map(item=>`<div class="ier">
            <div><div class="ieb">${item.marca||'SERV'}</div><div class="ien">${item.descripcion}</div><div class="ieq">Cant: ${item.cantidad}</div><div class="iet" id="it-${c.id}-${item.id}">${$$(item.total)}</div></div>
            <div><input class="iep" type="number" value="${item.precio_unit}" onchange="upAI(${c.id},${item.id},${item.cantidad},this.value)" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'"></div>
          </div>`).join('')}
        </div>
        <div class="arc"><span>Total con IVA</span><strong id="ar-${c.id}">${$$(c.total)}</strong></div>
        <div class="abtns">
          <button class="baprbtn" onclick="aprQ(${c.id},'${c.numero}','${c.cliente_nombre}')">✓ Aprobar</button>
          <button class="brejbtn" onclick="rejQ(${c.id})">✗ Rechazar</button>
        </div>
        <button class="apdf" onclick="dlAPDF(${c.id})">📄 Ver PDF</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('nb-a').textContent=data.length;
}

function upAI(cid,iid,qty,v){
  const pr=parseFloat(v)||0,items=window['it_'+cid],item=items?.find(i=>i.id===iid);
  if(item){item.precio_unit=pr;item.total=pr*qty;}
  const el=document.getElementById('it-'+cid+'-'+iid);if(el)el.textContent=$$(pr*qty);
  const neto=(items||[]).reduce((a,i)=>a+(i.total||0),0),total=neto+Math.round(neto*.19);
  const r=document.getElementById('ar-'+cid);if(r)r.textContent=$$(total);
  const t=document.getElementById('at-'+cid);if(t)t.textContent=$$(total);
}

async function dlAPDF(cid){
  const{data:cot}=await sb.from('cotizaciones').select('*').eq('id',cid).single();
  if(!cot)return;
  const items=(window['it_'+cid]||[]).map(i=>({...i,prod:{descripcion:i.descripcion,marca:i.marca,tipo_uso:'',foto_url:null,ic:i.marca==='SERVICIO'?'🔧':'🔵',nm:i.descripcion},tipo:i.marca==='SERVICIO'?'s':'n',up:i.precio_unit,qty:i.cantidad}));
  openPDF(buildPDF(cot,items));
}

async function aprQ(id,num,cli){
  const em=document.getElementById('ae-'+id)?.value?.trim()||'';
  const items=window['it_'+id]||[];
  for(const i of items)await sb.from('cotizacion_items').update({precio_unit:i.precio_unit,total:i.total}).eq('id',i.id);
  const neto=items.reduce((a,i)=>a+(i.total||0),0),iva=Math.round(neto*.19),total=neto+iva;
  await sb.from('cotizaciones').update({estado:'aprobada',aprobado_por:ME.id,aprobado_at:new Date().toISOString(),neto,iva,total,...(em?{cliente_email:em}:{})}).eq('id',id);
  showToast('✓ Cotización #'+num+' aprobada');
  loadApr();loadABadge();
  // Show PDF preview with send button
  const{data:cot}=await sb.from('cotizaciones').select('*').eq('id',id).single();
  if(cot){
    const pdfItems=(items||[]).map(i=>({...i,prod:{descripcion:i.descripcion,marca:i.marca,tipo_uso:'',foto_url:null,ic:i.marca==='SERVICIO'?'🔧':'🔵',nm:i.descripcion},tipo:i.marca==='SERVICIO'?'s':'n',up:i.precio_unit,qty:i.cantidad}));
    openPDF(buildPDF({...cot,neto,iva,total}, pdfItems), em, num, true);
  }
}

async function rejQ(id){await sb.from('cotizaciones').update({estado:'rechazada',aprobado_por:ME.id,aprobado_at:new Date().toISOString()}).eq('id',id);showToast('Cotización rechazada');loadApr();loadABadge();}

async function loadDash(){
  const mes=parseInt(document.getElementById('dmes')?.value||new Date().getMonth());
  const anio=new Date().getFullYear();
  const start=new Date(anio,mes,1).toISOString(),end=new Date(anio,mes+1,0,23,59,59).toISOString();
  const today=new Date().toISOString().split('T')[0];
  const[hoy,mesD,pend,crit,top]=await Promise.all([
    sb.from('cotizaciones').select('total').gte('created_at',today).eq('estado','aprobada'),
    sb.from('cotizaciones').select('numero,cliente_nombre,cliente_rut,total,neto,created_at').gte('created_at',start).lte('created_at',end).eq('estado','aprobada').order('created_at',{ascending:false}),
    sb.from('cotizaciones').select('id',{count:'exact',head:true}).eq('estado','pendiente'),
    sb.from('stock').select('producto_id').eq('cantidad',0),
    sb.from('cotizaciones').select('cliente_nombre,total').gte('created_at',start).lte('created_at',end).eq('estado','aprobada'),
  ]);
  const mh=(hoy.data||[]).reduce((a,c)=>a+(c.total||0),0);
  const mm=(mesD.data||[]).reduce((a,c)=>a+(c.total||0),0);
  document.getElementById('dh').textContent=(hoy.data||[]).length;
  document.getElementById('dhm').textContent=fmt(mh);
  document.getElementById('dm').textContent=fmt(mm);
  document.getElementById('dp').textContent=pend.count||0;
  document.getElementById('dc').textContent=(crit.data||[]).length;
  document.getElementById('dashtb').innerHTML=(mesD.data||[]).map(c=>`<tr>
    <td class="mn">#${c.numero}</td>
    <td><div style="font-weight:600">${c.cliente_nombre}</div><div style="font-size:10px;color:var(--g500)">${c.cliente_rut||''}</div></td>
    <td class="mn">${$$(c.total)}</td><td class="mn" style="color:var(--g500)">${$$(c.neto)}</td>
    <td style="font-size:11px">${new Date(c.created_at).toLocaleDateString('es-CL')}</td>
  </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--g500)">Sin cotizaciones aprobadas este mes</td></tr>';
  const cm={};(top.data||[]).forEach(c=>{cm[c.cliente_nombre]=(cm[c.cliente_nombre]||0)+(c.total||0);});
  const tl=Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('topcli').innerHTML=tl.length?tl.map(([n,t],i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--g100);">
      <div style="width:20px;height:20px;border-radius:50%;background:${i<3?'var(--red)':'var(--g200)'};color:${i<3?'white':'var(--g700)'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;">${i+1}</div>
      <div style="flex:1;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</div>
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green)">${fmt(t)}</div>
    </div>`).join(''):'<div style="text-align:center;padding:16px;color:var(--g500);font-size:12px;">Sin ventas este mes</div>';
}

function rPre(data){document.getElementById('pretb').innerHTML=data.slice(0,80).map(p=>`
  <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--g100);">
    <div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;">${p.marca||''} ${p.medida||''} ${p.modelo||''}</div><div style="font-size:10px;color:var(--g500)">Costo: ${$$(p.costo_unitario)}</div></div>
    <input type="number" value="${p.precio_venta}" style="width:110px;padding:6px 9px;border:1.5px solid var(--g200);border-radius:6px;font-family:var(--mono);font-size:12px;text-align:right;outline:none;" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'" onchange="svPr('${p.id}',this.value)">
  </div>`).join('');}
function fPre(q){rPre(PRODS.filter(p=>!q||p.descripcion?.toLowerCase().includes(q.toLowerCase())||p.marca?.toLowerCase().includes(q.toLowerCase())));}
async function svPr(id,v){const pr=parseFloat(v)||0;await sb.from('productos').update({precio_venta:pr}).eq('id',id);const p=PRODS.find(x=>x.id===id);if(p)p.precio_venta=pr;showToast('✓ Precio guardado');}

async function loadAll(){
  const tb = document.getElementById('alltb');
  tb.innerHTML = '<tr><td colspan="7"><div class="loading"><div class="spin"></div>Cargando...</div></td></tr>';
  const{data,error}=await sb.from('cotizaciones')
    .select('id,numero,cliente_nombre,cliente_rut,total,neto,estado,created_at,forma_pago,cliente_email')
    .order('created_at',{ascending:false})
    .limit(200);
  if(error||!data?.length){
    tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--g500)">Sin cotizaciones guardadas</td></tr>';
    return;
  }
  tb.innerHTML=data.map(c=>`<tr>
    <td class="mn">#${c.numero}</td>
    <td><div style="font-weight:600">${c.cliente_nombre||'—'}</div></td>
    <td style="font-size:11px;color:var(--g500)">${c.cliente_rut||'—'}</td>
    <td class="mn">${$$(c.total)}</td>
    <td><span class="bdg b${c.estado==='pendiente'?'pend':c.estado==='aprobada'?'aprov':c.estado==='rechazada'?'rech':'borr'}">${c.estado.toUpperCase()}</span></td>
    <td style="font-size:11px">${new Date(c.created_at).toLocaleDateString('es-CL')}</td>
    <td><button onclick="previewCot(${c.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--g500);" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--g500)'">📄</button></td>
  </tr>`).join('');
}

async function previewCot(id){
  const{data:cot}=await sb.from('cotizaciones').select('*,cotizacion_items(*)').eq('id',id).single();
  if(!cot)return;
  const items=(cot.cotizacion_items||[]).map(i=>({
    ...i,
    prod:{descripcion:i.descripcion,marca:i.marca,tipo_uso:'',foto_url:null,ic:'🔧',nm:i.descripcion},
    tipo:'n',up:i.precio_unit,qty:i.cantidad
  }));
  // Build fichas from product data
  let fichasHTML='';
  const prodIds=[...new Set(items.map(i=>i.producto_id).filter(Boolean))];
  if(prodIds.length>0){
    const modelMap={};
    prodIds.forEach(pid=>{const p=PRODS.find(x=>x.id===pid);if(p&&p.modelo&&p.marca){const k=p.marca+'|'+p.modelo+'|'+(p.medida||'');if(!modelMap[k])modelMap[k]={marca:p.marca,modelo:p.modelo,medida:p.medida||'',prod:p};}});
    if(Object.keys(modelMap).length>0){
      const{data:fichas}=await sb.from('fichas_tecnicas').select('*');
      Object.values(modelMap).forEach(m=>{
        const f=fichas?.find(ft=>ft.marca===m.marca&&ft.modelo===m.modelo&&(ft.medida||'')===(m.medida||''));
        fichasHTML+=buildFichaPage(f||{marca:m.marca,modelo:m.modelo,medida:m.medida,segmento:m.prod.tipo_vehiculo||'CAMION',aplicacion:m.prod.tipo_uso||''},[m.prod],fichas);
      });
    }
  }
  const isMgr=ROLE==='gerente'||ROLE==='admin';
  const pdfHTML=buildPDF(cot,items);
  const fullHTML=fichasHTML?pdfHTML.replace('</body></html>',fichasHTML+'</body></html>'):pdfHTML;
  openPDF(fullHTML, cot.cliente_email||'', cot.numero, isMgr&&!!cot.cliente_email);
}

// ── MODAL HELPERS ────────────────────────────────────────
// openModal, closeModal se importan desde ./core/ui.js

// ── NEW / EDIT CLIENTE ────────────────────────────────────
function openNewCli(){
  document.getElementById('modal-cli-title').textContent='Nuevo cliente';
  document.getElementById('cli-edit-id').value='';
  ['cli-nm','cli-rut','cli-em','cli-tel','cli-cnt','cli-dir','cli-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('cli-seg').value='PEQUEÑO';
  document.getElementById('cli-dc').value='30';
  openModal('modal-cli');
}

async function openEditCli(id){
  const c=CLIS.find(x=>x.id===id);
  if(!c)return;
  document.getElementById('modal-cli-title').textContent='Editar cliente';
  document.getElementById('cli-edit-id').value=c.id;
  document.getElementById('cli-nm').value=c.nombre||'';
  document.getElementById('cli-rut').value=c.rut||'';
  document.getElementById('cli-em').value=c.email||'';
  document.getElementById('cli-tel').value=c.telefono||'';
  document.getElementById('cli-cnt').value=c.contacto||'';
  document.getElementById('cli-dir').value=c.direccion||'';
  document.getElementById('cli-seg').value=c.segmento||'PEQUEÑO';
  document.getElementById('cli-dc').value=c.dias_credito||30;
  document.getElementById('cli-notas').value=c.notas||'';
  openModal('modal-cli');
}

async function saveCli(){
  const editId=document.getElementById('cli-edit-id').value;
  const nm=document.getElementById('cli-nm').value.trim();
  const rut=document.getElementById('cli-rut').value.trim();
  if(!nm||!rut){showToast('Nombre y RUT son obligatorios');return;}
  const payload={
    nombre:nm, rut:rut,
    email:document.getElementById('cli-em').value.trim()||null,
    telefono:document.getElementById('cli-tel').value.trim()||null,
    contacto:document.getElementById('cli-cnt').value.trim()||null,
    direccion:document.getElementById('cli-dir').value.trim()||null,
    segmento:document.getElementById('cli-seg').value,
    dias_credito:parseInt(document.getElementById('cli-dc').value)||30,
    notas:document.getElementById('cli-notas').value.trim()||null,
  };
  let error;
  if(editId){
    ({error}=await sb.from('clientes').update(payload).eq('id',editId));
  } else {
    ({error}=await sb.from('clientes').insert({...payload, total_ventas_2025:0}));
  }
  if(error){showToast('Error: '+error.message);return;}
  showToast(editId?'✓ Cliente actualizado':'✓ Cliente creado');
  closeModal('modal-cli');
  await loadClis();
  buildDL();
  rCli(CLIS);
}

// ── NEW / EDIT PRODUCTO ───────────────────────────────────
function openNewProd(){
  document.getElementById('modal-prod-title').textContent='Nuevo producto';
  document.getElementById('prod-edit-id').value='';
  document.getElementById('prod-id').disabled=false;
  ['prod-desc','prod-marca','prod-medida','prod-id','prod-modelo','prod-telas','prod-prof','prod-ic','prod-iv','prod-peso'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('prod-costo').value='';
  document.getElementById('prod-precio').value='';
  document.getElementById('prod-stk-q').value='0';
  document.getElementById('prod-stk-a').value='0';
  document.getElementById('prod-stk-l').value='0';
  document.getElementById('prod-tipo').value='DIRECCIONAL';
  document.getElementById('prod-veh').value='CAMION';
  openModal('modal-prod');
}

async function openEditProd(id){
  const p=PRODS.find(x=>x.id===id);
  if(!p)return;
  document.getElementById('modal-prod-title').textContent='Editar producto';
  document.getElementById('prod-edit-id').value=p.id;
  document.getElementById('prod-desc').value=p.descripcion||'';
  document.getElementById('prod-marca').value=p.marca||'';
  document.getElementById('prod-medida').value=p.medida||'';
  document.getElementById('prod-id').value=p.id;
  document.getElementById('prod-id').disabled=true;
  document.getElementById('prod-costo').value=p.costo_unitario||'';
  document.getElementById('prod-precio').value=p.precio_venta||'';
  document.getElementById('prod-tipo').value=p.tipo_uso||'DIRECCIONAL';
  document.getElementById('prod-veh').value=p.tipo_vehiculo||'CAMION';
  const s=SMAP[p.id]||{q:0,a:0,l:0};
  document.getElementById('prod-stk-q').value=s.q;
  document.getElementById('prod-stk-a').value=s.a;
  document.getElementById('prod-stk-l').value=s.l;
  document.getElementById('prod-modelo').value=p.modelo||'';
  document.getElementById('prod-telas').value=p.telas||'';
  document.getElementById('prod-prof').value=p.profundidad||'';
  document.getElementById('prod-ic').value=p.indice_carga||'';
  document.getElementById('prod-iv').value=p.indice_velocidad||'';
  document.getElementById('prod-peso').value=p.peso_kg||'';
  openModal('modal-prod');
}

async function saveProd(){
  const editId=document.getElementById('prod-edit-id').value;
  const desc=document.getElementById('prod-desc').value.trim();
  const marca=document.getElementById('prod-marca').value.trim().toUpperCase();
  const prodId=(editId||document.getElementById('prod-id').value.trim()||Date.now().toString());
  if(!desc||!marca){showToast('Descripción y marca son obligatorios');return;}
  const costo=parseFloat(document.getElementById('prod-costo').value)||0;
  const precio=parseFloat(document.getElementById('prod-precio').value)||Math.round(costo*1.35);
  const payload={
    id:prodId, descripcion:desc, marca, 
    medida:document.getElementById('prod-medida').value.trim()||null,
    tipo_uso:document.getElementById('prod-tipo').value,
    tipo_vehiculo:document.getElementById('prod-veh').value,
    costo_unitario:costo, precio_venta:precio,
    es_servicio:false, activo:true,
    modelo:document.getElementById('prod-modelo').value.trim().toUpperCase()||null,
    telas:document.getElementById('prod-telas').value.trim()||null,
    profundidad:document.getElementById('prod-prof').value.trim()||null,
    indice_carga:document.getElementById('prod-ic').value.trim()||null,
    indice_velocidad:document.getElementById('prod-iv').value.trim()||null,
    peso_kg:document.getElementById('prod-peso').value.trim()||null,
  };
  let error;
  if(editId){
    ({error}=await sb.from('productos').update(payload).eq('id',editId));
  } else {
    ({error}=await sb.from('productos').insert(payload));
  }
  if(error){showToast('Error: '+error.message);return;}
  // Save stock
  const bodegas=[
    {bodega:'SCN QUILICURA', cantidad:parseInt(document.getElementById('prod-stk-q').value)||0},
    {bodega:'BODEGA AUTO',   cantidad:parseInt(document.getElementById('prod-stk-a').value)||0},
    {bodega:'LOS ANDES',     cantidad:parseInt(document.getElementById('prod-stk-l').value)||0},
  ];
  let stkError=null;
  for(const b of bodegas){
    const{error:se}=await sb.from('stock').upsert({producto_id:prodId, bodega:b.bodega, cantidad:b.cantidad},{onConflict:'producto_id,bodega'});
    if(se){stkError=se;console.error('Stock upsert error:',b.bodega,se);}
  }
  showToast(stkError?'⚠️ Producto guardado pero error en stock: '+stkError.message:editId?'✓ Producto actualizado':'✓ Producto creado');
  closeModal('modal-prod');
  document.getElementById('prod-id').disabled=false;
  await Promise.all([loadProds(),loadSmap()]);
  renderCat();
  rStk(PRODS);
}

function rCrit(){
  const cr=PRODS.filter(p=>(SMAP[p.id]||{t:0}).t===0);
  const el=document.getElementById('critl');
  if(!cr.length){el.innerHTML='<div class="empty"><div class="ei">✅</div>No hay productos sin stock</div>';return;}
  el.innerHTML=cr.map(p=>`<div style="background:var(--red-l);border:1px solid #FCA5A5;border-radius:8px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">⚠️</span><div><div style="font-size:12px;font-weight:700;color:#9B0D22">${p.marca||''} — ${p.descripcion}</div><div style="font-size:11px;color:var(--red)">Medida: ${p.medida||'—'} · Sin stock en las 3 bodegas</div></div></div>`).join('');
}

// $$ (formatCLP) se importa desde ./core/utils.js
function fmt(n){return n>=1000000?'$'+(n/1000000).toFixed(1)+'M':$$(n);}
// showToast se importa desde ./core/ui.js

// ── IMPORTAR STOCK DESDE DEFONTANA ───────────────────────
const BODEGA_MAP = {
  'BODEGACENTRAL': 'SCN QUILICURA',
  'BODEGA_AUTO': 'BODEGA AUTO',
  'LA': 'LOS ANDES',
  'BODFOX001': 'BODEGA FOX',
  'BODEGA_RESERVAS': 'BODEGA RESERVAS',
};

async function handleImpFile(file) {
  if (!file) return;
  if (!file.name.endsWith('.csv')) { showToast('Solo archivos CSV'); return; }

  const status = document.getElementById('imp-status');
  const log = document.getElementById('imp-log');
  status.style.display = 'block';
  log.style.display = 'block';
  log.innerHTML = '';

  function addLog(msg, color) {
    log.innerHTML += '<div style="color:' + (color || 'var(--g700)') + '">' + msg + '</div>';
    log.scrollTop = log.scrollHeight;
  }

  status.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--amber-l);border:1px solid #FCD34D;border-radius:8px;margin-bottom:12px;"><div class="spin"></div><span style="font-size:12px;font-weight:600;color:#92400E;" id="imp-prog">Leyendo archivo...</span></div>';

  addLog('📂 Archivo: ' + file.name + ' (' + Math.round(file.size/1024) + ' KB)');

  try {
    const text = await file.text();
    const lines = text.split('\n').filter(function(l) { return l.trim(); });
    addLog('📋 ' + (lines.length - 1) + ' registros encontrados');

    // Parse CSV
    var records = [];
    var descMap = {}; // codArticulo -> descripcion completa
    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(';').map(function(c) { return c.replace(/"/g, '').replace(/'/g, '').replace(/\r/g, '').trim(); });
      if (cols.length < 5) continue;
      var codArticulo = cols[0];
      var descripcion = cols[1] || codArticulo;
      var codBodega = cols[2];
      var nombreBodega = BODEGA_MAP[codBodega] || cols[3];
      var stock = parseInt(cols[4]) || 0;
      records.push({ producto_id: codArticulo, bodega: nombreBodega, cantidad: stock });
      if (!descMap[codArticulo]) descMap[codArticulo] = descripcion;
    }

    addLog('✅ ' + records.length + ' registros parseados correctamente');

    // Helper: parse marca, medida, modelo and tipo_uso from id+description
    function parseProd(id, desc) {
      var tv = 'CAMION', tu = 'COMERCIAL';
      if      (id.startsWith('TBDIR')) { tv='CAMION'; tu='DIRECCIONAL'; }
      else if (id.startsWith('TBTRA')) { tv='CAMION'; tu='TRACCION'; }
      else if (id.startsWith('TBMIX')) { tv='CAMION'; tu='MIXTO'; }
      else if (id.startsWith('TBOFF')) { tv='CAMION'; tu='FAENERO'; }
      else if (id.startsWith('TBPIS')) { tv='CAMION'; tu='MIXTO'; }
      else if (id.startsWith('LLALU')||id.startsWith('LLFIE')||id.startsWith('LLPIS')) { tv='AUTO'; tu='LLANTA'; }
      else if (id.startsWith('CCCAM')||id.startsWith('CCCUB')) { tv='CAMION'; tu='CAMARA'; }
      else if (id.startsWith('OTIND')||id.startsWith('OTOFF')) { tv='CAMION'; tu='FAENERO'; }
      else if (id.startsWith('LT'))  { tv='AUTO'; tu='CITY/TOURING'; }
      else if (id.match(/^[0-9]/))   { tv='AUTO'; tu='CITY/TOURING'; }
      else if (id.startsWith('BT'))  { tv='AUTO'; tu='COMERCIAL'; }
      else if (id.startsWith('SC'))  { tv='CAMION'; tu='COMERCIAL'; }
      else if (id.startsWith('VA'))  { tv='CAMION'; tu='COMERCIAL'; }

      var clean = desc.replace(/^NEUM\s+/i,'').trim();
      var medidaMatch = clean.match(/\b[\d]{1,3}[./][\d]{1,3}[RrXx-][\d.]{2,6}[A-Z0-9]?\b/);
      var medida = medidaMatch ? medidaMatch[0] : '';

      var words = clean.split(/\s+/);
      var skipWords = new Set(['TL','TT','SET','XL','CH','L','B','PR','M+S','UN','3PMSF','FAE','VG','MI']);
      var marca = '';
      for (var w = words.length - 1; w >= 0; w--) {
        var wd = words[w].replace(/[^A-Za-z]/g,'');
        if (wd.length > 2 && !skipWords.has(wd.toUpperCase()) && /^[A-Za-z]+$/.test(wd)) { marca = wd.toUpperCase(); break; }
      }
      if (!marca) marca = 'SIN MARCA';

      var modelo = clean;
      if (medida) modelo = modelo.replace(medida,'');
      modelo = modelo.replace(new RegExp(marca+'.*$','i'),'').replace(/^\s*\d+PR\s*/,'').replace(/^[\s\-,]+|[\s\-,]+$/g,'').trim();

      return { marca, medida, modelo, tv, tu };
    }

    // Upsert ALL unique products from CSV (creates new + updates incomplete existing)
    var allIds = [...new Set(records.map(function(r){ return r.producto_id; }))];
    addLog('🔄 Sincronizando ' + allIds.length + ' productos...', 'var(--blue)');
    document.getElementById('imp-prog').textContent = 'Sincronizando productos...';

    var creados = 0, errCrear = 0;
    for (var ni = 0; ni < allIds.length; ni += 20) {
      var prodBatch = allIds.slice(ni, ni + 20).map(function(id) {
        var desc = descMap[id] || id;
        var p = parseProd(id, desc);
        return {
          id: id,
          descripcion: desc,
          marca: p.marca,
          medida: p.medida,
          modelo: p.modelo,
          tipo_uso: p.tu,
          tipo_vehiculo: p.tv,
          es_servicio: false,
          activo: true,
        };
      });
      var { error: insErr } = await sb.from('productos').upsert(prodBatch, { onConflict: 'id' });
      if (insErr) { errCrear += prodBatch.length; addLog('⚠️ Error sync lote: ' + insErr.message, 'var(--red)'); }
      else creados += prodBatch.length;
    }
    addLog('✅ ' + creados + ' productos sincronizados' + (errCrear ? ', ' + errCrear + ' errores' : ''), 'var(--green)');

    // Reload PRODS with updated data
    await loadProds();
    var matched = records.filter(function(r){ return new Set(PRODS.map(function(p){ return p.id; })).has(r.producto_id); });

    // First reset all stock to 0
    document.getElementById('imp-prog').textContent = 'Reseteando stock actual...';
    addLog('🔄 Reseteando stock actual a 0...');
    var { error: resetErr } = await sb.from('stock').update({ cantidad: 0 }).gte('cantidad', 0);
    if (resetErr) addLog('⚠️ Error reseteando: ' + resetErr.message, 'var(--red)');

    // Upsert in batches
    document.getElementById('imp-prog').textContent = 'Actualizando stock...';
    var batchSize = 50;
    var updated = 0;
    var errors = 0;

    for (var b = 0; b < matched.length; b += batchSize) {
      var batch = matched.slice(b, b + batchSize);
      var { error: batchErr } = await sb.from('stock').upsert(batch, { onConflict: 'producto_id,bodega' });
      if (batchErr) {
        errors += batch.length;
        addLog('❌ Error lote ' + Math.floor(b/batchSize + 1) + ': ' + batchErr.message, 'var(--red)');
      } else {
        updated += batch.length;
      }
      document.getElementById('imp-prog').textContent = 'Actualizando... ' + updated + '/' + matched.length;
    }

    // Reload stock map and refresh UI
    await Promise.all([loadProds(), loadSmap()]);
    rStk(PRODS);
    rCrit();
    renderCat();

    // Show summary
    var summary = '✅ Importación completada: ' + updated + ' registros actualizados';
    if (errors > 0) summary += ', ' + errors + ' errores';
    addLog(summary, 'var(--green)');
    addLog('📊 Stock total en sistema: ' + Object.keys(SMAP).length + ' productos con stock');

    status.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--green-l);border:1px solid #86EFAC;border-radius:8px;margin-bottom:12px;"><span style="font-size:16px;">✅</span><div><span style="font-size:12px;font-weight:600;color:var(--green);">' + summary + '</span><div style="font-size:11px;color:var(--g500);margin-top:2px;">Fecha: ' + new Date().toLocaleString('es-CL') + '</div></div></div>';

    showToast('✓ Stock importado — navegando a Stock...');
    setTimeout(()=>{ go('stk', document.querySelector('.nb[onclick*="stk"]')); }, 1500);

    // Update hist
    var hist = document.getElementById('imp-hist');
    hist.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--g50);border-radius:7px;margin-bottom:6px;"><span style="font-size:16px;">📄</span><div><div style="font-size:12px;font-weight:600;">' + file.name + '</div><div style="font-size:11px;color:var(--g500);">' + new Date().toLocaleString('es-CL') + ' · ' + updated + ' registros · ' + matched.length + ' productos</div></div></div>' + hist.innerHTML;

  } catch(e) {
    addLog('❌ Error: ' + e.message, 'var(--red)');
    status.innerHTML = '<div style="padding:12px;background:var(--red-l);border:1px solid #FCA5A5;border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--red-d);font-weight:600;">❌ Error: ' + e.message + '</div>';
  }

  document.getElementById('imp-file').value = '';
}

// ── FICHAS TÉCNICAS CRUD ────────────────────────────────
let FICHAS=[],FIC_SEG='',FIC_Q='';

async function loadFichas(){
  const{data}=await sb.from('fichas_tecnicas').select('*').order('marca');
  FICHAS=data||[];
  rFic(FICHAS);
}

function rFic(list){
  const filtered=list.filter(f=>{
    if(FIC_SEG&&f.segmento!==FIC_SEG)return false;
    if(FIC_Q){const q=FIC_Q.toLowerCase();if(!f.marca?.toLowerCase().includes(q)&&!f.modelo?.toLowerCase().includes(q)&&!f.nombre_comercial?.toLowerCase().includes(q))return false;}
    return true;
  });
  const tb=document.getElementById('fictb');
  if(!filtered.length){tb.innerHTML='<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--g500)">Sin fichas técnicas</td></tr>';return;}
  tb.innerHTML=filtered.map(f=>{
    const campos=[f.telas,f.profundidad,f.li_ss,f.peso,f.indice_velocidad,f.medidas_disponibles];
    const filled=campos.filter(Boolean).length;
    const total=f.segmento==='CAMION'?5:5;
    const pct=Math.round(filled/total*100);
    const stColor=pct>=80?'var(--green)':pct>=50?'var(--amber)':'var(--red)';
    return `<tr>
      <td style="font-weight:700;color:var(--red);font-size:11px;">${f.marca}</td>
      <td style="font-weight:700;">${f.modelo}</td>
      <td style="font-size:11px;color:var(--g600);">${f.nombre_comercial||'—'}</td>
      <td><span style="background:${f.segmento==='CAMION'?'#0F172A':'#64748B'};color:white;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;">${f.segmento}</span></td>
      <td style="font-size:11px;">${f.aplicacion||'—'}</td>
      <td style="font-size:11px;">${f.telas||'<span style="color:var(--g300)">—</span>'}</td>
      <td style="font-size:11px;">${f.li_ss||'<span style="color:var(--g300)">—</span>'}</td>
      <td style="font-size:11px;">${f.peso||'<span style="color:var(--g300)">—</span>'}</td>
      <td><span style="font-size:10px;font-weight:700;color:${stColor};">${pct}%</span></td>
      <td><button onclick="openEditFic('${f.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Editar">✏️</button></td>
    </tr>`;
  }).join('');
}

function fFic(q){FIC_Q=q;rFic(FICHAS);}
function setFicSeg(v,btn){FIC_SEG=v;document.querySelectorAll('#fic-seg-chips .chip').forEach(b=>b.classList.remove('on'));btn.classList.add('on');rFic(FICHAS);}

function cancelFic(){
  closeModal('modal-fic');
  // Si veníamos del cotizador, volver a abrir el panel de fichas
  if(_ficqReturnAfterSave){
    _ficqReturnAfterSave=false;
    setTimeout(renderFicQ,200);
  }
}

async function upFicImg(event){
  const input=event.target;
  const file=input.files&&input.files[0];if(!file)return;
  input.disabled=true;
  showToast('Subiendo imagen…');
  try{
    const comp=await compImg(file,900);
    const marca=cleanPathPart((document.getElementById('fic-marca').value||'fic').toUpperCase().trim());
    const modelo=cleanPathPart((document.getElementById('fic-modelo').value||'mod').toUpperCase().trim());
    const fn=uniqueJpgPath('fichas','fic_'+marca+'_'+modelo);
    const{error:upErr}=await sb.storage.from('fotos-neumaticos').upload(fn,comp,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
    if(upErr){showToast('Error al subir: '+upErr.message);console.error('Storage ficha error:',upErr);return;}
    const{data:ud}=sb.storage.from('fotos-neumaticos').getPublicUrl(fn);
    const url=ud.publicUrl;
    document.getElementById('fic-img').value=url;
    const prev=document.getElementById('fic-img-preview');
    prev.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    showToast('✓ Imagen subida');
  }catch(e){showToast('Error: '+e.message);console.error(e);}
  finally{input.value='';input.disabled=false;}
}

function ficSegChange(){
  const seg=document.getElementById('fic-segmento').value;
  const aplSel=document.getElementById('fic-aplicacion');
  const tireFields=document.getElementById('fic-tire-fields');
  const llantaFields=document.getElementById('fic-llanta-fields');
  if(seg==='CAMION'){
    aplSel.innerHTML='<option value="DIRECCIONAL">Direccional</option><option value="TRACCION">Tracción</option><option value="MIXTO">Mixto</option><option value="FAENERO">Faenero</option>';
    tireFields.style.display='grid';
    llantaFields.style.display='none';
  } else if(seg==='AUTO'){
    aplSel.innerHTML='<option value="CITY/TOURING">City/Touring</option><option value="SPORT">Sport</option><option value="SUV">SUV</option><option value="ALL TERRAIN">All Terrain</option><option value="MUD TERRAIN">Mud Terrain</option><option value="COMERCIAL">Comercial</option>';
    tireFields.style.display='grid';
    llantaFields.style.display='none';
  } else {
    // LLANTA
    aplSel.innerHTML='<option value="LLANTA">Llanta</option>';
    tireFields.style.display='none';
    llantaFields.style.display='block';
  }
}

let _ficqModels=[];
async function openFicQ(){
  // Cerrar cualquier modal abierto antes de abrir ficq
  closeModal('modal-fic');
  _ficqReturnAfterSave=false;
  const seen=new Set();
  _ficqModels=[];
  Q.filter(i=>i.tipo==='n').forEach(i=>{
    const key=(i.prod.marca||'')+'|'+(i.prod.modelo||'')+'|'+(i.prod.medida||'');
    if(!seen.has(key)){seen.add(key);_ficqModels.push({marca:i.prod.marca||'',modelo:i.prod.modelo||'',medida:i.prod.medida||''});}
  });
  if(!_ficqModels.length){showToast('No hay neumáticos en la cotización');return;}
  await renderFicQ();
}

async function renderFicQ(){
  document.getElementById('modal-ficq')?.remove();
  let fichas=[];
  try{const{data}=await sb.from('fichas_tecnicas').select('*');fichas=data||[];}catch(e){console.error('Error cargando fichas:',e);}
  const wrap=document.createElement('div');
  wrap.id='modal-ficq';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:center;justify-content:center;';
  const inner=document.createElement('div');
  inner.style.cssText='background:white;border-radius:14px;width:min(560px,95vw);max-height:80vh;overflow-y:auto;padding:20px;';
  inner.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <span style="font-size:15px;font-weight:700;">📑 Fichas técnicas de esta cotización</span>
    <button id="ficq-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8;">✕</button>
  </div>`;
  _ficqModels.forEach((m,idx)=>{
    const f=fichas?.find(x=>x.marca===m.marca&&x.modelo===m.modelo&&(x.medida||'')===(m.medida||''));
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1.5px solid #E2E8F0;border-radius:8px;margin-bottom:8px;';
    const status=f
      ?'<span style="color:#16A34A;font-size:11px;font-weight:600;">✅ Completa</span>'
      :'<span style="color:#DC2626;font-size:11px;font-weight:600;">⚠️ Sin ficha</span>';
    row.innerHTML=`
      <div>
        <div style="font-weight:700;font-size:13px;">${m.marca||'—'} <span style="color:#C8102E;">${m.modelo||'Sin modelo'}</span></div>
        <div style="font-size:11px;color:#64748B;">${m.medida||'Sin medida'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">${status}
        <button data-idx="${idx}" data-fid="${f?.id||''}" class="ficq-btn" style="padding:6px 12px;background:${f?'#2563EB':'#C8102E'};color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">${f?'✏️ Editar':'+ Crear'}</button>
      </div>`;
    inner.appendChild(row);
  });
  wrap.appendChild(inner);
  document.body.appendChild(wrap);
  // Events
  document.getElementById('ficq-close').onclick=()=>wrap.remove();
  wrap.querySelectorAll('.ficq-btn').forEach(btn=>{
    btn.onclick=async()=>{
      const idx=parseInt(btn.dataset.idx);
      const fid=btn.dataset.fid;
      const m=_ficqModels[idx];
      wrap.remove();
      if(fid){
        const{data:f}=await sb.from('fichas_tecnicas').select('*').eq('id',fid).single();
        if(f){FICHAS=[...FICHAS.filter(x=>x.id!==f.id),f];openEditFic(f.id);}
      } else {
        _ficqReturnAfterSave=true;
        openFicModal(m.marca,m.modelo,m.medida);
      }
    };
  });
}

let _ficqReturnAfterSave=false;

function openFicModal(marcaPre='',modeloPre='',medidaPre=''){
  document.getElementById('modal-fic-title').textContent='Nueva ficha técnica';
  document.getElementById('fic-edit-id').value='';
  ['fic-marca','fic-modelo','fic-medida','fic-origen','fic-telas','fic-prof','fic-liss','fic-peso','fic-iv','fic-agujeros','fic-diametro','fic-buje','fic-material','fic-acabado','fic-ensamble','fic-img','fic-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('fic-segmento').value='CAMION';
  // Buscar si ya hay imagen del modelo (en fichas O en productos) para pre-mostrarla
  const M=marcaPre?.toUpperCase().trim(), MO=modeloPre?.toUpperCase().trim();
  const existImg=marcaPre&&modeloPre?
    (FICHAS.find(x=>x.marca?.toUpperCase().trim()===M&&x.modelo?.toUpperCase().trim()===MO&&x.imagen_url)?.imagen_url
    || PRODS.find(p=>p.marca?.toUpperCase().trim()===M&&p.modelo?.toUpperCase().trim()===MO&&p.foto_url)?.foto_url)
    :null;
  const prev=document.getElementById('fic-img-preview');
  if(existImg){prev.innerHTML=`<img src="${existImg}" style="width:100%;height:100%;object-fit:cover;">`;document.getElementById('fic-img').value=existImg;}
  else{prev.innerHTML='🛞';}
  ficSegChange();
  if(marcaPre) document.getElementById('fic-marca').value=marcaPre;
  if(modeloPre) document.getElementById('fic-modelo').value=modeloPre;
  if(medidaPre) document.getElementById('fic-medida').value=medidaPre;
  const marcas=[...new Set(PRODS.map(p=>p.marca).filter(Boolean))].sort();
  document.getElementById('fic-marcas-dl').innerHTML=marcas.map(m=>`<option value="${m}">`).join('');
  openModal('modal-fic');
}

function openEditFic(id){
  const f=FICHAS.find(x=>x.id===id);if(!f)return;
  document.getElementById('modal-fic-title').textContent='Editar ficha: '+f.marca+' '+f.modelo+(f.medida?' '+f.medida:'');
  document.getElementById('fic-edit-id').value=f.id;
  document.getElementById('fic-marca').value=f.marca||'';
  document.getElementById('fic-modelo').value=f.modelo||'';
  document.getElementById('fic-medida').value=f.medida||'';
  document.getElementById('fic-segmento').value=f.segmento||'CAMION';
  ficSegChange();
  if(f.aplicacion)document.getElementById('fic-aplicacion').value=f.aplicacion;
  document.getElementById('fic-origen').value=f.origen||'';
  document.getElementById('fic-telas').value=f.telas||'';
  document.getElementById('fic-prof').value=f.profundidad||'';
  document.getElementById('fic-liss').value=f.li_ss||'';
  document.getElementById('fic-peso').value=f.peso||'';
  document.getElementById('fic-iv').value=f.indice_velocidad||'';
  document.getElementById('fic-agujeros').value=f.numero_agujeros||'';
  document.getElementById('fic-diametro').value=f.diametro_agujeros||'';
  document.getElementById('fic-buje').value=f.buje||'';
  document.getElementById('fic-material').value=f.material||'';
  document.getElementById('fic-acabado').value=f.acabado||'';
  document.getElementById('fic-ensamble').value=f.ensamble||'';
  document.getElementById('fic-img').value=f.imagen_url||'';
  const prev=document.getElementById('fic-img-preview');
  if(f.imagen_url){prev.innerHTML=`<img src="${f.imagen_url}" style="width:100%;height:100%;object-fit:cover;">`;}
  else{prev.innerHTML='🛞';}
  document.getElementById('fic-notas').value=f.notas||'';
  const marcas=[...new Set(PRODS.map(p=>p.marca).filter(Boolean))].sort();
  document.getElementById('fic-marcas-dl').innerHTML=marcas.map(m=>`<option value="${m}">`).join('');
  openModal('modal-fic');
}

async function saveFic(){
  const id=document.getElementById('fic-edit-id').value;
  const obj={
    marca:document.getElementById('fic-marca').value.toUpperCase().trim(),
    modelo:document.getElementById('fic-modelo').value.toUpperCase().trim(),
    medida:document.getElementById('fic-medida').value.trim()||null,
    segmento:document.getElementById('fic-segmento').value,
    aplicacion:document.getElementById('fic-aplicacion').value,
    origen:document.getElementById('fic-origen').value.trim()||null,
    telas:document.getElementById('fic-telas').value.trim()||null,
    profundidad:document.getElementById('fic-prof').value.trim()||null,
    li_ss:document.getElementById('fic-liss').value.trim()||null,
    peso:document.getElementById('fic-peso').value.trim()||null,
    indice_velocidad:document.getElementById('fic-iv').value.trim()||null,
    numero_agujeros:document.getElementById('fic-agujeros').value.trim()||null,
    diametro_agujeros:document.getElementById('fic-diametro').value.trim()||null,
    buje:document.getElementById('fic-buje').value.trim()||null,
    material:document.getElementById('fic-material').value.trim()||null,
    acabado:document.getElementById('fic-acabado').value.trim()||null,
    ensamble:document.getElementById('fic-ensamble').value.trim()||null,
    imagen_url:document.getElementById('fic-img').value.trim()||null,
    notas:document.getElementById('fic-notas').value.trim()||null,
    updated_at:new Date().toISOString(),
  };
  if(!obj.marca||!obj.modelo){showToast('Marca y modelo son obligatorios');return;}
  let error;
  try{
    if(id){({error}=await sb.from('fichas_tecnicas').update(obj).eq('id',id));}
    else{({error}=await sb.from('fichas_tecnicas').insert(obj));}
  }catch(e){showToast('Error JS: '+e.message);console.error(e);return;}
  if(error){showToast('❌ '+error.message);console.error('Supabase error:',error);return;}
  // La foto es por modelo — sincronizar a TODAS las fichas Y productos del mismo (marca, modelo)
  if(obj.imagen_url){
    try{
      await sb.from('fichas_tecnicas').update({imagen_url:obj.imagen_url}).ilike('marca',obj.marca).ilike('modelo',obj.modelo);
      await sb.from('productos').update({foto_url:obj.imagen_url}).ilike('marca',obj.marca).ilike('modelo',obj.modelo);
    }catch(e){console.warn('Sync foto ficha→productos falló (no crítico):',e);}
    // Actualizar caches locales
    PRODS.forEach(p=>{if(p.marca&&p.modelo&&p.marca.toUpperCase().trim()===obj.marca&&p.modelo.toUpperCase().trim()===obj.modelo)p.foto_url=obj.imagen_url;});
  }
  showToast(id?'✓ Ficha actualizada':'✓ Ficha creada');
  closeModal('modal-fic');
  loadFichas();
  if(_ficqReturnAfterSave){_ficqReturnAfterSave=false;setTimeout(renderFicQ,300);}
}

init();

// ============================================================
// EXPONER FUNCIONES A WINDOW
// (necesario para que los onclick="foo()" inline en HTML funcionen)
// En Fase 3 las reemplazaremos por addEventListener para no contaminar window.
// ============================================================
Object.assign(window, {
  // Auth
  doLogin, doLogout,
  // Navegación / UI
  go, setTab, setFS, st2, sb2sel, sb2mob, toggleSidebar, toggleMobCart,
  closeModal, closePDFModal, fp,
  // Cotizador
  addI, rmI, chQty, setQty, upP, clearQ, sendAppr, genPDF,
  // Productos
  openNewProd, openEditProd, saveProd, upPhoto, fStk, fPre, svPr,
  // Clientes
  openNewCli, openEditCli, saveCli, fCli, aFill,
  // Fichas técnicas
  openFicModal, openEditFic, openFicQ, saveFic, cancelFic, ficSegChange, setFicSeg, upFicImg, fFic,
  // Aprobaciones / cotizaciones
  aprQ, rejQ, previewCot, dlAPDF,
  // PDF / email
  downloadPDF, sendEmailFromPreview,
  // Importar
  handleImpFile, upAI,
  // Dashboard
  loadDash
});

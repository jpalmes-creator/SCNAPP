// ============================================================
// MÓDULO PDF — Generación del HTML del PDF de cotización
// y de la ficha técnica que aparece al final.
// Funciones puras: reciben datos, retornan strings HTML.
// ============================================================

import { SCN_LOGO } from './logo.js';
import { $$ } from './utils.js';

// ============================================================
// buildPDF(cot, items) → HTML completo del PDF de cotización
// ============================================================
export function buildPDF(cot,items){
  const fecha=new Date(cot.created_at||Date.now()).toLocaleDateString('es-CL');
  const tc2={DIRECCIONAL:'#1D4ED8',TRACCION:'#C2410C',MIXTO:'#7C3AED',FAENERO:'#065F46','CITY/TOURING':'#0369A1',SPORT:'#BE185D',SUV:'#047857','ALL TERRAIN':'#92400E','MUD TERRAIN':'#991B1B',COMERCIAL:'#6D28D9',LLANTA:'#475569',CAMARA:'#475569'};
  const tb2={DIRECCIONAL:'#EFF6FF',TRACCION:'#FFF7ED',MIXTO:'#F5F3FF',FAENERO:'#ECFDF5','CITY/TOURING':'#F0F9FF',SPORT:'#FDF2F8',SUV:'#ECFDF5','ALL TERRAIN':'#FFF7ED','MUD TERRAIN':'#FEF2F2',COMERCIAL:'#F5F3FF',LLANTA:'#F1F5F9',CAMARA:'#F1F5F9'};
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:12px;color:#0F172A;margin:0;padding:20px;}table{border-collapse:collapse;width:100%;}@media print{body{padding:0;}@page{margin:1cm;}}</style></head><body>
<table style="margin-bottom:0;border-collapse:collapse;width:100%;background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:8px;"><tr>
<td style="vertical-align:middle;padding:12px 16px;" width="56%">
<img src="${SCN_LOGO}" style="height:62px;object-fit:contain;display:block;margin-bottom:5px;">
<div style="font-size:9px;color:#475569;">Comercializadora de Neumáticos Ltda. · RUT: 77.205.630-3</div>
<div style="font-size:9px;color:#475569;">Carretera Gral. San Martín 9360, Bodega 6, Quilicura</div>
<div style="font-size:9px;color:#475569;">Tel: 228448878 · +569 96321721</div>
</td>
<td style="vertical-align:middle;text-align:right;padding:12px 16px;" width="44%">
<table style="margin-left:auto;border-collapse:collapse;background:#C8102E;border-radius:6px;">
<tr><td style="padding:10px 28px;text-align:center;">
<div style="font-size:9px;font-weight:700;color:white;letter-spacing:.12em;text-transform:uppercase;">Cotización</div>
<div style="font-size:26px;font-weight:700;color:white;">#${cot.numero}</div>
</td></tr></table>
<div style="font-size:11px;color:#475569;text-align:right;margin-top:5px;">Fecha: <strong>${fecha}</strong></div>
</td></tr></table>
<div style="background:#C8102E;height:3px;margin:10px 0;"></div>
<table style="margin-bottom:10px;background:#F8FAFC;border:1px solid #E2E8F0;"><tr>
<td style="padding:9px 14px;border-right:1px solid #E2E8F0;" width="40%"><div style="font-size:9px;font-weight:700;color:#64748B;margin-bottom:2px;">SEÑORES</div><div style="font-size:13px;font-weight:700;">${cot.cliente_nombre||'—'}</div></td>
<td style="padding:9px 14px;border-right:1px solid #E2E8F0;" width="20%"><div style="font-size:9px;font-weight:700;color:#64748B;margin-bottom:2px;">RUT</div><div>${cot.cliente_rut||'—'}</div></td>
<td style="padding:9px 14px;border-right:1px solid #E2E8F0;" width="20%"><div style="font-size:9px;font-weight:700;color:#64748B;margin-bottom:2px;">ATENCIÓN</div><div>${cot.cliente_contacto||'—'}</div></td>
<td style="padding:9px 14px;" width="20%"><div style="font-size:9px;font-weight:700;color:#64748B;margin-bottom:2px;">FORMA DE PAGO</div><div>${cot.forma_pago||'—'}</div></td>
</tr></table>
<table><thead><tr style="background:#0F172A;color:white;">
<th style="padding:7px 8px;text-align:center;font-size:9px;" width="5%">CANT.</th>
<th style="padding:7px 8px;text-align:center;font-size:9px;" width="12%">FOTO</th>
<th style="padding:7px 8px;text-align:left;font-size:9px;">DESCRIPCIÓN</th>
<th style="padding:7px 8px;text-align:center;font-size:9px;" width="12%">TIPO</th>
<th style="padding:7px 8px;text-align:right;font-size:9px;" width="14%">P.UNIT.</th>
<th style="padding:7px 8px;text-align:right;font-size:9px;" width="14%">TOTAL</th>
</tr></thead><tbody>
${items.map((item,i)=>{
  const isN=item.tipo==='n';
  const tipo=isN?item.prod.tipo_uso:'';
  const foto=isN&&item.prod.foto_url?`<img src="${item.prod.foto_url}" style="width:70px;height:70px;object-fit:contain;border-radius:4px;">`:isN?'<span style="font-size:30px;">🛞</span>':`<span style="font-size:22px;">${item.prod.ic||'🔧'}</span>`;
  const desc=isN?'NEUM '+(item.prod.descripcion||''):(item.prod.nm||'');
  const marca=isN?(item.prod.marca||''):'SERVICIO';
  const tipoCell=isN?`<span style="background:${tb2[tipo]||'#F1F5F9'};color:${tc2[tipo]||'#64748B'};padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;">${tipo}</span>`:'<span style="background:#F1F5F9;color:#64748B;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;">SERVICIO</span>';
  return`<tr style="background:${i%2===0?'#fff':'#F8FAFC'};border-bottom:1px solid #E2E8F0;">
<td style="padding:8px;text-align:center;font-weight:700;">${item.qty}</td>
<td style="padding:8px;text-align:center;">${foto}</td>
<td style="padding:8px;"><div style="font-size:10px;font-weight:700;color:#C8102E;text-transform:uppercase;">${marca}</div><div style="font-size:11px;font-weight:600;">${desc}</div></td>
<td style="padding:8px;text-align:center;">${tipoCell}</td>
<td style="padding:8px;text-align:right;font-family:monospace;">${$$(item.up||0)}</td>
<td style="padding:8px;text-align:right;font-family:monospace;font-weight:700;">${$$((item.up||0)*item.qty)}</td>
</tr>`;}).join('')}
</tbody></table>
<div style="background:#FFFBEB;border:1px solid #FCD34D;padding:5px;text-align:center;font-size:10px;font-weight:700;color:#92400E;margin-bottom:12px;">DISPONIBILIDAD INMEDIATA</div>
<table><tr>
<td style="vertical-align:top;" width="52%">
<div style="font-size:10px;color:#64748B;margin-bottom:4px;"><strong>Plazos de pago:</strong> ${cot.forma_pago} · <span style="color:#C8102E;font-weight:700;">Cotización válida por 3 días hábiles.</span></div>
<div style="font-size:9px;color:#94A3B8;line-height:1.6;">Valores más IVA. Cotización sujeta a disponibilidad de stock.<br>El pago puede ser en efectivo, tarjeta, cheque o transferencia bancaria.<br>Los cheques deben ser cruzados, nominativos a Comercializadora de Neumáticos Ltda.<br>Para facturar: RUT original, fotocopia legalizada y OC.</div>
</td><td width="4%"></td>
<td width="44%">
<table style="width:100%;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;">
<tr><td style="padding:6px 12px;font-size:11px;color:#64748B;border-bottom:1px solid #E2E8F0;">NETO</td><td style="padding:6px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #E2E8F0;">${$$(cot.neto)}</td></tr>
<tr><td style="padding:6px 12px;font-size:11px;color:#64748B;border-bottom:1px solid #E2E8F0;">IVA 19%</td><td style="padding:6px 12px;text-align:right;font-family:monospace;border-bottom:1px solid #E2E8F0;">${$$(cot.iva)}</td></tr>
<tr style="background:#0F172A;"><td style="padding:8px 12px;font-size:13px;font-weight:700;color:white;border-radius:0 0 0 5px;">TOTAL</td><td style="padding:8px 12px;text-align:right;font-family:monospace;font-size:14px;font-weight:700;color:white;border-radius:0 0 5px 0;">${$$(cot.total)}</td></tr>
</table>
<div style="text-align:center;margin-top:12px;padding-top:10px;border-top:1px solid #E2E8F0;">
<div style="font-size:11px;font-weight:700;">GISSELLE CONCHA</div>
<div style="font-size:10px;color:#64748B;">Teléfono Móvil +569 96321721</div>
</div></td></tr></table></body></html>`;
}


// ============================================================
// buildFichaPage(f, prods, allFichas) → HTML de UNA ficha técnica
// ============================================================
export function buildFichaPage(f, prods, allFichas){
  const posColor={DIRECCIONAL:'#1D4ED8',TRACCION:'#C2410C',MIXTO:'#7C3AED',FAENERO:'#065F46','CITY/TOURING':'#0369A1',SPORT:'#BE185D',SUV:'#047857','ALL TERRAIN':'#92400E','MUD TERRAIN':'#991B1B',COMERCIAL:'#6D28D9'};
  const posBg={DIRECCIONAL:'#EFF6FF',TRACCION:'#FFF7ED',MIXTO:'#F5F3FF',FAENERO:'#ECFDF5','CITY/TOURING':'#F0F9FF',SPORT:'#FDF2F8',SUV:'#ECFDF5','ALL TERRAIN':'#FFF7ED','MUD TERRAIN':'#FEF2F2',COMERCIAL:'#F5F3FF'};
  const pc=posColor[f.aplicacion]||'#64748B';
  const pb=posBg[f.aplicacion]||'#F1F5F9';
  // Foto es por modelo — si esta ficha no tiene, buscar en otra del mismo modelo
  // Prioridad: imagen propia de la ficha → imagen de otra ficha del mismo modelo → foto del producto
  const imgUrl=f.imagen_url
    ||(allFichas||[]).find(x=>x.marca===f.marca&&x.modelo===f.modelo&&x.imagen_url)?.imagen_url
    ||(prods||[]).find(p=>p&&p.foto_url)?.foto_url
    ||null;
  const isCamion=f.segmento==='CAMION';
  let rows='';
  const addRow=(label,val,bg)=>{rows+=`<tr style="background:${bg?'#F8FAFC':'white'};"><td style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748B;border-bottom:1px solid #E2E8F0;width:40%;">${label}</td><td style="padding:8px 12px;font-size:12px;font-weight:600;color:${val?'#0F172A':'#CBD5E1'};${val?'':'font-style:italic;'}border-bottom:1px solid #E2E8F0;">${val||'Por completar'}</td></tr>`;};
  addRow('Diseño (Modelo)',f.modelo,true);
  addRow('Aplicación',f.aplicacion,false);
  if(f.nombre_comercial)addRow('Línea',f.nombre_comercial,true);
  if(f.origen)addRow('Origen',f.origen,false);
  // Single-medida specs (new schema: one ficha per medida)
  const medida=f.medida||(prods?.[0]?.medida)||'';
  const telas=f.telas||'';
  const profundidad=f.profundidad||'';
  const li_ss=f.li_ss||'';
  const peso=f.peso||'';
  const iv=f.indice_velocidad||'';
  const isLlanta=f.segmento==='LLANTA'||f.aplicacion==='LLANTA';
  let prodTable='';
  if(isLlanta){
    // Ficha de llanta
    const agujeros=f.numero_agujeros||'';
    const diametro=f.diametro_agujeros||'';
    const buje=f.buje||'';
    const material=f.material||'';
    const acabado=f.acabado||'';
    const ensamble=f.ensamble||'';
    if(medida||agujeros||diametro||buje||material||acabado||ensamble){
      prodTable=`<div style="margin-top:10px;"><div style="font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">ESPECIFICACIONES</div>
      <table style="width:100%;border:1px solid #E2E8F0;border-collapse:collapse;font-size:9px;">
      <thead><tr style="background:#0F172A;color:white;"><th style="padding:4px 6px;text-align:left;">Medida</th><th style="padding:4px 6px;text-align:center;">N° Agujeros</th><th style="padding:4px 6px;text-align:center;">Diám. Agujeros</th><th style="padding:4px 6px;text-align:center;">Buje</th><th style="padding:4px 6px;text-align:center;">Material</th><th style="padding:4px 6px;text-align:center;">Acabado</th><th style="padding:4px 6px;text-align:center;">Ensamble</th></tr></thead>
      <tbody><tr style="background:white;">
        <td style="padding:4px 6px;font-weight:600;">${medida||'—'}</td>
        <td style="padding:4px 6px;text-align:center;color:${agujeros?'#0F172A':'#CBD5E1'};">${agujeros||'—'}</td>
        <td style="padding:4px 6px;text-align:center;color:${diametro?'#0F172A':'#CBD5E1'};">${diametro||'—'}</td>
        <td style="padding:4px 6px;text-align:center;color:${buje?'#0F172A':'#CBD5E1'};">${buje||'—'}</td>
        <td style="padding:4px 6px;text-align:center;color:${material?'#0F172A':'#CBD5E1'};">${material||'—'}</td>
        <td style="padding:4px 6px;text-align:center;color:${acabado?'#0F172A':'#CBD5E1'};">${acabado||'—'}</td>
        <td style="padding:4px 6px;text-align:center;color:${ensamble?'#0F172A':'#CBD5E1'};">${ensamble||'—'}</td>
      </tr></tbody></table></div>`;
    }
  } else if(medida||telas||profundidad||li_ss||peso||iv){
    if(isCamion){
      prodTable=`<div style="margin-top:10px;"><div style="font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">ESPECIFICACIONES</div>
      <table style="width:100%;border:1px solid #E2E8F0;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#0F172A;color:white;"><th style="padding:5px 8px;text-align:left;">Medida</th><th style="padding:5px 8px;text-align:center;">Telas</th><th style="padding:5px 8px;text-align:center;">IC/SS</th><th style="padding:5px 8px;text-align:center;">Profundidad</th><th style="padding:5px 8px;text-align:center;">Peso</th></tr></thead>
      <tbody><tr style="background:white;border-bottom:1px solid #E2E8F0;">
        <td style="padding:5px 8px;font-weight:600;">${medida||'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${telas?'#0F172A':'#CBD5E1'};">${telas||'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${li_ss?'#0F172A':'#CBD5E1'};">${li_ss||'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${profundidad?'#0F172A':'#CBD5E1'};">${profundidad||'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${peso?'#0F172A':'#CBD5E1'};">${peso?peso+' kg':'—'}</td>
      </tr></tbody></table></div>`;
    } else {
      prodTable=`<div style="margin-top:10px;"><div style="font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">ESPECIFICACIONES</div>
      <table style="width:100%;border:1px solid #E2E8F0;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#0F172A;color:white;"><th style="padding:5px 8px;text-align:left;">Medida</th><th style="padding:5px 8px;text-align:center;">LI/SS</th><th style="padding:5px 8px;text-align:center;">Índ. Velocidad</th><th style="padding:5px 8px;text-align:center;">Peso</th></tr></thead>
      <tbody><tr style="background:white;border-bottom:1px solid #E2E8F0;">
        <td style="padding:5px 8px;font-weight:600;">${medida||'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${li_ss?'#0F172A':'#CBD5E1'};">${li_ss||'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${iv?'#0F172A':'#CBD5E1'};">${iv||'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${peso?'#0F172A':'#CBD5E1'};">${peso?peso+' kg':'—'}</td>
      </tr></tbody></table></div>`;
    }
  }
  if(f.notas)rows+=`<tr><td colspan="2" style="padding:6px 10px;font-size:10px;color:#64748B;background:#FFFBEB;border-top:1px solid #FCD34D;">📝 ${f.notas}</td></tr>`;
  return `<div style="margin-bottom:24px;padding:14px 16px;border:1.5px solid #E2E8F0;border-radius:8px;font-family:Arial,sans-serif;page-break-inside:avoid;">
<table style="width:100%;border-collapse:collapse;margin-bottom:0;"><tr>
<td style="vertical-align:middle;padding:0;" width="52%">
<img src="${SCN_LOGO}" style="height:44px;object-fit:contain;display:block;">
<div style="font-size:8px;color:#94A3B8;margin-top:2px;">Comercializadora de Neumáticos Ltda. · RUT: 77.205.630-3</div>
</td>
<td style="vertical-align:middle;text-align:right;padding:0;" width="48%">
<span style="font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:2px;display:block;margin-bottom:3px;">FICHA TÉCNICA</span>
<span style="background:${pb};color:${pc};padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;">${f.aplicacion||''}</span>
<span style="background:${isCamion?'#0F172A':'#475569'};color:white;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px;">${f.segmento||''}</span>
</td></tr></table>
<div style="background:#C8102E;height:2px;margin:8px 0;"></div>
<table style="width:100%;border-collapse:collapse;"><tr>
<td style="vertical-align:top;padding-right:14px;text-align:center;" width="30%">
${imgUrl?`<img src="${imgUrl}" style="width:100%;max-width:160px;object-fit:contain;border-radius:8px;border:1px solid #E2E8F0;display:block;margin:0 auto;">`:'<div style="width:100%;height:130px;background:#F1F5F9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:48px;">🛞</div>'}
</td>
<td style="vertical-align:top;" width="70%">
<div style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:2px;">${f.marca} <span style="color:#C8102E;">${f.modelo}</span>${medida?` <span style="font-size:12px;color:#64748B;font-weight:400;">${medida}</span>`:''}</div>
${f.nombre_comercial?`<div style="font-size:11px;color:#64748B;margin-bottom:6px;">${f.nombre_comercial}</div>`:'<div style="margin-bottom:4px;"></div>'}
<table style="width:100%;border:1px solid #E2E8F0;border-collapse:collapse;font-size:10px;">${rows}</table>
${prodTable}
</td></tr></table>
</div>`;
}

// ============================================================
// COTIZADOR — Modal de PDF (preview + descargar + enviar email)
// ============================================================
// - openPDF(): muestra el PDF generado en un iframe aislado
// - closePDFModal(): cierra y opcionalmente limpia el carrito
// - downloadPDF(): descarga el PDF como archivo
// - sendEmailFromPreview(): envía el PDF por email (Edge Function de Supabase)
//
// Para evitar un import circular con quote.js (que importa openPDF),
// closePDFModal expone registerCloseHandler({ onClose }) que quote.js
// usa para conectar clearQ.
// ============================================================

import { state } from '../core/state.js';
import { sb, SB_URL, SB_KEY } from '../core/supabase.js';
import { showToast } from '../core/ui.js';

// ─── Configuración de email ───
const EMAIL_FROM = 'SCN Neumáticos <onboarding@resend.dev>';
const EMAIL_REPLY_TO = ['recepcion@scnchile.com', 'pablo@scnchile.com', 'juan.palmess@gmail.com'];

// ─── Callback que quote.js inyecta para limpiar el carrito al cerrar ───
let _onClose = async () => {};

export function registerCloseHandler({ onClose } = {}) {
  if (onClose) _onClose = onClose;
}

// ─── Abrir el modal con el HTML del PDF ───
export function openPDF(html, email = '', num = '', showSend = false, clearOnClose = false) {
  state.PREVIEW_PDF_HTML = html || '';
  state.PREVIEW_EMAIL = email || '';
  state.PREVIEW_NUM = num || '';
  state.PREVIEW_SHOULD_CLEAR_Q = !!clearOnClose;

  const downloadBtn = document.getElementById('btn-download-pdf');
  if (downloadBtn) { downloadBtn.disabled = false; downloadBtn.textContent = '💾 PDF'; }
  const sendBtn = document.getElementById('btn-send-email');
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.style.display = (showSend && email) ? 'inline-block' : 'none';
    sendBtn.textContent = '✉️ Enviar';
  }

  const previewDiv = document.getElementById('pdf-preview-div');
  previewDiv.innerHTML = '<iframe id="pdf-iframe" sandbox="allow-same-origin" style="width:100%;height:100%;border:none;background:white;"></iframe>';
  const iframe = document.getElementById('pdf-iframe');
  iframe.srcdoc = state.PREVIEW_PDF_HTML;

  document.getElementById('pdf-modal-title').textContent = 'Cotización #' + (num || '');
  document.getElementById('pdf-modal').style.display = 'flex';
}

// ─── Cerrar modal y opcionalmente limpiar carrito ───
export async function closePDFModal() {
  const shouldClear = state.PREVIEW_SHOULD_CLEAR_Q;
  document.getElementById('pdf-modal').style.display = 'none';
  document.getElementById('pdf-preview-div').innerHTML = '';
  state.PREVIEW_PDF_HTML = '';
  state.PREVIEW_EMAIL = '';
  state.PREVIEW_NUM = '';
  state.PREVIEW_SHOULD_CLEAR_Q = false;
  const sendBtn = document.getElementById('btn-send-email');
  if (sendBtn) { sendBtn.disabled = false; sendBtn.style.display = 'none'; sendBtn.textContent = '✉️ Enviar'; }
  const dlBtn = document.getElementById('btn-download-pdf');
  if (dlBtn) { dlBtn.disabled = false; dlBtn.textContent = '💾 PDF'; }
  if (shouldClear) await _onClose();
}

// ─── Descargar PDF como archivo ───
export async function downloadPDF() {
  if (!state.PREVIEW_PDF_HTML) return;
  const btn = document.getElementById('btn-download-pdf');
  btn.disabled = true;
  btn.textContent = '📄 Generando...';
  try {
    const container = document.createElement('div');
    container.innerHTML = state.PREVIEW_PDF_HTML;
    container.style.width = '200mm';
    document.body.appendChild(container);
    await window.html2pdf().set({
      margin: 0,
      filename: 'Cotizacion_' + state.PREVIEW_NUM + '_SCN.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(container).save();
    document.body.removeChild(container);
    btn.textContent = '💾 Descargar PDF';
    btn.disabled = false;
  } catch (e) {
    showToast('Error: ' + e.message);
    btn.textContent = '💾 Descargar PDF';
    btn.disabled = false;
  }
}

// ─── Enviar PDF por email (vía Edge Function de Supabase + Resend) ───
export async function sendEmailFromPreview() {
  if (!state.PREVIEW_EMAIL) { showToast('No hay email del cliente'); return; }
  const btn = document.getElementById('btn-send-email');
  btn.disabled = true;
  btn.textContent = '📄 Generando PDF...';
  try {
    const container = document.createElement('div');
    container.innerHTML = state.PREVIEW_PDF_HTML;
    container.style.width = '200mm';
    document.body.appendChild(container);
    const pdfBlob = await window.html2pdf().set({
      margin: 0,
      filename: 'Cotizacion_' + state.PREVIEW_NUM + '_SCN.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(container).outputPdf('blob');
    document.body.removeChild(container);

    const pdfBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    btn.textContent = '✉️ Enviando...';

    const body = {
      from: EMAIL_FROM,
      to: [state.PREVIEW_EMAIL],
      reply_to: EMAIL_REPLY_TO,
      subject: 'Cotización #' + state.PREVIEW_NUM + ' - SCN Neumáticos',
      html: '<p>Estimado cliente,</p><p>Adjuntamos la cotización <strong>#' + state.PREVIEW_NUM + '</strong> de SCN Neumáticos.</p><p>Para confirmar o consultar, responda este correo.</p><br><p>Saludos,<br><strong>Equipo SCN Neumáticos</strong><br>Tel: 228448878 / +569 9632 1722<br>Carretera General San Martín 9360, Bodega 6, Quilicura</p>',
      attachments: [{
        filename: 'Cotizacion_' + state.PREVIEW_NUM + '_SCN.pdf',
        content: pdfBase64,
        type: 'application/pdf',
      }],
    };

    const res = await fetch(SB_URL + '/functions/v1/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SB_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al enviar');

    showToast('✓ Email enviado a ' + state.PREVIEW_EMAIL);
    btn.textContent = '✓ Enviado';
  } catch (e) {
    showToast('Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = '✉️ Enviar al cliente';
  }
}

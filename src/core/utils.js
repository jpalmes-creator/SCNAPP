// ============================================================
// UTILIDADES PURAS
// Funciones sin dependencias del DOM ni del estado global.
// Reusables desde cualquier módulo.
// ============================================================

/**
 * Formatea un número como moneda chilena: 1234567 → "$ 1.234.567"
 * @param {number} n
 * @returns {string}
 */
export function formatCLP(n) {
  return '$ ' + Math.round(n || 0).toLocaleString('es-CL');
}

// Alias corto que se usa en todo el código original
export const $$ = formatCLP;

/**
 * Limpia un string para usarlo en una ruta de archivo (storage).
 * Quita acentos, espacios y caracteres no permitidos.
 */
export function cleanPathPart(v) {
  return String(v || 'x')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

/**
 * Genera una ruta única para un archivo .jpg.
 * Ej: uniqueJpgPath('productos', 'prod_123') → 'productos/prod_123_1714857600000_a3f8q1.jpg'
 */
export function uniqueJpgPath(folder, prefix) {
  return folder + '/' + cleanPathPart(prefix) + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
}

/**
 * Comprime una imagen a JPEG con un tamaño máximo de lado (preservando aspect ratio).
 * Resuelve con un Blob JPEG. Limpia recursos ante éxito o falla.
 */
export function compImg(f, mx) {
  return new Promise((res, rej) => {
    if (!f || !/^image\//.test(f.type || '')) {
      rej(new Error('Seleccioná un archivo de imagen válido.'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(f);
    let done = false;
    const cleanup = () => {
      if (!done) { URL.revokeObjectURL(url); done = true; }
      img.onload = null;
      img.onerror = null;
    };
    img.onload = () => {
      try {
        const r = Math.min(mx / img.width, mx / img.height, 1);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * r));
        c.height = Math.max(1, Math.round(img.height * r));
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('Canvas no disponible en este navegador.');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => {
          cleanup();
          c.width = 0; c.height = 0;
          if (b) res(b); else rej(new Error('No se pudo comprimir la imagen.'));
        }, 'image/jpeg', 0.85);
      } catch (err) { cleanup(); rej(err); }
    };
    img.onerror = () => { cleanup(); rej(new Error('Formato de imagen no compatible. Usá JPG, PNG o WEBP.')); };
    img.src = url;
  });
}

/**
 * Convierte un Blob a string base64 (data URL).
 */
export function blobToBase64(blob) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.readAsDataURL(blob);
  });
}

// Alias antiguo del código original
export const f2b64 = blobToBase64;

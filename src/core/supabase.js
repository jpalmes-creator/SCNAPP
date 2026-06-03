// ============================================================
// CLIENTE SUPABASE
// Inicializa la conexión y la exporta para que la usen los demás módulos
// ============================================================

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validación temprana — si faltan credenciales, muestra mensaje claro y bloquea la app
if (!SB_URL || !SB_KEY) {
  document.body.innerHTML = `
    <div style="padding:40px;font-family:system-ui;max-width:600px;margin:50px auto;background:#FEE2E2;border:2px solid #C8102E;border-radius:8px;">
      <h2 style="color:#C8102E;margin-top:0">⚠️ Configuración faltante</h2>
      <p>No están definidas las variables <code>VITE_SUPABASE_URL</code> y/o <code>VITE_SUPABASE_ANON_KEY</code>.</p>
      <p><strong>Local:</strong> verificá el archivo <code>.env</code><br>
         <strong>Producción:</strong> verificá las Environment Variables en Vercel</p>
    </div>`;
  throw new Error('Missing Supabase env vars');
}

// `supabase` viene del CDN cargado en index.html (<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">)
// Por eso lo accedemos desde window.supabase. En Fase 3 reemplazaremos esto por
// import { createClient } from '@supabase/supabase-js' (cuando movamos a npm).

// Fetch con AbortController. Sin esto, cuando Supabase se cuelga, el request
// queda flotando en el background bloqueando los siguientes intentos. El timeout
// de Promise.race rechazaba la promesa pero el fetch real seguía pegado consumiendo
// la conexión, por eso el segundo intento también colgaba. Con AbortController
// el fetch se cancela de verdad y libera la conexión para el retry.
const fetchWithAbort = (input, init = {}) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  // Si el caller ya pasó un signal, lo respetamos junto con el nuestro
  const signal = init.signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([init.signal, ctrl.signal])
    : ctrl.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(tid));
};

const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithAbort,
  },
});

// Auto-refresh agresivo: cada 5 min refrescamos el token aunque la app esté idle.
// Esto evita que después de inactividad las llamadas a Supabase fallen silenciosamente.
setInterval(() => {
  sb.auth.refreshSession().catch(e => console.warn('[supabase] refresh failed:', e.message));
}, 5 * 60 * 1000);

// Nota: NO refrescamos sesión en visibilitychange. Abrir el modal de PDF dispara
// visibility hidden→visible, eso lanzaba refreshSession → SIGNED_IN → onLogin
// re-corría queries pesadas y dejaba el siguiente insert colgado 10s.
// El intervalo de 5min de arriba + autoRefreshToken son suficientes.

/**
 * Helper: envuelve una promesa con timeout. Si no completa en `ms`,
 * rechaza con error. Útil para llamadas a Supabase que pueden colgarse.
 */
export function withTimeout(promise, ms = 15000, label = 'op') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms en ${label}`)), ms)),
  ]);
}

export { sb, SB_URL, SB_KEY };

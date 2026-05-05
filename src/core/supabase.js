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
const sb = window.supabase.createClient(SB_URL, SB_KEY);

export { sb, SB_URL, SB_KEY };

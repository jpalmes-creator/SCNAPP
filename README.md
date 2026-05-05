# SCN App — Sistema de Cotización de Neumáticos

App web para cotización, gestión de productos, clientes y fichas técnicas.

---

## 🚀 Cómo correrlo en tu computador (desarrollo local)

### Primera vez

1. Abrí **Terminal** (Cmd+Espacio → "Terminal")
2. Andá a la carpeta del proyecto:
   ```
   cd /Users/juanpi/scn-app
   ```
3. Instalá las dependencias (solo la primera vez):
   ```
   npm install
   ```

### Cada vez que quieras trabajar

1. Andá a la carpeta:
   ```
   cd /Users/juanpi/scn-app
   ```
2. Encendé el servidor:
   ```
   npm run dev
   ```
3. Se abre el navegador automáticamente en **http://localhost:5173**
4. Cualquier cambio que hagas al código se refleja al instante (sin recargar)
5. Para apagar: en la terminal apretá `Ctrl + C`

---

## 🌐 Ambientes

| Ambiente | Para qué | Supabase |
|---|---|---|
| **Local (tu compu)** | Probar cambios mientras desarrollás | Staging |
| **Staging (Vercel)** | Probar antes de producción | Staging |
| **Producción** | Lo que usan tus usuarios | Producción real |

---

## 🔐 Variables de entorno

Las credenciales de Supabase están en `.env` (que NO se sube al repo por seguridad).

**Para producción**, las mismas variables se configuran en Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 📁 Estructura del proyecto

```
scn-app/
├── index.html          # App principal (en Fase 2 se separa en módulos)
├── src/                # Código fuente (vacío por ahora — Fase 2)
├── package.json        # Dependencias y scripts
├── vite.config.js      # Configuración de Vite (build/dev)
├── .env                # Credenciales (NO subir al repo)
├── .env.example        # Plantilla de credenciales
└── .gitignore          # Archivos a ignorar
```

---

## 🛠️ Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias (primera vez o si cambian) |
| `npm run dev` | Servidor local de desarrollo (http://localhost:5173) |
| `npm run build` | Compila para producción (carpeta `dist/`) |
| `npm run preview` | Sirve la build de producción para probar |

---

## 📦 Stack técnico

- **Vite** — herramienta de build y dev server
- **JavaScript moderno** (ES Modules)
- **Supabase** — backend (BD + auth + storage)
- **Vercel** — hosting

---

## 📚 Historial de cambios

- **v0.1** (Fase 1) — Setup inicial: proyecto Vite con código actual sin modificar (solo extraídas credenciales a env vars)

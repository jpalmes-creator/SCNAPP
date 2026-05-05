-- ============================================================
-- SCN APP — Setup completo de la base de datos
-- ============================================================
-- Correr este SQL UNA SOLA VEZ en Supabase Staging (SQL Editor)
-- después de crear el proyecto.
--
-- Este script crea:
--   1. Tablas: usuarios, productos, stock, clientes, cotizaciones,
--      cotizacion_items, fichas_tecnicas
--   2. Foreign keys + unique constraints
--   3. Trigger que auto-crea fila en usuarios al crear auth user
--   4. Desactiva RLS (es app interna, FK garantizan integridad)
-- ============================================================


-- ============================================================
-- TABLA: usuarios — perfiles de usuarios autenticados
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  nombre TEXT,
  rol TEXT DEFAULT 'vendedor',  -- 'admin' | 'gerente' | 'vendedor' | 'bodega'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA: productos — neumáticos, llantas, servicios
-- ============================================================
CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  marca TEXT NOT NULL,
  medida TEXT,
  modelo TEXT,
  tipo_uso TEXT,           -- DIRECCIONAL, TRACCION, MIXTO, FAENERO, CITY/TOURING, SPORT, SUV, ALL TERRAIN, MUD TERRAIN, COMERCIAL, LLANTA, CAMARA
  tipo_vehiculo TEXT,      -- CAMION | AUTO
  costo_unitario NUMERIC DEFAULT 0,
  precio_venta NUMERIC DEFAULT 0,
  es_servicio BOOLEAN DEFAULT FALSE,
  activo BOOLEAN DEFAULT TRUE,
  foto_url TEXT,
  telas TEXT,
  profundidad TEXT,
  indice_carga TEXT,
  indice_velocidad TEXT,
  peso_kg TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS productos_marca_idx ON productos(marca);
CREATE INDEX IF NOT EXISTS productos_activo_idx ON productos(activo) WHERE activo = TRUE;
ALTER TABLE productos DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA: stock — cantidad por producto y bodega
-- ============================================================
CREATE TABLE IF NOT EXISTS stock (
  id BIGSERIAL PRIMARY KEY,
  producto_id TEXT REFERENCES productos(id) ON DELETE CASCADE,
  bodega TEXT NOT NULL,    -- 'SCN QUILICURA' | 'BODEGA AUTO' | 'LOS ANDES' | etc.
  cantidad INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(producto_id, bodega)
);

CREATE INDEX IF NOT EXISTS stock_producto_idx ON stock(producto_id);
ALTER TABLE stock DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA: clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rut TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  contacto TEXT,
  direccion TEXT,
  segmento TEXT DEFAULT 'PEQUEÑO',  -- 'PEQUEÑO' | 'MEDIANO' | 'VIP'
  dias_credito INTEGER DEFAULT 30,
  notas TEXT,
  total_ventas_2025 NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clientes_nombre_idx ON clientes(nombre);
ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA: cotizaciones
-- ============================================================
CREATE TABLE IF NOT EXISTS cotizaciones (
  id BIGSERIAL PRIMARY KEY,
  numero INTEGER UNIQUE NOT NULL,  -- correlativo desde 74815
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT,
  cliente_rut TEXT,
  cliente_contacto TEXT,
  cliente_email TEXT,
  forma_pago TEXT,
  estado TEXT DEFAULT 'borrador',   -- 'borrador' | 'pendiente' | 'aprobada' | 'rechazada'
  neto NUMERIC DEFAULT 0,
  iva NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  aprobado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  aprobado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cotizaciones_estado_idx ON cotizaciones(estado);
CREATE INDEX IF NOT EXISTS cotizaciones_creado_por_idx ON cotizaciones(creado_por);
CREATE INDEX IF NOT EXISTS cotizaciones_created_at_idx ON cotizaciones(created_at DESC);
ALTER TABLE cotizaciones DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA: cotizacion_items
-- ============================================================
CREATE TABLE IF NOT EXISTS cotizacion_items (
  id BIGSERIAL PRIMARY KEY,
  cotizacion_id BIGINT REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id TEXT,  -- puede ser null para servicios
  descripcion TEXT NOT NULL,
  marca TEXT,
  cantidad INTEGER DEFAULT 1,
  precio_unit NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cotizacion_items_cot_idx ON cotizacion_items(cotizacion_id);
ALTER TABLE cotizacion_items DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLA: fichas_tecnicas
-- ============================================================
CREATE TABLE IF NOT EXISTS fichas_tecnicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  medida TEXT,
  segmento TEXT,                -- 'CAMION' | 'AUTO' | 'LLANTA'
  aplicacion TEXT,              -- DIRECCIONAL | TRACCION | MIXTO | etc.
  origen TEXT,
  -- Specs neumático
  telas TEXT,
  profundidad TEXT,
  li_ss TEXT,
  peso TEXT,
  indice_velocidad TEXT,
  -- Specs llanta
  numero_agujeros TEXT,
  diametro_agujeros TEXT,
  buje TEXT,
  material TEXT,
  acabado TEXT,
  ensamble TEXT,
  -- Otros
  nombre_comercial TEXT,
  imagen_url TEXT,
  notas TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marca, modelo, medida)
);

CREATE INDEX IF NOT EXISTS fichas_marca_modelo_idx ON fichas_tecnicas(marca, modelo);
ALTER TABLE fichas_tecnicas DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- TRIGGER: auto-crear fila en usuarios cuando alguien se registra en Auth
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(SPLIT_PART(NEW.email, '@', 1), ''), 'Usuario'),
    -- Asigna rol por email
    CASE
      WHEN NEW.email = 'pablo@scnchile.com' THEN 'gerente'
      WHEN NEW.email = 'juan.palmess@gmail.com' THEN 'admin'
      ELSE 'vendedor'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- VERIFICACIÓN — debería mostrar las 7 tablas creadas
-- ============================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

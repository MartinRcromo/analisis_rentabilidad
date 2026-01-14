-- ============================================================================
-- MIGRACIÓN: Agregar categoría de gastos "Movimiento" (5 grupos)
-- ============================================================================

-- 1. Agregar nuevos campos a metricas_producto
ALTER TABLE metricas_producto
ADD COLUMN IF NOT EXISTS unidades_vendidas NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS veces_pedido NUMERIC(10,0) DEFAULT 0;

-- 2. Agregar nuevas columnas a gastos_mensuales para el 5to grupo
ALTER TABLE gastos_mensuales
ADD COLUMN IF NOT EXISTS cat5_movimiento_base NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS peso_movimiento NUMERIC(10,8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cat5_movimiento_final NUMERIC(15,2) DEFAULT 0;

-- Renombrar cat2_volumen a cat2_ocupacion (más preciso)
-- Nota: Mantenemos los nombres originales para compatibilidad, pero agregamos alias
COMMENT ON COLUMN gastos_mensuales.cat2_volumen_base IS 'Gastos de ocupación (alquiler, servicios, mantenimiento, seguros) - antes llamado Volumen';
COMMENT ON COLUMN gastos_mensuales.cat2_volumen_final IS 'Gastos de ocupación finales (después de ajuste)';

-- 3. Agregar nuevas columnas a analisis_producto
ALTER TABLE analisis_producto
ADD COLUMN IF NOT EXISTS porcentaje_movimiento NUMERIC(12,8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gasto_movimiento NUMERIC(15,2) DEFAULT 0;

-- Renombrar porcentaje_volumen a porcentaje_ocupacion conceptualmente
COMMENT ON COLUMN analisis_producto.porcentaje_volumen IS 'Porcentaje de ocupación (m³ stock) - antes llamado Volumen';
COMMENT ON COLUMN analisis_producto.gasto_volumen IS 'Gasto por ocupación (m³ stock) - antes llamado Volumen';

-- 4. Actualizar clasificaciones maestras - separar Volumen en Ocupación y Movimiento
UPDATE gastos_clasificacion_maestra
SET clasificacion = 'Movimiento'
WHERE sector = 'Logística' AND tipogasto IN ('Sueldos', 'Fletes');

UPDATE gastos_clasificacion_maestra
SET clasificacion = 'Ocupacion'
WHERE sector = 'Logística' AND tipogasto IN ('Alquileres', 'Servicios', 'Mantenimiento', 'Seguros');

-- Agregar nuevas clasificaciones si no existen
INSERT INTO gastos_clasificacion_maestra (sector, tipogasto, clasificacion, se_analiza) VALUES
    ('Logística', 'Mantenimiento', 'Ocupacion', true),
    ('Logística', 'Seguros', 'Ocupacion', true)
ON CONFLICT (sector, tipogasto) DO UPDATE SET clasificacion = EXCLUDED.clasificacion;

-- 5. Crear índice para optimizar consultas por veces_pedido
CREATE INDEX IF NOT EXISTS idx_metricas_veces_pedido ON metricas_producto(veces_pedido);

-- 6. Vista para comparar modelos de costeo (4 grupos vs 5 grupos)
CREATE OR REPLACE VIEW v_comparacion_modelos AS
SELECT
    ap.producto_id,
    ap.periodo,
    p.codigo,
    p.nombre,
    p.empresa,
    -- Modelo actual (4 grupos - Volumen incluye todo)
    ap.gasto_volumen AS gasto_volumen_actual,
    ap.gasto_total AS gasto_total_4grupos,
    ap.resultado AS resultado_4grupos,
    ap.markup_minimo_pct AS markup_min_4grupos,
    -- Modelo nuevo (5 grupos - separado)
    ap.gasto_volumen AS gasto_ocupacion,
    ap.gasto_movimiento AS gasto_movimiento,
    (ap.gasto_facturacion + ap.gasto_volumen + ap.gasto_movimiento + ap.gasto_credito + ap.gasto_markup) AS gasto_total_5grupos
FROM analisis_producto ap
JOIN productos p ON p.id = ap.producto_id;

-- ============================================================================
-- RESUMEN DE CAMBIOS
-- ============================================================================
--
-- ANTES (4 grupos):
--   1. Facturación (% ventas)
--   2. Volumen (% m³ stock) ← incluía ocupación + movimiento
--   3. Crédito (% stock valorizado)
--   4. Rentabilidad (% margen bruto)
--
-- DESPUÉS (5 grupos):
--   1. Facturación (% ventas)
--   2. Ocupación (% m³ stock) ← alquiler, servicios, mantenimiento, seguros
--   3. Movimiento (% veces_pedido) ← sueldos logística, fletes
--   4. Crédito (% stock valorizado)
--   5. Rentabilidad (% margen bruto)
--
-- ============================================================================

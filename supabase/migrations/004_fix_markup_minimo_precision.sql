-- Migration 004: Fix markup_minimo_pct numeric precision overflow
-- The NUMERIC(8,4) field was too small for extreme markup calculations
-- Changing to NUMERIC(12,4) to support values up to 99,999,999.9999

-- First, drop all views that depend on the columns we're altering

-- Drop regular view
DROP VIEW IF EXISTS v_comparacion_modelos;

-- Drop materialized views (they depend on markup_pct)
DROP MATERIALIZED VIEW IF EXISTS analisis_proveedor;
DROP MATERIALIZED VIEW IF EXISTS analisis_subrubro;

-- Now alter the column types
ALTER TABLE analisis_producto
ALTER COLUMN markup_minimo_pct TYPE NUMERIC(12,4);

ALTER TABLE metricas_producto
ALTER COLUMN markup_pct TYPE NUMERIC(12,4);

-- Recreate the regular view
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

-- Recreate materialized views
CREATE MATERIALIZED VIEW analisis_proveedor AS
SELECT
    m.periodo,
    p.empresa,
    pr.id as proveedor_id,
    pr.nombre as proveedor,
    s.id as subrubro_id,
    s.nombre as subrubro,
    COUNT(DISTINCT p.id) as total_productos,
    SUM(m.importe_ventas) as total_ventas,
    SUM(m.importe_costo) as total_costo,
    SUM(m.margen_bruto) as total_margen,
    SUM(a.gasto_total) as total_gastos,
    SUM(a.resultado) as resultado,
    ROUND(AVG(m.markup_pct), 4) as markup_promedio,
    SUM(CASE WHEN a.en_perdida THEN 1 ELSE 0 END) as productos_perdida
FROM analisis_producto a
JOIN productos p ON a.producto_id = p.id
JOIN proveedores pr ON p.proveedor_id = pr.id
JOIN subrubros s ON p.subrubro_id = s.id
JOIN metricas_producto m ON m.producto_id = p.id AND m.periodo = a.periodo
GROUP BY m.periodo, p.empresa, pr.id, pr.nombre, s.id, s.nombre;

CREATE INDEX IF NOT EXISTS idx_mv_proveedor_periodo ON analisis_proveedor(periodo);

CREATE MATERIALIZED VIEW analisis_subrubro AS
SELECT
    m.periodo,
    p.empresa,
    s.id as subrubro_id,
    s.nombre as subrubro,
    COUNT(DISTINCT p.id) as total_productos,
    COUNT(DISTINCT p.proveedor_id) as total_proveedores,
    SUM(m.importe_ventas) as total_ventas,
    SUM(m.importe_costo) as total_costo,
    SUM(m.margen_bruto) as total_margen,
    SUM(a.gasto_total) as total_gastos,
    SUM(a.resultado) as resultado,
    ROUND(AVG(m.markup_pct), 4) as markup_promedio,
    SUM(CASE WHEN a.en_perdida THEN 1 ELSE 0 END) as productos_perdida,
    SUM(m.stock_costo) as stock_valorizado,
    SUM(m.stock_volumen) as stock_volumen
FROM analisis_producto a
JOIN productos p ON a.producto_id = p.id
JOIN subrubros s ON p.subrubro_id = s.id
JOIN metricas_producto m ON m.producto_id = p.id AND m.periodo = a.periodo
GROUP BY m.periodo, p.empresa, s.id, s.nombre;

CREATE INDEX IF NOT EXISTS idx_mv_subrubro_periodo ON analisis_subrubro(periodo);

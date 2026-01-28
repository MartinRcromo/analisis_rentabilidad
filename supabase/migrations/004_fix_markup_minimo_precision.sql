-- Migration 004: Fix markup_minimo_pct numeric precision overflow
-- The NUMERIC(8,4) field was too small for extreme markup calculations
-- Changing to NUMERIC(12,4) to support values up to 99,999,999.9999

-- First, drop the view that depends on markup_minimo_pct
DROP VIEW IF EXISTS v_comparacion_modelos;

-- Now alter the column types
ALTER TABLE analisis_producto
ALTER COLUMN markup_minimo_pct TYPE NUMERIC(12,4);

-- Also update metricas_producto.markup_pct for consistency
ALTER TABLE metricas_producto
ALTER COLUMN markup_pct TYPE NUMERIC(12,4);

-- Recreate the view with the same definition
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

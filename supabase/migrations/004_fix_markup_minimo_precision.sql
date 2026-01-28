-- Migration 004: Fix markup_minimo_pct numeric precision overflow
-- The NUMERIC(8,4) field was too small for extreme markup calculations
-- Changing to NUMERIC(12,4) to support values up to 99,999,999.9999

ALTER TABLE analisis_producto
ALTER COLUMN markup_minimo_pct TYPE NUMERIC(12,4);

-- Also update metricas_producto.markup_pct for consistency
ALTER TABLE metricas_producto
ALTER COLUMN markup_pct TYPE NUMERIC(12,4);

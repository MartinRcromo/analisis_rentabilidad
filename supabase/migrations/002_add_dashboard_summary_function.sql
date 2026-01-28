-- ============================================================================
-- MIGRACIÓN: Función SQL para calcular resumen del dashboard
-- Resuelve el problema del límite de 1000 registros de Supabase
-- ============================================================================

-- Función para calcular el resumen del dashboard con agregación SQL
-- Esto es mucho más eficiente que traer todos los registros a JavaScript
CREATE OR REPLACE FUNCTION calcular_resumen_dashboard(
    p_periodo TEXT,
    p_empresa TEXT DEFAULT 'todas'
)
RETURNS TABLE (
    total_productos BIGINT,
    productos_perdida BIGINT,
    perdida_total NUMERIC,
    beneficio_total NUMERIC,
    resultado_neto NUMERIC,
    pct_perdida NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total_productos,
        COUNT(*) FILTER (WHERE ap.en_perdida = true)::BIGINT AS productos_perdida,
        COALESCE(SUM(ap.resultado) FILTER (WHERE ap.en_perdida = true), 0)::NUMERIC AS perdida_total,
        COALESCE(SUM(ap.resultado) FILTER (WHERE ap.en_perdida = false), 0)::NUMERIC AS beneficio_total,
        COALESCE(SUM(ap.resultado), 0)::NUMERIC AS resultado_neto,
        CASE
            WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE ap.en_perdida = true)::NUMERIC / COUNT(*)::NUMERIC * 100)
            ELSE 0
        END AS pct_perdida
    FROM analisis_producto ap
    INNER JOIN productos p ON p.id = ap.producto_id
    WHERE ap.periodo = p_periodo
      AND (p_empresa = 'todas' OR p.empresa = p_empresa);
END;
$$;

-- Función para calcular evolución de 6 meses con agregación SQL
CREATE OR REPLACE FUNCTION calcular_evolucion_dashboard(
    p_empresa TEXT DEFAULT 'todas'
)
RETURNS TABLE (
    periodo TEXT,
    beneficio NUMERIC,
    perdida NUMERIC,
    resultado NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH periodos_unicos AS (
        SELECT DISTINCT ap.periodo
        FROM analisis_producto ap
        ORDER BY ap.periodo DESC
        LIMIT 6
    )
    SELECT
        ap.periodo,
        COALESCE(SUM(ap.resultado) FILTER (WHERE ap.en_perdida = false), 0)::NUMERIC AS beneficio,
        COALESCE(SUM(ap.resultado) FILTER (WHERE ap.en_perdida = true), 0)::NUMERIC AS perdida,
        COALESCE(SUM(ap.resultado), 0)::NUMERIC AS resultado
    FROM analisis_producto ap
    INNER JOIN productos p ON p.id = ap.producto_id
    WHERE ap.periodo IN (SELECT pu.periodo FROM periodos_unicos pu)
      AND (p_empresa = 'todas' OR p.empresa = p_empresa)
    GROUP BY ap.periodo
    ORDER BY ap.periodo ASC;
END;
$$;

-- ============================================================================
-- NOTAS
-- ============================================================================
-- Estas funciones resuelven el problema del límite implícito de 1000 registros
-- de Supabase haciendo la agregación directamente en PostgreSQL.
--
-- Beneficios:
-- 1. Sin límite de registros - suma TODOS los productos
-- 2. Mucho más rápido - una query en vez de traer miles de registros
-- 3. Menor uso de memoria en el servidor de la aplicación
-- ============================================================================

-- ============================================================================
-- MIGRACIÓN: KPIs del Dashboard por Empresa
-- Nuevas funciones para calcular métricas por empresa
-- ============================================================================

-- Función para obtener períodos disponibles (para el selector de fechas)
CREATE OR REPLACE FUNCTION get_periodos_disponibles()
RETURNS TABLE (
    anio INTEGER,
    mes INTEGER,
    periodo TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        EXTRACT(YEAR FROM ap.periodo)::INTEGER AS anio,
        EXTRACT(MONTH FROM ap.periodo)::INTEGER AS mes,
        ap.periodo::TEXT
    FROM analisis_producto ap
    ORDER BY anio DESC, mes DESC;
END;
$$;

-- Función principal para KPIs del dashboard con soporte multi-periodo
CREATE OR REPLACE FUNCTION calcular_dashboard_kpis(
    p_periodos TEXT[],  -- Array de periodos en formato 'YYYY-MM-DD'
    p_empresa TEXT DEFAULT 'todas'
)
RETURNS TABLE (
    -- KPIs generales
    facturacion NUMERIC,
    costo_mercaderia NUMERIC,
    unidades_vendidas NUMERIC,
    stock_volumen NUMERIC,
    stock_valorizado NUMERIC,
    cantidad_pedidos NUMERIC,
    -- Resumen productos
    total_productos BIGINT,
    productos_perdida BIGINT,
    productos_beneficio BIGINT,
    resultado_neto NUMERIC,
    -- Subrubros
    subrubros_perdida BIGINT,
    subrubros_beneficio BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH datos_productos AS (
        SELECT
            m.importe_ventas,
            m.importe_costo,
            m.unidades_vendidas,
            m.stock_volumen,
            m.stock_costo,
            m.veces_pedido,
            ap.resultado,
            ap.en_perdida,
            p.subrubro_id
        FROM analisis_producto ap
        INNER JOIN productos p ON p.id = ap.producto_id
        INNER JOIN metricas_producto m ON m.producto_id = ap.producto_id AND m.periodo = ap.periodo
        WHERE ap.periodo::TEXT = ANY(p_periodos)
          AND (p_empresa = 'todas' OR p.empresa = p_empresa)
    ),
    subrubros_agregados AS (
        SELECT
            subrubro_id,
            SUM(resultado) AS resultado_subrubro
        FROM datos_productos
        GROUP BY subrubro_id
    )
    SELECT
        COALESCE(SUM(dp.importe_ventas), 0)::NUMERIC AS facturacion,
        COALESCE(SUM(dp.importe_costo), 0)::NUMERIC AS costo_mercaderia,
        COALESCE(SUM(dp.unidades_vendidas), 0)::NUMERIC AS unidades_vendidas,
        COALESCE(SUM(dp.stock_volumen), 0)::NUMERIC AS stock_volumen,
        COALESCE(SUM(dp.stock_costo), 0)::NUMERIC AS stock_valorizado,
        COALESCE(SUM(dp.veces_pedido), 0)::NUMERIC AS cantidad_pedidos,
        COUNT(*)::BIGINT AS total_productos,
        COUNT(*) FILTER (WHERE dp.en_perdida = true)::BIGINT AS productos_perdida,
        COUNT(*) FILTER (WHERE dp.en_perdida = false)::BIGINT AS productos_beneficio,
        COALESCE(SUM(dp.resultado), 0)::NUMERIC AS resultado_neto,
        (SELECT COUNT(*) FILTER (WHERE sa.resultado_subrubro < 0) FROM subrubros_agregados sa)::BIGINT AS subrubros_perdida,
        (SELECT COUNT(*) FILTER (WHERE sa.resultado_subrubro >= 0) FROM subrubros_agregados sa)::BIGINT AS subrubros_beneficio
    FROM datos_productos dp;
END;
$$;

-- Función para calcular % de gastos y gasto mínimo por empresa
CREATE OR REPLACE FUNCTION calcular_gastos_por_empresa(
    p_periodos TEXT[]
)
RETURNS TABLE (
    empresa TEXT,
    ventas_total NUMERIC,
    gastos_total NUMERIC,
    pct_gastos NUMERIC,
    margen_bruto_total NUMERIC,
    gasto_minimo_pct NUMERIC  -- % de gasto que haría flotación (gasto = margen bruto)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.empresa::TEXT,
        COALESCE(SUM(m.importe_ventas), 0)::NUMERIC AS ventas_total,
        COALESCE(SUM(ap.gasto_total), 0)::NUMERIC AS gastos_total,
        CASE
            WHEN SUM(m.importe_ventas) > 0
            THEN (SUM(ap.gasto_total) / SUM(m.importe_ventas) * 100)::NUMERIC
            ELSE 0
        END AS pct_gastos,
        COALESCE(SUM(m.margen_bruto), 0)::NUMERIC AS margen_bruto_total,
        -- Gasto mínimo % = (Margen Bruto / Ventas) * 100 = punto de flotación
        CASE
            WHEN SUM(m.importe_ventas) > 0
            THEN (SUM(m.margen_bruto) / SUM(m.importe_ventas) * 100)::NUMERIC
            ELSE 0
        END AS gasto_minimo_pct
    FROM analisis_producto ap
    INNER JOIN productos p ON p.id = ap.producto_id
    INNER JOIN metricas_producto m ON m.producto_id = ap.producto_id AND m.periodo = ap.periodo
    WHERE ap.periodo::TEXT = ANY(p_periodos)
    GROUP BY p.empresa
    ORDER BY p.empresa;
END;
$$;

-- Función para evolución simplificada (solo resultado)
CREATE OR REPLACE FUNCTION calcular_evolucion_resultado(
    p_empresa TEXT DEFAULT 'todas',
    p_limit INTEGER DEFAULT 6
)
RETURNS TABLE (
    periodo TEXT,
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
        LIMIT p_limit
    )
    SELECT
        ap.periodo::TEXT,
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
-- get_periodos_disponibles: Lista años/meses disponibles para el selector
-- calcular_dashboard_kpis: KPIs principales con soporte multi-periodo
-- calcular_gastos_por_empresa: % gastos y gasto mínimo por empresa
-- calcular_evolucion_resultado: Gráfico simplificado solo con resultado
-- ============================================================================

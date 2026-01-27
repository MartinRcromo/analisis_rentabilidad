-- ============================================================================
-- SCRIPT PARA PROCESAR DATOS DESDE TABLAS STAGING
-- ============================================================================
--
-- INSTRUCCIONES:
-- 1. Asegurate de tener los datos cargados en:
--    - ventas_staging
--    - gastos_staging
-- 2. Ejecuta este script completo en Supabase SQL Editor
-- 3. Luego ejecuta:
--    SELECT * FROM procesar_ventas_staging('2024-12-01');
--    SELECT * FROM procesar_gastos_staging('2024-12-01');
--
-- NOTA: Cambiá '2024-12-01' por tu período (primer día del mes)
--
-- ============================================================================


-- ============================================================================
-- PARTE 1: TABLA GASTOS_STAGING (si no existe)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gastos_staging (
    id SERIAL PRIMARY KEY,
    periodo VARCHAR(20),
    gerencia VARCHAR(100),
    sector VARCHAR(100),
    tipogasto VARCHAR(100),
    proveedorgasto VARCHAR(300),
    comprobante VARCHAR(100),
    idcomprobante VARCHAR(100),
    empresa VARCHAR(10),
    empresatipo VARCHAR(50),
    importe_gasto NUMERIC(15,2),
    clasificacion VARCHAR(50),          -- Facturacion, Ocupacion, Movimiento, Credito, Rentabilidad
    se_analiza BOOLEAN DEFAULT true,
    procesado BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_staging_procesado ON gastos_staging(procesado);
CREATE INDEX IF NOT EXISTS idx_gastos_staging_periodo ON gastos_staging(periodo);


-- ============================================================================
-- PARTE 2: FUNCIÓN PROCESAR VENTAS STAGING (actualizada con 5-grupos)
-- ============================================================================

CREATE OR REPLACE FUNCTION procesar_ventas_staging(p_periodo DATE)
RETURNS TABLE (
    subrubros_procesados INTEGER,
    proveedores_procesados INTEGER,
    compradores_procesados INTEGER,
    categorias_procesadas INTEGER,
    productos_procesados INTEGER,
    metricas_insertadas INTEGER
) AS $$
DECLARE
    v_subrubros INTEGER := 0;
    v_proveedores INTEGER := 0;
    v_compradores INTEGER := 0;
    v_categorias INTEGER := 0;
    v_productos INTEGER := 0;
    v_metricas INTEGER := 0;
BEGIN
    -- 1. UPSERT SUBRUBROS
    INSERT INTO subrubros (nombre)
    SELECT DISTINCT subrubro
    FROM ventas_staging
    WHERE subrubro IS NOT NULL AND subrubro != '' AND procesado = false
    ON CONFLICT (nombre) DO NOTHING;

    GET DIAGNOSTICS v_subrubros = ROW_COUNT;
    RAISE NOTICE 'Subrubros procesados: %', v_subrubros;

    -- 2. UPSERT PROVEEDORES
    INSERT INTO proveedores (codigo, nombre)
    SELECT DISTINCT idproveedor, proveedor
    FROM ventas_staging
    WHERE idproveedor IS NOT NULL AND idproveedor != '' AND procesado = false
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;

    GET DIAGNOSTICS v_proveedores = ROW_COUNT;
    RAISE NOTICE 'Proveedores procesados: %', v_proveedores;

    -- 3. UPSERT COMPRADORES
    INSERT INTO compradores (codigo)
    SELECT DISTINCT idcomprador
    FROM ventas_staging
    WHERE idcomprador IS NOT NULL AND idcomprador != '' AND procesado = false
    ON CONFLICT (codigo) DO NOTHING;

    GET DIAGNOSTICS v_compradores = ROW_COUNT;
    RAISE NOTICE 'Compradores procesados: %', v_compradores;

    -- 4. UPSERT CATEGORÍAS
    INSERT INTO categorias (codigo)
    SELECT DISTINCT idcategoria
    FROM ventas_staging
    WHERE idcategoria IS NOT NULL AND idcategoria != '' AND procesado = false
    ON CONFLICT (codigo) DO NOTHING;

    GET DIAGNOSTICS v_categorias = ROW_COUNT;
    RAISE NOTICE 'Categorías procesadas: %', v_categorias;

    -- 5. UPSERT PRODUCTOS
    INSERT INTO productos (codigo, nombre, empresa, subrubro_id, proveedor_id, comprador_id, categoria_id)
    SELECT DISTINCT ON (vs.idproducto)
        vs.idproducto,
        vs.producto,
        vs.empresa,
        s.id,
        p.id,
        c.id,
        cat.id
    FROM ventas_staging vs
    LEFT JOIN subrubros s ON s.nombre = vs.subrubro
    LEFT JOIN proveedores p ON p.codigo = vs.idproveedor
    LEFT JOIN compradores c ON c.codigo = vs.idcomprador
    LEFT JOIN categorias cat ON cat.codigo = vs.idcategoria
    WHERE vs.idproducto IS NOT NULL AND vs.idproducto != '' AND vs.procesado = false
    ON CONFLICT (codigo) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        empresa = EXCLUDED.empresa,
        subrubro_id = EXCLUDED.subrubro_id,
        proveedor_id = EXCLUDED.proveedor_id,
        comprador_id = EXCLUDED.comprador_id,
        categoria_id = EXCLUDED.categoria_id;

    GET DIAGNOSTICS v_productos = ROW_COUNT;
    RAISE NOTICE 'Productos procesados: %', v_productos;

    -- 6. ELIMINAR MÉTRICAS ANTERIORES DEL PERÍODO
    DELETE FROM metricas_producto WHERE periodo = p_periodo;
    RAISE NOTICE 'Métricas anteriores del período eliminadas';

    -- 7. INSERTAR MÉTRICAS (con campos del modelo 5-grupos)
    INSERT INTO metricas_producto (
        producto_id,
        periodo,
        importe_ventas,
        importe_costo,
        margen_bruto,
        markup_pct,
        stock_unidades,
        stock_costo,
        stock_volumen,
        unidades_vendidas,
        veces_pedido
    )
    SELECT
        prod.id,
        p_periodo,
        COALESCE(vs.importe_ventas, 0),
        COALESCE(vs.importe_costo, 0),
        COALESCE(vs.importe_ventas, 0) - COALESCE(vs.importe_costo, 0),
        CASE
            WHEN COALESCE(vs.importe_costo, 0) > 0
            THEN ((COALESCE(vs.importe_ventas, 0) / vs.importe_costo) - 1) * 100
            ELSE 0
        END,
        COALESCE(vs.stock_unidades, 0),
        COALESCE(vs.stock_costo, 0),
        COALESCE(vs.stock_volumen, 0),
        -- Campos del modelo 5-grupos (si existen en staging, sino default)
        COALESCE(vs.unidades_vendidas, vs.importe_ventas / NULLIF(vs.importe_costo / NULLIF(vs.stock_unidades, 0), 0), 0),
        COALESCE(vs.veces_pedido, 1)  -- Default 1 si no hay dato
    FROM ventas_staging vs
    JOIN productos prod ON prod.codigo = vs.idproducto
    WHERE vs.idproducto IS NOT NULL AND vs.procesado = false;

    GET DIAGNOSTICS v_metricas = ROW_COUNT;
    RAISE NOTICE 'Métricas insertadas: %', v_metricas;

    -- 8. MARCAR COMO PROCESADOS
    UPDATE ventas_staging SET procesado = true WHERE procesado = false;

    -- 9. RETORNAR RESULTADOS
    RETURN QUERY SELECT v_subrubros, v_proveedores, v_compradores, v_categorias, v_productos, v_metricas;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PARTE 3: FUNCIÓN PROCESAR GASTOS STAGING
-- ============================================================================

CREATE OR REPLACE FUNCTION procesar_gastos_staging(p_periodo DATE)
RETURNS TABLE (
    gastos_detalle_insertados INTEGER,
    total_facturacion NUMERIC,
    total_ocupacion NUMERIC,
    total_movimiento NUMERIC,
    total_credito NUMERIC,
    total_rentabilidad NUMERIC,
    total_sin_clasificar NUMERIC,
    total_general NUMERIC
) AS $$
DECLARE
    v_detalle INTEGER := 0;
    v_gastos_mensuales_id INTEGER;

    -- Totales base por categoría
    v_cat1_facturacion NUMERIC := 0;
    v_cat2_ocupacion NUMERIC := 0;
    v_cat3_credito NUMERIC := 0;
    v_cat4_rentabilidad NUMERIC := 0;
    v_cat5_movimiento NUMERIC := 0;
    v_sin_clasificar NUMERIC := 0;
    v_total_clasificado NUMERIC := 0;
    v_total_general NUMERIC := 0;

    -- Pesos (porcentajes)
    v_peso_facturacion NUMERIC := 0;
    v_peso_ocupacion NUMERIC := 0;
    v_peso_credito NUMERIC := 0;
    v_peso_rentabilidad NUMERIC := 0;
    v_peso_movimiento NUMERIC := 0;

    -- Finales (base + distribución de sin_clasificar)
    v_final_facturacion NUMERIC := 0;
    v_final_ocupacion NUMERIC := 0;
    v_final_credito NUMERIC := 0;
    v_final_rentabilidad NUMERIC := 0;
    v_final_movimiento NUMERIC := 0;
BEGIN
    -- =========================================================================
    -- PASO 1: APLICAR CLASIFICACIÓN MAESTRA A REGISTROS SIN CLASIFICAR
    -- =========================================================================
    UPDATE gastos_staging gs
    SET clasificacion = gcm.clasificacion,
        se_analiza = COALESCE(gcm.se_analiza, true)
    FROM gastos_clasificacion_maestra gcm
    WHERE LOWER(TRIM(gs.sector)) = LOWER(TRIM(gcm.sector))
      AND LOWER(TRIM(gs.tipogasto)) = LOWER(TRIM(gcm.tipogasto))
      AND (gs.clasificacion IS NULL OR gs.clasificacion = '')
      AND gs.procesado = false;

    RAISE NOTICE 'Clasificaciones maestras aplicadas';

    -- =========================================================================
    -- PASO 2: CALCULAR TOTALES POR CATEGORÍA
    -- =========================================================================

    -- Facturación
    SELECT COALESCE(SUM(importe_gasto), 0) INTO v_cat1_facturacion
    FROM gastos_staging
    WHERE LOWER(clasificacion) = 'facturacion' AND procesado = false;

    -- Ocupación (antes era Volumen para ocupación)
    SELECT COALESCE(SUM(importe_gasto), 0) INTO v_cat2_ocupacion
    FROM gastos_staging
    WHERE LOWER(clasificacion) IN ('ocupacion', 'volumen') AND procesado = false;

    -- Crédito
    SELECT COALESCE(SUM(importe_gasto), 0) INTO v_cat3_credito
    FROM gastos_staging
    WHERE LOWER(clasificacion) = 'credito' AND procesado = false;

    -- Rentabilidad
    SELECT COALESCE(SUM(importe_gasto), 0) INTO v_cat4_rentabilidad
    FROM gastos_staging
    WHERE LOWER(clasificacion) = 'rentabilidad' AND procesado = false;

    -- Movimiento (nuevo en modelo 5-grupos)
    SELECT COALESCE(SUM(importe_gasto), 0) INTO v_cat5_movimiento
    FROM gastos_staging
    WHERE LOWER(clasificacion) = 'movimiento' AND procesado = false;

    -- Sin clasificar
    SELECT COALESCE(SUM(importe_gasto), 0) INTO v_sin_clasificar
    FROM gastos_staging
    WHERE (clasificacion IS NULL OR clasificacion = '' OR LOWER(clasificacion) NOT IN
           ('facturacion', 'ocupacion', 'volumen', 'credito', 'rentabilidad', 'movimiento'))
      AND procesado = false;

    -- Totales
    v_total_clasificado := v_cat1_facturacion + v_cat2_ocupacion + v_cat3_credito +
                           v_cat4_rentabilidad + v_cat5_movimiento;
    v_total_general := v_total_clasificado + v_sin_clasificar;

    RAISE NOTICE 'Totales calculados - Clasificado: %, Sin clasificar: %, General: %',
                 v_total_clasificado, v_sin_clasificar, v_total_general;

    -- =========================================================================
    -- PASO 3: CALCULAR PESOS (porcentajes)
    -- =========================================================================
    IF v_total_clasificado > 0 THEN
        v_peso_facturacion := v_cat1_facturacion / v_total_clasificado;
        v_peso_ocupacion := v_cat2_ocupacion / v_total_clasificado;
        v_peso_credito := v_cat3_credito / v_total_clasificado;
        v_peso_rentabilidad := v_cat4_rentabilidad / v_total_clasificado;
        v_peso_movimiento := v_cat5_movimiento / v_total_clasificado;
    END IF;

    RAISE NOTICE 'Pesos - Fact: %%, Ocup: %%, Cred: %%, Rent: %%, Mov: %%',
                 ROUND(v_peso_facturacion * 100, 2),
                 ROUND(v_peso_ocupacion * 100, 2),
                 ROUND(v_peso_credito * 100, 2),
                 ROUND(v_peso_rentabilidad * 100, 2),
                 ROUND(v_peso_movimiento * 100, 2);

    -- =========================================================================
    -- PASO 4: CALCULAR FINALES (distribuir sin_clasificar proporcionalmente)
    -- =========================================================================
    v_final_facturacion := v_cat1_facturacion + (v_peso_facturacion * v_sin_clasificar);
    v_final_ocupacion := v_cat2_ocupacion + (v_peso_ocupacion * v_sin_clasificar);
    v_final_credito := v_cat3_credito + (v_peso_credito * v_sin_clasificar);
    v_final_rentabilidad := v_cat4_rentabilidad + (v_peso_rentabilidad * v_sin_clasificar);
    v_final_movimiento := v_cat5_movimiento + (v_peso_movimiento * v_sin_clasificar);

    RAISE NOTICE 'Finales - Fact: %, Ocup: %, Cred: %, Rent: %, Mov: %',
                 v_final_facturacion, v_final_ocupacion, v_final_credito,
                 v_final_rentabilidad, v_final_movimiento;

    -- =========================================================================
    -- PASO 5: ELIMINAR DATOS ANTERIORES DEL PERÍODO
    -- =========================================================================
    DELETE FROM gastos_detalle WHERE periodo = p_periodo;
    DELETE FROM gastos_mensuales WHERE periodo = p_periodo;
    RAISE NOTICE 'Datos anteriores del período eliminados';

    -- =========================================================================
    -- PASO 6: INSERTAR EN GASTOS_MENSUALES
    -- =========================================================================
    INSERT INTO gastos_mensuales (
        periodo,
        cat1_facturacion_base,
        cat2_volumen_base,
        cat3_credito_base,
        cat4_rentabilidad_base,
        cat5_movimiento_base,
        total_clasificado,
        total_sin_clasificar,
        total_general,
        peso_facturacion,
        peso_volumen,
        peso_credito,
        peso_rentabilidad,
        peso_movimiento,
        cat1_facturacion_final,
        cat2_volumen_final,
        cat3_credito_final,
        cat4_rentabilidad_final,
        cat5_movimiento_final
    ) VALUES (
        p_periodo,
        v_cat1_facturacion,
        v_cat2_ocupacion,
        v_cat3_credito,
        v_cat4_rentabilidad,
        v_cat5_movimiento,
        v_total_clasificado,
        v_sin_clasificar,
        v_total_general,
        v_peso_facturacion,
        v_peso_ocupacion,
        v_peso_credito,
        v_peso_rentabilidad,
        v_peso_movimiento,
        v_final_facturacion,
        v_final_ocupacion,
        v_final_credito,
        v_final_rentabilidad,
        v_final_movimiento
    )
    RETURNING id INTO v_gastos_mensuales_id;

    RAISE NOTICE 'gastos_mensuales insertado con ID: %', v_gastos_mensuales_id;

    -- =========================================================================
    -- PASO 7: INSERTAR EN GASTOS_DETALLE
    -- =========================================================================
    INSERT INTO gastos_detalle (
        gastos_mensuales_id,
        periodo,
        gerencia,
        sector,
        tipogasto,
        proveedorgasto,
        comprobante,
        idcomprobante,
        empresa,
        empresatipo,
        importe_gasto,
        clasificacion,
        se_analiza
    )
    SELECT
        v_gastos_mensuales_id,
        p_periodo,
        gerencia,
        sector,
        tipogasto,
        proveedorgasto,
        comprobante,
        idcomprobante,
        empresa,
        empresatipo,
        importe_gasto,
        CASE
            WHEN LOWER(clasificacion) IN ('facturacion', 'ocupacion', 'volumen', 'credito', 'rentabilidad', 'movimiento')
            THEN clasificacion
            ELSE NULL
        END,
        COALESCE(se_analiza, true)
    FROM gastos_staging
    WHERE procesado = false;

    GET DIAGNOSTICS v_detalle = ROW_COUNT;
    RAISE NOTICE 'Registros de detalle insertados: %', v_detalle;

    -- =========================================================================
    -- PASO 8: MARCAR COMO PROCESADOS
    -- =========================================================================
    UPDATE gastos_staging SET procesado = true WHERE procesado = false;

    RAISE NOTICE '¡Procesamiento de gastos completado!';

    -- =========================================================================
    -- PASO 9: RETORNAR RESULTADOS
    -- =========================================================================
    RETURN QUERY SELECT
        v_detalle,
        v_final_facturacion,
        v_final_ocupacion,
        v_final_movimiento,
        v_final_credito,
        v_final_rentabilidad,
        v_sin_clasificar,
        v_total_general;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PARTE 4: FUNCIÓN PARA LIMPIAR AMBAS TABLAS STAGING
-- ============================================================================

CREATE OR REPLACE FUNCTION limpiar_staging()
RETURNS void AS $$
BEGIN
    TRUNCATE TABLE ventas_staging RESTART IDENTITY;
    TRUNCATE TABLE gastos_staging RESTART IDENTITY;
    RAISE NOTICE 'Tablas staging limpiadas';
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PARTE 5: FUNCIÓN PARA VERIFICAR ESTADO ANTES DE PROCESAR
-- ============================================================================

CREATE OR REPLACE FUNCTION verificar_staging()
RETURNS TABLE (
    tabla VARCHAR,
    total_registros BIGINT,
    pendientes BIGINT,
    procesados BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'ventas_staging'::VARCHAR,
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE procesado = false)::BIGINT,
           COUNT(*) FILTER (WHERE procesado = true)::BIGINT
    FROM ventas_staging
    UNION ALL
    SELECT 'gastos_staging'::VARCHAR,
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE procesado = false)::BIGINT,
           COUNT(*) FILTER (WHERE procesado = true)::BIGINT
    FROM gastos_staging;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- INSTRUCCIONES DE USO
-- ============================================================================
/*

=== PASO 1: Verificar datos cargados ===
SELECT * FROM verificar_staging();

=== PASO 2: Procesar ventas (cambiar fecha al período correspondiente) ===
SELECT * FROM procesar_ventas_staging('2024-12-01');

=== PASO 3: Procesar gastos (misma fecha) ===
SELECT * FROM procesar_gastos_staging('2024-12-01');

=== PASO 4: Verificar resultados ===
SELECT COUNT(*) as metricas FROM metricas_producto WHERE periodo = '2024-12-01';
SELECT * FROM gastos_mensuales WHERE periodo = '2024-12-01';

=== PASO 5 (OPCIONAL): Limpiar staging ===
SELECT limpiar_staging();

=== NOTA IMPORTANTE ===
El período debe ser el PRIMER DÍA del mes en formato: 'YYYY-MM-01'
Ejemplos:
  - Diciembre 2024: '2024-12-01'
  - Enero 2025: '2025-01-01'

*/

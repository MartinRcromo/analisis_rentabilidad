-- ============================================================================
-- TABLA STAGING PARA IMPORTAR VENTAS DESDE CSV
-- ============================================================================
--
-- INSTRUCCIONES:
-- 1. Ejecuta este script en Supabase SQL Editor
-- 2. Exporta tu Excel a CSV (guardar como CSV UTF-8)
-- 3. En Supabase, ve a Table Editor > ventas_staging > Import
-- 4. Sube el CSV
-- 5. Ejecuta: SELECT procesar_ventas_staging('2025-12-01');
--
-- ============================================================================

-- Eliminar tabla si existe para recrearla limpia
DROP TABLE IF EXISTS ventas_staging CASCADE;

-- Crear tabla staging con los mismos campos del Excel
CREATE TABLE ventas_staging (
    id SERIAL PRIMARY KEY,
    empresa VARCHAR(20),
    periodo VARCHAR(20),
    subrubro VARCHAR(200),
    idproducto VARCHAR(50),
    producto VARCHAR(500),
    idproveedor VARCHAR(50),
    proveedor VARCHAR(300),
    idcomprador VARCHAR(20),
    idcategoria VARCHAR(20),
    stock_unidades NUMERIC(15,2),
    stock_costo NUMERIC(15,2),
    importe_ventas NUMERIC(15,2),
    importe_costo NUMERIC(15,2),
    stock_volumen NUMERIC(15,4),
    procesado BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_staging_procesado ON ventas_staging(procesado);
CREATE INDEX idx_staging_idproducto ON ventas_staging(idproducto);

-- ============================================================================
-- FUNCIÓN PARA PROCESAR LOS DATOS DE STAGING
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
    WHERE subrubro IS NOT NULL AND subrubro != ''
    ON CONFLICT (nombre) DO NOTHING;

    GET DIAGNOSTICS v_subrubros = ROW_COUNT;
    RAISE NOTICE 'Subrubros procesados: %', v_subrubros;

    -- 2. UPSERT PROVEEDORES
    INSERT INTO proveedores (codigo, nombre)
    SELECT DISTINCT idproveedor, proveedor
    FROM ventas_staging
    WHERE idproveedor IS NOT NULL AND idproveedor != ''
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;

    GET DIAGNOSTICS v_proveedores = ROW_COUNT;
    RAISE NOTICE 'Proveedores procesados: %', v_proveedores;

    -- 3. UPSERT COMPRADORES
    INSERT INTO compradores (codigo)
    SELECT DISTINCT idcomprador
    FROM ventas_staging
    WHERE idcomprador IS NOT NULL AND idcomprador != ''
    ON CONFLICT (codigo) DO NOTHING;

    GET DIAGNOSTICS v_compradores = ROW_COUNT;
    RAISE NOTICE 'Compradores procesados: %', v_compradores;

    -- 4. UPSERT CATEGORÍAS
    INSERT INTO categorias (codigo)
    SELECT DISTINCT idcategoria
    FROM ventas_staging
    WHERE idcategoria IS NOT NULL AND idcategoria != ''
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
    WHERE vs.idproducto IS NOT NULL AND vs.idproducto != ''
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

    -- 7. INSERTAR MÉTRICAS
    INSERT INTO metricas_producto (
        producto_id,
        periodo,
        importe_ventas,
        importe_costo,
        margen_bruto,
        markup_pct,
        stock_unidades,
        stock_costo,
        stock_volumen
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
        COALESCE(vs.stock_volumen, 0)
    FROM ventas_staging vs
    JOIN productos prod ON prod.codigo = vs.idproducto
    WHERE vs.idproducto IS NOT NULL;

    GET DIAGNOSTICS v_metricas = ROW_COUNT;
    RAISE NOTICE 'Métricas insertadas: %', v_metricas;

    -- 8. MARCAR COMO PROCESADOS
    UPDATE ventas_staging SET procesado = true;

    -- 9. RETORNAR RESULTADOS
    RETURN QUERY SELECT v_subrubros, v_proveedores, v_compradores, v_categorias, v_productos, v_metricas;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCIÓN PARA LIMPIAR STAGING DESPUÉS DE PROCESAR
-- ============================================================================

CREATE OR REPLACE FUNCTION limpiar_staging()
RETURNS void AS $$
BEGIN
    TRUNCATE TABLE ventas_staging RESTART IDENTITY;
    RAISE NOTICE 'Tabla ventas_staging limpiada';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EJEMPLO DE USO:
-- ============================================================================
--
-- 1. Importar CSV en Supabase Table Editor
-- 2. Ejecutar:
--    SELECT * FROM procesar_ventas_staging('2025-12-01');
-- 3. Limpiar staging (opcional):
--    SELECT limpiar_staging();
--
-- ============================================================================

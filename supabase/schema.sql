-- ============================================================================
-- SCHEMA DE BASE DE DATOS - SISTEMA DE ANÁLISIS DE RENTABILIDAD
-- ============================================================================

-- ============================================================================
-- MAESTROS
-- ============================================================================

CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(10) UNIQUE NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    activo BOOLEAN DEFAULT true
);

INSERT INTO empresas (codigo, nombre) VALUES
    ('Cromo', 'Cromosol'),
    ('BBA', 'BBA')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(300) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compradores (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(200),
    email VARCHAR(200),
    activo BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(200),
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS subrubros (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) UNIQUE NOT NULL,
    rubro_padre VARCHAR(200),
    activo BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(500) NOT NULL,
    empresa VARCHAR(10) NOT NULL,
    subrubro_id INTEGER REFERENCES subrubros(id),
    proveedor_id INTEGER REFERENCES proveedores(id),
    comprador_id INTEGER REFERENCES compradores(id),
    categoria_id INTEGER REFERENCES categorias(id),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(codigo, empresa),
    CHECK (empresa IN ('Cromo', 'BBA'))
);

CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos(empresa);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_empresa ON productos(codigo, empresa);
CREATE INDEX IF NOT EXISTS idx_productos_subrubro ON productos(subrubro_id);
CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id);

-- ============================================================================
-- DATOS MENSUALES
-- ============================================================================

CREATE TABLE IF NOT EXISTS metricas_producto (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER REFERENCES productos(id),
    periodo DATE NOT NULL,

    -- Ventas y costos
    importe_ventas NUMERIC(15,2),
    importe_costo NUMERIC(15,2),
    margen_bruto NUMERIC(15,2),
    markup_pct NUMERIC(8,4),

    -- Stock
    stock_unidades NUMERIC(10,2),
    stock_costo NUMERIC(15,2),
    stock_volumen NUMERIC(10,4),

    -- Movimiento (para categoría 5)
    unidades_vendidas NUMERIC(12,2) DEFAULT 0,
    veces_pedido NUMERIC(10,0) DEFAULT 0,

    UNIQUE(producto_id, periodo),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metricas_periodo ON metricas_producto(periodo);
CREATE INDEX IF NOT EXISTS idx_metricas_producto_id ON metricas_producto(producto_id);

-- ============================================================================
-- GASTOS MENSUALES
-- ============================================================================

CREATE TABLE IF NOT EXISTS gastos_mensuales (
    id SERIAL PRIMARY KEY,
    periodo DATE NOT NULL UNIQUE,

    -- Totales BASE (antes de ajuste)
    cat1_facturacion_base NUMERIC(15,2) NOT NULL,
    cat2_volumen_base NUMERIC(15,2) NOT NULL,
    cat3_credito_base NUMERIC(15,2) NOT NULL,
    cat4_rentabilidad_base NUMERIC(15,2) NOT NULL,
    cat5_movimiento_base NUMERIC(15,2) DEFAULT 0,
    total_clasificado NUMERIC(15,2) NOT NULL,

    -- Sin clasificar
    total_sin_clasificar NUMERIC(15,2) NOT NULL,
    total_general NUMERIC(15,2) NOT NULL,

    -- Pesos (%) de cada categoría
    peso_facturacion NUMERIC(10,8) NOT NULL,
    peso_volumen NUMERIC(10,8) NOT NULL,
    peso_credito NUMERIC(10,8) NOT NULL,
    peso_rentabilidad NUMERIC(10,8) NOT NULL,
    peso_movimiento NUMERIC(10,8) DEFAULT 0,

    -- Totales FINALES (después de ajuste)
    cat1_facturacion_final NUMERIC(15,2) NOT NULL,
    cat2_volumen_final NUMERIC(15,2) NOT NULL,
    cat3_credito_final NUMERIC(15,2) NOT NULL,
    cat4_rentabilidad_final NUMERIC(15,2) NOT NULL,
    cat5_movimiento_final NUMERIC(15,2) DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gastos_detalle (
    id SERIAL PRIMARY KEY,
    gastos_mensuales_id INTEGER REFERENCES gastos_mensuales(id),
    periodo DATE NOT NULL,
    gerencia VARCHAR(100),
    sector VARCHAR(100),
    tipogasto VARCHAR(100),
    proveedorgasto VARCHAR(300),
    comprobante VARCHAR(100),
    idcomprobante VARCHAR(100),
    empresa VARCHAR(10),
    empresatipo VARCHAR(50),
    importe_gasto NUMERIC(15,2),
    clasificacion VARCHAR(20),
    se_analiza BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_gastos_detalle_periodo ON gastos_detalle(periodo);
CREATE INDEX IF NOT EXISTS idx_gastos_detalle_clasificacion ON gastos_detalle(clasificacion);

CREATE TABLE IF NOT EXISTS gastos_clasificacion_maestra (
    id SERIAL PRIMARY KEY,
    sector VARCHAR(100) NOT NULL,
    tipogasto VARCHAR(100) NOT NULL,
    clasificacion VARCHAR(20),
    se_analiza BOOLEAN DEFAULT false,
    UNIQUE(sector, tipogasto)
);

-- Insertar clasificaciones maestras comunes
INSERT INTO gastos_clasificacion_maestra (sector, tipogasto, clasificacion, se_analiza) VALUES
    ('Logística', 'Sueldos', 'Volumen', true),
    ('Logística', 'Fletes', 'Volumen', true),
    ('Logística', 'Alquileres', 'Volumen', true),
    ('Logística', 'Servicios', 'Volumen', true),
    ('Administración Y Finanzas', 'IIBB', 'Facturacion', true),
    ('Administración Y Finanzas', 'Intereses Bancarios', 'Credito', true),
    ('Administración Y Finanzas', 'Sueldos', 'Facturacion', true),
    ('Administración Y Finanzas', 'IIGG', 'Rentabilidad', true),
    ('Comercial', 'Sueldos', 'Facturacion', true),
    ('Comercial', 'Comisiones', 'Facturacion', true),
    ('Comercial', 'Publicidad', 'Facturacion', true)
ON CONFLICT (sector, tipogasto) DO NOTHING;

-- ============================================================================
-- RESULTADOS CALCULADOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS analisis_producto (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER REFERENCES productos(id),
    periodo DATE NOT NULL,

    -- Porcentajes de asignación (5 categorías)
    porcentaje_facturacion NUMERIC(12,10),
    porcentaje_volumen NUMERIC(12,10),
    porcentaje_credito NUMERIC(12,10),
    porcentaje_markup NUMERIC(12,10),
    porcentaje_movimiento NUMERIC(12,10) DEFAULT 0,

    -- Gastos asignados (5 categorías)
    gasto_facturacion NUMERIC(15,2),
    gasto_volumen NUMERIC(15,2),
    gasto_credito NUMERIC(15,2),
    gasto_markup NUMERIC(15,2),
    gasto_movimiento NUMERIC(15,2) DEFAULT 0,
    gasto_total NUMERIC(15,2),

    -- Resultado
    resultado NUMERIC(15,2),
    en_perdida BOOLEAN,
    markup_minimo_pct NUMERIC(8,4),
    cumple_objetivo BOOLEAN,

    UNIQUE(producto_id, periodo),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analisis_periodo ON analisis_producto(periodo);
CREATE INDEX IF NOT EXISTS idx_analisis_perdida ON analisis_producto(en_perdida) WHERE en_perdida = true;

-- ============================================================================
-- ACCIONES CORRECTIVAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS acciones_subrubro (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER REFERENCES productos(id),
    subrubro_id INTEGER REFERENCES subrubros(id),
    proveedor_id INTEGER REFERENCES proveedores(id),
    periodo DATE NOT NULL,
    tipo_accion VARCHAR(50),
    descripcion TEXT,
    impacto_estimado NUMERIC(15,2),
    responsable_id UUID,
    estado VARCHAR(20) DEFAULT 'pendiente',
    fecha_creacion TIMESTAMP DEFAULT NOW(),
    fecha_cierre TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_acciones_estado ON acciones_subrubro(estado);

-- ============================================================================
-- VISTAS MATERIALIZADAS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS analisis_proveedor AS
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

CREATE MATERIALIZED VIEW IF NOT EXISTS analisis_subrubro AS
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

-- ============================================================================
-- FUNCIONES AUXILIARES
-- ============================================================================

-- Función para refrescar vistas materializadas
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW analisis_proveedor;
    REFRESH MATERIALIZED VIEW analisis_subrubro;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener totales del período
CREATE OR REPLACE FUNCTION get_totales_periodo(p_periodo DATE)
RETURNS TABLE (
    total_facturacion NUMERIC,
    total_volumen_m3 NUMERIC,
    total_stock_valorizado NUMERIC,
    total_margen_bruto NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(m.importe_ventas), 0)::NUMERIC as total_facturacion,
        COALESCE(SUM(m.stock_volumen), 0)::NUMERIC as total_volumen_m3,
        COALESCE(SUM(m.stock_costo), 0)::NUMERIC as total_stock_valorizado,
        COALESCE(SUM(m.margen_bruto), 0)::NUMERIC as total_margen_bruto
    FROM metricas_producto m
    WHERE m.periodo = p_periodo;
END;
$$ LANGUAGE plpgsql;

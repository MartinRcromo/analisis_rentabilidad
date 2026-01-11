// Tipos base de la base de datos

export interface Empresa {
  id: number;
  codigo: 'Cromo' | 'BBA';
  nombre: string;
  activo: boolean;
}

export interface Proveedor {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  created_at: string;
}

export interface Comprador {
  id: number;
  codigo: string;
  nombre: string | null;
  email: string | null;
  activo: boolean;
}

export interface Categoria {
  id: number;
  codigo: string;
  nombre: string | null;
  descripcion: string | null;
}

export interface Subrubro {
  id: number;
  nombre: string;
  rubro_padre: string | null;
  activo: boolean;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  empresa: 'Cromo' | 'BBA';
  subrubro_id: number | null;
  proveedor_id: number | null;
  comprador_id: number | null;
  categoria_id: number | null;
  activo: boolean;
  created_at: string;
}

export interface MetricasProducto {
  id: number;
  producto_id: number;
  periodo: string;
  importe_ventas: number;
  importe_costo: number;
  margen_bruto: number;
  markup_pct: number;
  stock_unidades: number;
  stock_costo: number;
  stock_volumen: number;
  created_at: string;
}

export interface GastosMensuales {
  id: number;
  periodo: string;
  cat1_facturacion_base: number;
  cat2_volumen_base: number;
  cat3_credito_base: number;
  cat4_rentabilidad_base: number;
  total_clasificado: number;
  total_sin_clasificar: number;
  total_general: number;
  peso_facturacion: number;
  peso_volumen: number;
  peso_credito: number;
  peso_rentabilidad: number;
  cat1_facturacion_final: number;
  cat2_volumen_final: number;
  cat3_credito_final: number;
  cat4_rentabilidad_final: number;
  created_at: string;
}

export interface GastoDetalle {
  id: number;
  gastos_mensuales_id: number;
  periodo: string;
  gerencia: string | null;
  sector: string | null;
  tipogasto: string | null;
  proveedorgasto: string | null;
  comprobante: string | null;
  idcomprobante: string | null;
  empresa: string | null;
  empresatipo: string | null;
  importe_gasto: number;
  clasificacion: string | null;
  se_analiza: boolean;
}

export interface GastosClasificacionMaestra {
  id: number;
  sector: string;
  tipogasto: string;
  clasificacion: string | null;
  se_analiza: boolean;
}

export interface AnalisisProducto {
  id: number;
  producto_id: number;
  periodo: string;
  porcentaje_facturacion: number;
  porcentaje_volumen: number;
  porcentaje_credito: number;
  porcentaje_markup: number;
  gasto_facturacion: number;
  gasto_volumen: number;
  gasto_credito: number;
  gasto_markup: number;
  gasto_total: number;
  resultado: number;
  en_perdida: boolean;
  markup_minimo_pct: number;
  cumple_objetivo: boolean;
  created_at: string;
}

export interface AccionSubrubro {
  id: number;
  producto_id: number | null;
  subrubro_id: number | null;
  proveedor_id: number | null;
  periodo: string;
  tipo_accion: string | null;
  descripcion: string | null;
  impacto_estimado: number | null;
  responsable_id: string | null;
  estado: 'pendiente' | 'en_proceso' | 'completada';
  fecha_creacion: string;
  fecha_cierre: string | null;
}

// Tipos extendidos para vistas y joins

export interface ProductoConRelaciones extends Producto {
  subrubro?: Subrubro;
  proveedor?: Proveedor;
  comprador?: Comprador;
  categoria?: Categoria;
  metricas?: MetricasProducto;
  analisis?: AnalisisProducto;
}

export interface AnalisisProveedorView {
  periodo: string;
  empresa: string;
  proveedor_id: number;
  proveedor: string;
  subrubro_id: number;
  subrubro: string;
  total_productos: number;
  total_ventas: number;
  total_costo: number;
  total_margen: number;
  total_gastos: number;
  resultado: number;
  markup_promedio: number;
  productos_perdida: number;
}

export interface AnalisisSubrubroView {
  periodo: string;
  empresa: string;
  subrubro_id: number;
  subrubro: string;
  total_productos: number;
  total_proveedores: number;
  total_ventas: number;
  total_costo: number;
  total_margen: number;
  total_gastos: number;
  resultado: number;
  markup_promedio: number;
  productos_perdida: number;
  stock_valorizado: number;
  stock_volumen: number;
}

// Tipos para datos de entrada (Excel)

export interface VentaExcelRow {
  periodo: number;
  empresa: string;
  subrubro: string;
  idproducto: string;
  producto: string;
  idproveedor: string;
  proveedor: string;
  idcomprador: string;
  idcategoria: string;
  importe_costo: number;
  stock_unidades: number;
  stock_costo: number;
  importe_Ventas: number;
  stock_volumen: number;
}

export interface GastoExcelRow {
  gerencia: string;
  sector: string;
  tipogasto: string;
  proveedorgasto: string;
  comprobante: string;
  idcomprobante: string;
  empresa: string;
  empresatipo: string;
  importe_gasto: number;
  periodo: string;
  Clasificacion: string;
  'concatenar sector+tipogasto': string;
}

// Tipos para respuestas de API

export interface DashboardData {
  resumen: {
    total_productos: number;
    productos_perdida: number;
    perdida_total: number;
    beneficio_total: number;
    resultado_neto: number;
    pct_perdida: number;
  };
  evolucion_6_meses: Array<{
    periodo: string;
    beneficio: number;
    perdida: number;
    resultado: number;
  }>;
  distribucion_gastos: {
    facturacion: number;
    volumen: number;
    credito: number;
    rentabilidad: number;
  };
  top_peores: AnalisisSubrubroView[];
  top_mejores: AnalisisSubrubroView[];
}

export interface SimulacionResultado {
  nuevo_markup_pct: number;
  nuevo_precio: number;
  nuevas_ventas: number;
  nuevo_margen: number;
  nuevo_stock_unidades: number;
  nuevo_gasto_total: number;
  nuevo_resultado: number;
  en_perdida: boolean;
  ahorro_credito: number;
  ahorro_volumen: number;
  mejora_resultado: number;
}

export interface Recomendacion {
  prioridad: 'critica' | 'alta' | 'media' | 'baja';
  tipo: 'subir_markup' | 'reducir_stock' | 'evaluar_proveedor' | 'otro';
  descripcion: string;
  impacto_estimado: number | null;
}

// Tipos para filtros

export interface ProductoFiltros {
  periodo?: string;
  empresa?: 'Cromo' | 'BBA' | 'todas';
  subrubro_id?: number[];
  proveedor_id?: number[];
  estado?: 'todos' | 'perdida' | 'beneficio';
  busqueda?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pages: number;
    hasMore: boolean;
  };
}

// Tipos para totales de período

export interface TotalesPeriodo {
  total_facturacion: number;
  total_volumen_m3: number;
  total_stock_valorizado: number;
  total_margen_bruto: number;
  gastos_facturacion: number;
  gastos_volumen: number;
  gastos_credito: number;
  gastos_rentabilidad: number;
}

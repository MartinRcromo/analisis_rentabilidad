import { Recomendacion, ProductoConRelaciones, AnalisisProducto, MetricasProducto } from '@/types/database';

interface ProductoCompleto {
  producto: ProductoConRelaciones;
  metricas: MetricasProducto;
  analisis: AnalisisProducto;
}

export function generarRecomendaciones(data: ProductoCompleto): Recomendacion[] {
  const recomendaciones: Recomendacion[] = [];
  const { metricas, analisis } = data;

  // 1. Producto en pérdida - Recomendar subir markup
  if (analisis.en_perdida && metricas.markup_pct < analisis.markup_minimo_pct) {
    const brecha = analisis.markup_minimo_pct - metricas.markup_pct;
    const impacto = Math.abs(analisis.resultado);

    recomendaciones.push({
      prioridad: brecha > 30 ? 'critica' : brecha > 15 ? 'alta' : 'media',
      tipo: 'subir_markup',
      descripcion: `Aumentar mark-up de ${metricas.markup_pct.toFixed(2)}% a mínimo ${analisis.markup_minimo_pct.toFixed(2)}% (+${brecha.toFixed(2)} puntos porcentuales)`,
      impacto_estimado: impacto,
    });
  }

  // 2. Exceso de stock - Recomendar reducción
  if (metricas.stock_unidades > 0 && metricas.importe_ventas > 0) {
    // Estimar unidades vendidas por mes
    // Usamos una aproximación basada en ventas/costo promedio
    const costoPromedioPorUnidad =
      metricas.stock_unidades > 0 ? metricas.stock_costo / metricas.stock_unidades : 0;

    const unidadesVendidasEstimadas =
      costoPromedioPorUnidad > 0 ? metricas.importe_costo / costoPromedioPorUnidad : 0;

    const mesesStock =
      unidadesVendidasEstimadas > 0 ? metricas.stock_unidades / unidadesVendidasEstimadas : 0;

    if (mesesStock > 6) {
      // Stock ideal = 3 meses de venta
      const stockIdeal = unidadesVendidasEstimadas * 3;
      const exceso = metricas.stock_unidades - stockIdeal;
      const pctExceso = metricas.stock_unidades > 0 ? (exceso / metricas.stock_unidades) * 100 : 0;

      // Ahorro estimado en gasto de crédito
      const ahorroCredito = pctExceso > 0 ? (pctExceso / 100) * analisis.gasto_credito : 0;

      recomendaciones.push({
        prioridad: mesesStock > 12 ? 'alta' : 'media',
        tipo: 'reducir_stock',
        descripcion: `Reducir stock en ${exceso.toFixed(0)} unidades (de ${mesesStock.toFixed(1)} a 3 meses)`,
        impacto_estimado: ahorroCredito,
      });
    }
  }

  // 3. Evaluar cambio de proveedor si está en pérdida significativa
  if (analisis.en_perdida && Math.abs(analisis.resultado) > 1000000) {
    // Más de $1M de pérdida
    recomendaciones.push({
      prioridad: 'media',
      tipo: 'evaluar_proveedor',
      descripcion: 'Evaluar proveedores alternativos con mejor margen en el mismo subrubro',
      impacto_estimado: null,
    });
  }

  // 4. Alerta por gasto de volumen alto (producto ocupa mucho espacio)
  if (analisis.gasto_volumen > analisis.gasto_total * 0.3) {
    // Más del 30% del gasto es por volumen
    recomendaciones.push({
      prioridad: 'baja',
      tipo: 'otro',
      descripcion:
        'Producto con alto costo de almacenamiento. Evaluar embalaje más compacto o rotación más rápida.',
      impacto_estimado: analisis.gasto_volumen * 0.2, // Potencial ahorro del 20%
    });
  }

  // Ordenar por prioridad
  const prioridadOrden = { critica: 0, alta: 1, media: 2, baja: 3 };
  recomendaciones.sort((a, b) => prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad]);

  return recomendaciones;
}

// Generar texto resumen de situación
export function generarResumenSituacion(data: ProductoCompleto): {
  estado: 'critico' | 'alerta' | 'normal' | 'optimo';
  titulo: string;
  descripcion: string;
  indicadores: Array<{ label: string; valor: string; estado: 'ok' | 'warning' | 'error' }>;
} {
  const { metricas, analisis } = data;
  const brecha = analisis.markup_minimo_pct - metricas.markup_pct;

  // Determinar estado
  let estado: 'critico' | 'alerta' | 'normal' | 'optimo';
  let titulo: string;
  let descripcion: string;

  if (analisis.en_perdida && brecha > 30) {
    estado = 'critico';
    titulo = 'CRÍTICO: Pérdida significativa';
    descripcion = `Este producto genera una pérdida de $${formatNumber(Math.abs(analisis.resultado))}. Se requiere acción inmediata.`;
  } else if (analisis.en_perdida) {
    estado = 'alerta';
    titulo = 'ALERTA: Producto en pérdida';
    descripcion = `El producto no cubre sus gastos asignados. Pérdida: $${formatNumber(Math.abs(analisis.resultado))}.`;
  } else if (analisis.cumple_objetivo) {
    estado = 'optimo';
    titulo = 'ÓPTIMO: Producto rentable';
    descripcion = `El producto genera un beneficio de $${formatNumber(analisis.resultado)} y supera el markup mínimo.`;
  } else {
    estado = 'normal';
    titulo = 'NORMAL: En equilibrio';
    descripcion = 'El producto cubre sus costos pero podría mejorar su rentabilidad.';
  }

  // Indicadores
  const indicadores = [
    {
      label: 'Mark-up Real',
      valor: `${metricas.markup_pct.toFixed(2)}%`,
      estado: metricas.markup_pct >= analisis.markup_minimo_pct ? 'ok' : 'error',
    },
    {
      label: 'Mark-up Mínimo',
      valor: `${analisis.markup_minimo_pct.toFixed(2)}%`,
      estado: 'ok',
    },
    {
      label: 'Brecha',
      valor: `${brecha > 0 ? '-' : '+'}${Math.abs(brecha).toFixed(2)} pp`,
      estado: brecha > 0 ? 'error' : 'ok',
    },
    {
      label: 'Resultado',
      valor: `$${formatNumber(analisis.resultado)}`,
      estado: analisis.en_perdida ? 'error' : 'ok',
    },
  ] as Array<{ label: string; valor: string; estado: 'ok' | 'warning' | 'error' }>;

  return { estado, titulo, descripcion, indicadores };
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
  }).format(num);
}

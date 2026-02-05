import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const subrubroId = parseInt(id);

    if (isNaN(subrubroId)) {
      return NextResponse.json({ error: 'ID de subrubro inválido' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');
    const empresa = searchParams.get('empresa') || 'todas';

    const supabase = createAdminClient();

    // 1. Determinar período (el más reciente si no se especifica)
    let periodoActual = periodo;
    if (!periodoActual) {
      const { data: ultimoPeriodo } = await supabase
        .from('metricas_producto')
        .select('periodo')
        .order('periodo', { ascending: false })
        .limit(1)
        .single();

      if (ultimoPeriodo) {
        periodoActual = ultimoPeriodo.periodo;
      } else {
        return NextResponse.json({ error: 'No hay datos disponibles' }, { status: 404 });
      }
    }

    // 2. Obtener datos del subrubro
    const { data: subrubro } = await supabase
      .from('subrubros')
      .select('id, nombre')
      .eq('id', subrubroId)
      .single();

    if (!subrubro) {
      return NextResponse.json({ error: 'Subrubro no encontrado' }, { status: 404 });
    }

    // 3. Obtener gastos mensuales del período (con movimiento)
    const { data: gastosPeriodo } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodoActual)
      .single();

    // 4. Obtener todos los productos del subrubro con sus métricas y análisis
    let productosQuery = supabase
      .from('productos')
      .select(`
        id,
        codigo,
        nombre,
        empresa,
        proveedor:proveedores(id, nombre),
        metricas:metricas_producto!inner(
          importe_ventas,
          importe_costo,
          margen_bruto,
          markup_pct,
          stock_unidades,
          stock_costo,
          stock_volumen,
          unidades_vendidas,
          veces_pedido
        ),
        analisis:analisis_producto!inner(
          porcentaje_facturacion,
          porcentaje_volumen,
          porcentaje_credito,
          porcentaje_markup,
          porcentaje_movimiento,
          gasto_facturacion,
          gasto_volumen,
          gasto_credito,
          gasto_markup,
          gasto_movimiento,
          gasto_total,
          resultado,
          en_perdida,
          markup_minimo_pct,
          cumple_objetivo
        )
      `)
      .eq('subrubro_id', subrubroId)
      .eq('metricas.periodo', periodoActual)
      .eq('analisis.periodo', periodoActual);

    if (empresa !== 'todas') {
      productosQuery = productosQuery.eq('empresa', empresa);
    }

    const { data: productosData, error: productosError } = await productosQuery;

    if (productosError) {
      console.error('Error obteniendo productos:', productosError);
      return NextResponse.json({ error: 'Error obteniendo productos', details: productosError.message }, { status: 500 });
    }

    // 5. Transformar y calcular agregados
    const productos = (productosData || []).map((p) => {
      const m = Array.isArray(p.metricas) ? p.metricas[0] : p.metricas;
      const a = Array.isArray(p.analisis) ? p.analisis[0] : p.analisis;
      const prov = Array.isArray(p.proveedor) ? p.proveedor[0] : p.proveedor;

      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        empresa: p.empresa,
        proveedor: prov?.nombre || 'Sin proveedor',
        proveedor_id: prov?.id || null,
        // Métricas
        importe_ventas: Number(m?.importe_ventas) || 0,
        importe_costo: Number(m?.importe_costo) || 0,
        margen_bruto: Number(m?.margen_bruto) || 0,
        markup_pct: Number(m?.markup_pct) || 0,
        stock_unidades: Number(m?.stock_unidades) || 0,
        stock_costo: Number(m?.stock_costo) || 0,
        stock_volumen: Number(m?.stock_volumen) || 0,
        unidades_vendidas: Number(m?.unidades_vendidas) || 0,
        veces_pedido: Number(m?.veces_pedido) || 0,
        // Análisis - Gastos desglosados
        gasto_facturacion: Number(a?.gasto_facturacion) || 0,
        gasto_volumen: Number(a?.gasto_volumen) || 0,
        gasto_credito: Number(a?.gasto_credito) || 0,
        gasto_markup: Number(a?.gasto_markup) || 0,
        gasto_movimiento: Number(a?.gasto_movimiento) || 0,
        gasto_total: Number(a?.gasto_total) || 0,
        resultado: Number(a?.resultado) || 0,
        en_perdida: a?.en_perdida || false,
        markup_minimo_pct: Number(a?.markup_minimo_pct) || 0,
        cumple_objetivo: a?.cumple_objetivo || false,
      };
    });

    // 6. Calcular totales del subrubro
    const totales = productos.reduce(
      (acc, p) => {
        acc.total_productos++;
        acc.importe_ventas += p.importe_ventas;
        acc.importe_costo += p.importe_costo;
        acc.margen_bruto += p.margen_bruto;
        acc.stock_costo += p.stock_costo;
        acc.stock_volumen += p.stock_volumen;
        acc.unidades_vendidas += p.unidades_vendidas;
        acc.veces_pedido += p.veces_pedido;
        // Gastos por categoría
        acc.gasto_facturacion += p.gasto_facturacion;
        acc.gasto_volumen += p.gasto_volumen;
        acc.gasto_credito += p.gasto_credito;
        acc.gasto_markup += p.gasto_markup;
        acc.gasto_movimiento += p.gasto_movimiento;
        acc.gasto_total += p.gasto_total;
        acc.resultado += p.resultado;
        if (p.en_perdida) acc.productos_perdida++;
        return acc;
      },
      {
        total_productos: 0,
        importe_ventas: 0,
        importe_costo: 0,
        margen_bruto: 0,
        stock_costo: 0,
        stock_volumen: 0,
        unidades_vendidas: 0,
        veces_pedido: 0,
        gasto_facturacion: 0,
        gasto_volumen: 0,
        gasto_credito: 0,
        gasto_markup: 0,
        gasto_movimiento: 0,
        gasto_total: 0,
        resultado: 0,
        productos_perdida: 0,
      }
    );

    // Calcular markup promedio ponderado por costo
    const markup_promedio = totales.importe_costo > 0
      ? (totales.margen_bruto / totales.importe_costo) * 100
      : 0;

    // Calcular markup mínimo promedio ponderado
    const markup_minimo_promedio = totales.importe_costo > 0
      ? (totales.gasto_total / totales.importe_costo) * 100
      : 0;

    // 7. Generar acciones sugeridas automáticas
    const acciones_sugeridas = generarAccionesSugeridas(productos, totales, gastosPeriodo);

    // 8. Respuesta
    return NextResponse.json({
      periodo: periodoActual,
      empresa,
      subrubro: {
        id: subrubro.id,
        nombre: subrubro.nombre,
      },
      totales: {
        ...totales,
        markup_promedio,
        markup_minimo_promedio,
        en_perdida: totales.resultado < 0,
      },
      gastos_periodo: {
        facturacion: Number(gastosPeriodo?.cat1_facturacion_final) || 0,
        ocupacion: Number(gastosPeriodo?.cat2_volumen_final) || 0,
        credito: Number(gastosPeriodo?.cat3_credito_final) || 0,
        rentabilidad: Number(gastosPeriodo?.cat4_rentabilidad_final) || 0,
        movimiento: Number(gastosPeriodo?.cat5_movimiento_final) || 0,
        total: Number(gastosPeriodo?.total_general) || 0,
      },
      productos,
      acciones_sugeridas,
    });
  } catch (error) {
    console.error('Error en API subrubro detalle:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

// Función para generar acciones sugeridas automáticamente
interface ProductoAnalizado {
  id: number;
  nombre: string;
  codigo: string;
  resultado: number;
  en_perdida: boolean;
  markup_pct: number;
  markup_minimo_pct: number;
  stock_volumen: number;
  stock_costo: number;
  importe_ventas: number;
  veces_pedido: number;
  gasto_facturacion: number;
  gasto_volumen: number;
  gasto_credito: number;
  gasto_movimiento: number;
  gasto_total: number;
}

interface Totales {
  resultado: number;
  stock_volumen: number;
  stock_costo: number;
  gasto_facturacion: number;
  gasto_volumen: number;
  gasto_credito: number;
  gasto_movimiento: number;
  gasto_total: number;
  importe_ventas: number;
  importe_costo: number;
  margen_bruto: number;
  productos_perdida: number;
}

interface GastosPeriodo {
  cat1_facturacion_final?: number;
  cat2_volumen_final?: number;
  cat3_credito_final?: number;
  cat5_movimiento_final?: number;
}

function generarAccionesSugeridas(
  productos: ProductoAnalizado[],
  totales: Totales,
  gastosPeriodo: GastosPeriodo | null
): Array<{
  tipo: string;
  prioridad: 'alta' | 'media' | 'baja';
  descripcion: string;
  impacto_estimado: number;
  productos_afectados: number;
  detalle: string;
}> {
  const acciones: Array<{
    tipo: string;
    prioridad: 'alta' | 'media' | 'baja';
    descripcion: string;
    impacto_estimado: number;
    productos_afectados: number;
    detalle: string;
  }> = [];

  // Productos en pérdida
  const productosEnPerdida = productos.filter(p => p.en_perdida);

  // 1. ACCIÓN: Ajustar markup de productos en pérdida
  if (productosEnPerdida.length > 0) {
    // Calcular cuánto markup adicional necesitan en promedio
    const ajusteMarkupNecesario = productosEnPerdida.reduce((sum, p) => {
      const diferencia = p.markup_minimo_pct - p.markup_pct;
      return sum + Math.max(0, diferencia);
    }, 0) / productosEnPerdida.length;

    // Estimar impacto: si suben el markup, cuánto mejoraría el resultado
    const impactoMarkup = Math.abs(productosEnPerdida.reduce((sum, p) => sum + p.resultado, 0));

    acciones.push({
      tipo: 'AJUSTAR_MARKUP',
      prioridad: 'alta',
      descripcion: `Aumentar markup en ${ajusteMarkupNecesario.toFixed(0)}% promedio`,
      impacto_estimado: impactoMarkup,
      productos_afectados: productosEnPerdida.length,
      detalle: `${productosEnPerdida.length} productos tienen markup por debajo del mínimo necesario. El ajuste promedio requerido es de ${ajusteMarkupNecesario.toFixed(1)}% para cubrir gastos.`,
    });
  }

  // 2. ACCIÓN: Reducir stock de productos con bajo movimiento
  const productosStockAlto = productos
    .filter(p => p.stock_volumen > 0 && p.veces_pedido <= 2)
    .sort((a, b) => b.stock_costo - a.stock_costo);

  if (productosStockAlto.length > 0) {
    const stockInmovilizado = productosStockAlto.reduce((sum, p) => sum + p.stock_costo, 0);
    const volumenInmovilizado = productosStockAlto.reduce((sum, p) => sum + p.stock_volumen, 0);

    // Impacto: ahorro en gastos de crédito y ocupación
    const pctStockTotal = totales.stock_costo > 0 ? stockInmovilizado / totales.stock_costo : 0;
    const ahorroCredito = pctStockTotal * (gastosPeriodo?.cat3_credito_final || 0);
    const pctVolumenTotal = totales.stock_volumen > 0 ? volumenInmovilizado / totales.stock_volumen : 0;
    const ahorroOcupacion = pctVolumenTotal * (gastosPeriodo?.cat2_volumen_final || 0);

    acciones.push({
      tipo: 'REDUCIR_STOCK',
      prioridad: productosStockAlto.length > 5 ? 'alta' : 'media',
      descripcion: `Revisar ${productosStockAlto.length} productos con stock sin rotación`,
      impacto_estimado: ahorroCredito + ahorroOcupacion,
      productos_afectados: productosStockAlto.length,
      detalle: `$${(stockInmovilizado / 1000).toFixed(0)}K en stock y ${volumenInmovilizado.toFixed(1)} m³ ocupados por productos con ≤2 pedidos. Liberar este stock podría ahorrar $${((ahorroCredito + ahorroOcupacion) / 1000).toFixed(0)}K en gastos de crédito y ocupación.`,
    });
  }

  // 3. ACCIÓN: Optimizar unidades de venta para productos de alto movimiento
  const productosAltoMovimiento = productos
    .filter(p => p.veces_pedido >= 10 && p.en_perdida)
    .sort((a, b) => b.veces_pedido - a.veces_pedido);

  if (productosAltoMovimiento.length > 0) {
    const gastoMovimientoTotal = productosAltoMovimiento.reduce((sum, p) => sum + p.gasto_movimiento, 0);

    acciones.push({
      tipo: 'OPTIMIZAR_UNIDAD_VENTA',
      prioridad: 'media',
      descripcion: `Aumentar unidad de venta en ${productosAltoMovimiento.length} productos`,
      impacto_estimado: gastoMovimientoTotal * 0.3, // Estimar 30% de ahorro si se reduce movimiento
      productos_afectados: productosAltoMovimiento.length,
      detalle: `Productos con muchos pedidos pero en pérdida. Aumentar la unidad mínima de venta (ej: de 1 a 10) reduce el gasto de movimiento por cada operación.`,
    });
  }

  // 4. ACCIÓN: Revisar productos con alto gasto de ocupación
  const productosAltaOcupacion = productos
    .filter(p => {
      const pctGastoOcupacion = p.gasto_total > 0 ? p.gasto_volumen / p.gasto_total : 0;
      return pctGastoOcupacion > 0.4 && p.en_perdida; // Más del 40% es ocupación
    })
    .sort((a, b) => b.gasto_volumen - a.gasto_volumen);

  if (productosAltaOcupacion.length > 0) {
    const gastoOcupacionEvitable = productosAltaOcupacion.reduce((sum, p) => sum + p.gasto_volumen, 0);

    acciones.push({
      tipo: 'REDUCIR_VOLUMEN_STOCK',
      prioridad: 'media',
      descripcion: `Reducir m³ de ${productosAltaOcupacion.length} productos voluminosos`,
      impacto_estimado: gastoOcupacionEvitable * 0.5,
      productos_afectados: productosAltaOcupacion.length,
      detalle: `Productos donde el gasto de ocupación (m³) representa más del 40% del gasto total. Reducir el stock físico o negociar entregas fraccionadas con proveedores.`,
    });
  }

  // 5. ACCIÓN: Productos con alto capital inmovilizado
  const productosAltoCosto = productos
    .filter(p => {
      const pctGastoCredito = p.gasto_total > 0 ? p.gasto_credito / p.gasto_total : 0;
      return pctGastoCredito > 0.3 && p.en_perdida;
    })
    .sort((a, b) => b.stock_costo - a.stock_costo);

  if (productosAltoCosto.length > 0) {
    const capitalInmovilizado = productosAltoCosto.reduce((sum, p) => sum + p.stock_costo, 0);

    acciones.push({
      tipo: 'REDUCIR_CAPITAL_INMOVILIZADO',
      prioridad: 'alta',
      descripcion: `Liberar $${(capitalInmovilizado / 1000).toFixed(0)}K de capital inmovilizado`,
      impacto_estimado: productosAltoCosto.reduce((sum, p) => sum + p.gasto_credito, 0),
      productos_afectados: productosAltoCosto.length,
      detalle: `${productosAltoCosto.length} productos con alto costo de crédito (intereses sobre stock). Reducir niveles de stock o mejorar rotación.`,
    });
  }

  // 6. ANÁLISIS GENERAL: ¿Podría independizarse el negocio?
  if (totales.resultado < 0) {
    const deficitMensual = Math.abs(totales.resultado);
    const pctFacturacion = totales.gasto_facturacion / totales.gasto_total * 100;
    const pctOcupacion = totales.gasto_volumen / totales.gasto_total * 100;
    const pctCredito = totales.gasto_credito / totales.gasto_total * 100;
    const pctMovimiento = totales.gasto_movimiento / totales.gasto_total * 100;

    // Identificar el gasto que más pesa
    const gastoMayor = [
      { nombre: 'Facturación', pct: pctFacturacion, valor: totales.gasto_facturacion },
      { nombre: 'Ocupación', pct: pctOcupacion, valor: totales.gasto_volumen },
      { nombre: 'Crédito', pct: pctCredito, valor: totales.gasto_credito },
      { nombre: 'Movimiento', pct: pctMovimiento, valor: totales.gasto_movimiento },
    ].sort((a, b) => b.pct - a.pct)[0];

    acciones.push({
      tipo: 'ANALISIS_VIABILIDAD',
      prioridad: 'baja',
      descripcion: `Déficit mensual de $${(deficitMensual / 1000).toFixed(0)}K`,
      impacto_estimado: deficitMensual,
      productos_afectados: totales.productos_perdida,
      detalle: `Para equilibrar el subrubro, el gasto principal a optimizar es "${gastoMayor.nombre}" (${gastoMayor.pct.toFixed(0)}% del total = $${(gastoMayor.valor / 1000).toFixed(0)}K). ` +
               `Si el margen bruto actual (${((totales.importe_ventas - totales.importe_costo) / totales.importe_ventas * 100).toFixed(0)}%) no cubre los gastos, ` +
               `se necesita aumentar precios o reducir la estructura de costos.`,
    });
  }

  // Ordenar por prioridad e impacto
  const prioridadOrden = { alta: 0, media: 1, baja: 2 };
  return acciones.sort((a, b) => {
    if (prioridadOrden[a.prioridad] !== prioridadOrden[b.prioridad]) {
      return prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad];
    }
    return b.impacto_estimado - a.impacto_estimado;
  });
}

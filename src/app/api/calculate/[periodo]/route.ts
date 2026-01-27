import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ periodo: string }> }
) {
  try {
    const { periodo } = await params;

    if (!periodo) {
      return NextResponse.json({ error: 'Período no proporcionado' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Obtener gastos del período
    const { data: gastos, error: errorGastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .single();

    if (errorGastos || !gastos) {
      return NextResponse.json(
        { error: 'No se encontraron gastos para el período. Cargue primero los gastos.' },
        { status: 400 }
      );
    }

    // 2. Obtener totales del período
    const { data: totalesData, error: errorTotales } = await supabase
      .from('metricas_producto')
      .select('importe_ventas, stock_volumen, stock_costo, margen_bruto, veces_pedido')
      .eq('periodo', periodo);

    if (errorTotales || !totalesData || totalesData.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron ventas para el período. Cargue primero las ventas.' },
        { status: 400 }
      );
    }

    const totales = {
      total_facturacion: totalesData.reduce((sum, m) => sum + (m.importe_ventas || 0), 0),
      total_volumen_m3: totalesData.reduce((sum, m) => sum + (m.stock_volumen || 0), 0),
      total_stock_valorizado: totalesData.reduce((sum, m) => sum + (m.stock_costo || 0), 0),
      total_margen_bruto: totalesData.reduce((sum, m) => sum + (m.margen_bruto || 0), 0),
      total_veces_pedido: totalesData.reduce((sum, m) => sum + (m.veces_pedido || 0), 0),
      gastos_facturacion: gastos.cat1_facturacion_final,
      gastos_volumen: gastos.cat2_volumen_final,
      gastos_credito: gastos.cat3_credito_final,
      gastos_rentabilidad: gastos.cat4_rentabilidad_final,
      gastos_movimiento: gastos.cat5_movimiento_final,
    };

    // 3. Obtener todas las métricas del período
    const { data: metricas, error: errorMetricas } = await supabase
      .from('metricas_producto')
      .select('*')
      .eq('periodo', periodo);

    if (errorMetricas || !metricas) {
      return NextResponse.json({ error: 'Error obteniendo métricas' }, { status: 500 });
    }

    // 4. Eliminar análisis existentes del período
    await supabase.from('analisis_producto').delete().eq('periodo', periodo);

    // 5. Calcular análisis para cada producto
    const analisisData = metricas.map((m) => {
      const importe_ventas = m.importe_ventas || 0;
      const importe_costo = m.importe_costo || 0;
      const margen_bruto = m.margen_bruto || 0;
      const markup_pct = m.markup_pct || 0;
      const stock_costo = m.stock_costo || 0;
      const stock_volumen = m.stock_volumen || 0;
      const veces_pedido = m.veces_pedido || 0;

      // Calcular porcentajes de asignación
      const porcentaje_facturacion =
        totales.total_facturacion > 0 ? importe_ventas / totales.total_facturacion : 0;

      const porcentaje_volumen =
        totales.total_volumen_m3 > 0 ? stock_volumen / totales.total_volumen_m3 : 0;

      const porcentaje_credito =
        totales.total_stock_valorizado > 0 ? stock_costo / totales.total_stock_valorizado : 0;

      const porcentaje_markup =
        totales.total_margen_bruto > 0 ? margen_bruto / totales.total_margen_bruto : 0;

      const porcentaje_movimiento =
        totales.total_veces_pedido > 0 ? veces_pedido / totales.total_veces_pedido : 0;

      // Asignar gastos
      const gasto_facturacion = porcentaje_facturacion * totales.gastos_facturacion;
      const gasto_volumen = porcentaje_volumen * totales.gastos_volumen;
      const gasto_credito = porcentaje_credito * totales.gastos_credito;
      const gasto_markup = porcentaje_markup * totales.gastos_rentabilidad;
      const gasto_movimiento = porcentaje_movimiento * totales.gastos_movimiento;
      const gasto_total = gasto_facturacion + gasto_volumen + gasto_credito + gasto_markup + gasto_movimiento;

      // Resultado
      const resultado = margen_bruto - gasto_total;
      const en_perdida = resultado < 0;

      // Markup mínimo
      const markup_minimo_pct = importe_costo > 0 ? (gasto_total / importe_costo) * 100 : 0;
      const cumple_objetivo = markup_pct >= markup_minimo_pct;

      return {
        producto_id: m.producto_id,
        periodo,
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
        cumple_objetivo,
      };
    });

    // 6. Insertar análisis en lotes
    const batchSize = 1000;
    let insertados = 0;
    let productosEnPerdida = 0;
    let perdidaTotal = 0;
    let beneficioTotal = 0;

    for (let i = 0; i < analisisData.length; i += batchSize) {
      const batch = analisisData.slice(i, i + batchSize);
      const { error } = await supabase.from('analisis_producto').insert(batch);

      if (!error) {
        insertados += batch.length;
        batch.forEach((a) => {
          if (a.en_perdida) {
            productosEnPerdida++;
            perdidaTotal += a.resultado;
          } else {
            beneficioTotal += a.resultado;
          }
        });
      }
    }

    // 7. Refrescar vistas materializadas
    try {
      await supabase.rpc('refresh_materialized_views');
    } catch {
      console.log('No se pudieron refrescar las vistas materializadas');
    }

    return NextResponse.json({
      success: true,
      periodo,
      productos_analizados: insertados,
      productos_perdida: productosEnPerdida,
      productos_beneficio: insertados - productosEnPerdida,
      perdida_total: perdidaTotal,
      beneficio_total: beneficioTotal,
      resultado_total: beneficioTotal + perdidaTotal,
      pct_en_perdida: ((productosEnPerdida / insertados) * 100).toFixed(2) + '%',
      totales: {
        total_facturacion: totales.total_facturacion,
        total_volumen_m3: totales.total_volumen_m3,
        total_stock_valorizado: totales.total_stock_valorizado,
        total_margen_bruto: totales.total_margen_bruto,
      },
    });
  } catch (error) {
    console.error('Error en cálculo:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

// GET para obtener el estado del cálculo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodo: string }> }
) {
  try {
    const { periodo } = await params;
    const supabase = createAdminClient();

    // Verificar si existe análisis para el período
    const { count: countAnalisis } = await supabase
      .from('analisis_producto')
      .select('*', { count: 'exact', head: true })
      .eq('periodo', periodo);

    const { count: countMetricas } = await supabase
      .from('metricas_producto')
      .select('*', { count: 'exact', head: true })
      .eq('periodo', periodo);

    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .single();

    return NextResponse.json({
      periodo,
      tiene_ventas: (countMetricas || 0) > 0,
      tiene_gastos: !!gastos,
      tiene_analisis: (countAnalisis || 0) > 0,
      productos_cargados: countMetricas || 0,
      productos_analizados: countAnalisis || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error verificando estado', details: String(error) },
      { status: 500 }
    );
  }
}

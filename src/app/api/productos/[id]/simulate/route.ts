import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { periodo, delta_markup_pct, reduccion_stock_pct } = body;

    const supabase = createAdminClient();

    // Obtener métricas actuales
    const { data: metricas, error: errorMetricas } = await supabase
      .from('metricas_producto')
      .select('*')
      .eq('producto_id', id)
      .eq('periodo', periodo)
      .single();

    if (errorMetricas || !metricas) {
      return NextResponse.json({ error: 'No hay métricas para el período' }, { status: 404 });
    }

    // Obtener análisis actual
    const { data: analisis, error: errorAnalisis } = await supabase
      .from('analisis_producto')
      .select('*')
      .eq('producto_id', id)
      .eq('periodo', periodo)
      .single();

    if (errorAnalisis || !analisis) {
      return NextResponse.json({ error: 'No hay análisis para el período' }, { status: 404 });
    }

    // Obtener totales del período
    const { data: totalesData } = await supabase
      .from('metricas_producto')
      .select('importe_ventas, stock_volumen, stock_costo, margen_bruto')
      .eq('periodo', periodo);

    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .single();

    if (!gastos) {
      return NextResponse.json({ error: 'No hay gastos para el período' }, { status: 404 });
    }

    const totales = {
      total_facturacion: (totalesData || []).reduce((sum, m) => sum + (m.importe_ventas || 0), 0),
      total_volumen_m3: (totalesData || []).reduce((sum, m) => sum + (m.stock_volumen || 0), 0),
      total_stock_valorizado: (totalesData || []).reduce((sum, m) => sum + (m.stock_costo || 0), 0),
      total_margen_bruto: (totalesData || []).reduce((sum, m) => sum + (m.margen_bruto || 0), 0),
      gastos_facturacion: gastos.cat1_facturacion_final,
      gastos_volumen: gastos.cat2_volumen_final,
      gastos_credito: gastos.cat3_credito_final,
      gastos_rentabilidad: gastos.cat4_rentabilidad_final,
    };

    // Simular cambios
    const nuevo_markup_pct = metricas.markup_pct + (delta_markup_pct || 0);

    // Nuevas ventas basadas en nuevo markup
    const nuevas_ventas = metricas.importe_costo * (1 + nuevo_markup_pct / 100);
    const nuevo_margen = nuevas_ventas - metricas.importe_costo;

    // Nuevo stock
    const reduccion_pct = reduccion_stock_pct || 0;
    const nuevo_stock_unidades = metricas.stock_unidades * (1 - reduccion_pct / 100);
    const nuevo_stock_costo = metricas.stock_costo * (1 - reduccion_pct / 100);
    const nuevo_stock_volumen = metricas.stock_volumen * (1 - reduccion_pct / 100);

    // Recalcular porcentajes
    const nueva_pct_facturacion =
      totales.total_facturacion > 0 ? nuevas_ventas / totales.total_facturacion : 0;
    const nueva_pct_volumen =
      totales.total_volumen_m3 > 0 ? nuevo_stock_volumen / totales.total_volumen_m3 : 0;
    const nueva_pct_credito =
      totales.total_stock_valorizado > 0 ? nuevo_stock_costo / totales.total_stock_valorizado : 0;
    const nueva_pct_markup =
      totales.total_margen_bruto > 0 ? nuevo_margen / totales.total_margen_bruto : 0;

    // Recalcular gastos
    const nuevo_gasto_facturacion = nueva_pct_facturacion * totales.gastos_facturacion;
    const nuevo_gasto_volumen = nueva_pct_volumen * totales.gastos_volumen;
    const nuevo_gasto_credito = nueva_pct_credito * totales.gastos_credito;
    const nuevo_gasto_markup = nueva_pct_markup * totales.gastos_rentabilidad;
    const nuevo_gasto_total =
      nuevo_gasto_facturacion + nuevo_gasto_volumen + nuevo_gasto_credito + nuevo_gasto_markup;

    // Nuevo resultado
    const nuevo_resultado = nuevo_margen - nuevo_gasto_total;

    // Nuevo markup mínimo
    const nuevo_markup_minimo =
      metricas.importe_costo > 0 ? (nuevo_gasto_total / metricas.importe_costo) * 100 : 0;

    // Calcular ahorros/mejoras
    const ahorro_credito = analisis.gasto_credito - nuevo_gasto_credito;
    const ahorro_volumen = analisis.gasto_volumen - nuevo_gasto_volumen;
    const mejora_resultado = nuevo_resultado - analisis.resultado;

    // Calcular precio nuevo (estimado)
    const precio_actual =
      metricas.stock_unidades > 0 ? metricas.importe_ventas / metricas.stock_unidades : 0;
    const nuevo_precio = precio_actual * (1 + (delta_markup_pct || 0) / 100);

    return NextResponse.json({
      simulacion: {
        // Cambios aplicados
        delta_markup_pct: delta_markup_pct || 0,
        reduccion_stock_pct: reduccion_stock_pct || 0,

        // Valores actuales
        actual: {
          markup_pct: metricas.markup_pct,
          importe_ventas: metricas.importe_ventas,
          margen_bruto: metricas.margen_bruto,
          stock_unidades: metricas.stock_unidades,
          stock_costo: metricas.stock_costo,
          gasto_total: analisis.gasto_total,
          gasto_facturacion: analisis.gasto_facturacion,
          gasto_volumen: analisis.gasto_volumen,
          gasto_credito: analisis.gasto_credito,
          gasto_markup: analisis.gasto_markup,
          resultado: analisis.resultado,
          en_perdida: analisis.en_perdida,
          markup_minimo_pct: analisis.markup_minimo_pct,
        },

        // Valores proyectados
        proyectado: {
          nuevo_markup_pct,
          nuevas_ventas,
          nuevo_margen,
          nuevo_stock_unidades,
          nuevo_stock_costo,
          nuevo_gasto_total,
          nuevo_gasto_facturacion,
          nuevo_gasto_volumen,
          nuevo_gasto_credito,
          nuevo_gasto_markup,
          nuevo_resultado,
          en_perdida: nuevo_resultado < 0,
          nuevo_markup_minimo,
          nuevo_precio,
        },

        // Diferencias
        diferencias: {
          ahorro_credito,
          ahorro_volumen,
          mejora_resultado,
          delta_ventas: nuevas_ventas - metricas.importe_ventas,
          delta_margen: nuevo_margen - metricas.margen_bruto,
          delta_gasto: nuevo_gasto_total - analisis.gasto_total,
        },

        // Resumen
        resumen: {
          mejora_total: mejora_resultado,
          ahorro_total: ahorro_credito + ahorro_volumen,
          sale_de_perdida: analisis.en_perdida && nuevo_resultado >= 0,
          cumple_objetivo: nuevo_markup_pct >= nuevo_markup_minimo,
        },
      },
    });
  } catch (error) {
    console.error('Error en simulación:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

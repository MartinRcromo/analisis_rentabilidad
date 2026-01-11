import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generarRecomendaciones, generarResumenSituacion } from '@/lib/calculators/recomendaciones';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');

    const supabase = createAdminClient();

    // Obtener producto con relaciones
    const { data: producto, error: errorProducto } = await supabase
      .from('productos')
      .select(`
        *,
        subrubro:subrubros(id, nombre),
        proveedor:proveedores(id, codigo, nombre),
        comprador:compradores(id, codigo, nombre),
        categoria:categorias(id, codigo, nombre)
      `)
      .eq('id', id)
      .single();

    if (errorProducto || !producto) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // Determinar período
    let periodoActual = periodo;
    if (!periodoActual) {
      const { data: ultimoPeriodo } = await supabase
        .from('analisis_producto')
        .select('periodo')
        .eq('producto_id', id)
        .order('periodo', { ascending: false })
        .limit(1)
        .single();

      if (ultimoPeriodo) {
        periodoActual = ultimoPeriodo.periodo;
      }
    }

    if (!periodoActual) {
      return NextResponse.json({ error: 'No hay datos de análisis para este producto' }, { status: 404 });
    }

    // Obtener métricas del período
    const { data: metricas, error: errorMetricas } = await supabase
      .from('metricas_producto')
      .select('*')
      .eq('producto_id', id)
      .eq('periodo', periodoActual)
      .single();

    if (errorMetricas || !metricas) {
      return NextResponse.json({ error: 'No hay métricas para el período seleccionado' }, { status: 404 });
    }

    // Obtener análisis del período
    const { data: analisis, error: errorAnalisis } = await supabase
      .from('analisis_producto')
      .select('*')
      .eq('producto_id', id)
      .eq('periodo', periodoActual)
      .single();

    if (errorAnalisis || !analisis) {
      return NextResponse.json({ error: 'No hay análisis para el período seleccionado' }, { status: 404 });
    }

    // Obtener evolución últimos 6 períodos
    const { data: evolucion } = await supabase
      .from('metricas_producto')
      .select(`
        periodo,
        importe_ventas,
        importe_costo,
        margen_bruto,
        markup_pct,
        stock_unidades
      `)
      .eq('producto_id', id)
      .order('periodo', { ascending: false })
      .limit(6);

    // Obtener análisis histórico
    const periodosEvolucion = (evolucion || []).map((e) => e.periodo);
    const { data: analisisHistorico } = await supabase
      .from('analisis_producto')
      .select('periodo, resultado, en_perdida')
      .eq('producto_id', id)
      .in('periodo', periodosEvolucion);

    // Combinar evolución con análisis
    const evolucionCompleta = (evolucion || []).map((e) => {
      const analisisPeriodo = (analisisHistorico || []).find((a) => a.periodo === e.periodo);
      return {
        ...e,
        resultado: analisisPeriodo?.resultado || 0,
        en_perdida: analisisPeriodo?.en_perdida || false,
      };
    }).reverse();

    // Obtener acciones registradas
    const { data: acciones } = await supabase
      .from('acciones_subrubro')
      .select('*')
      .eq('producto_id', id)
      .order('fecha_creacion', { ascending: false })
      .limit(10);

    // Generar recomendaciones
    const recomendaciones = generarRecomendaciones({
      producto,
      metricas,
      analisis,
    });

    // Generar resumen de situación
    const situacion = generarResumenSituacion({
      producto,
      metricas,
      analisis,
    });

    // Obtener totales del período para simulador
    const { data: totalesData } = await supabase
      .from('metricas_producto')
      .select('importe_ventas, stock_volumen, stock_costo, margen_bruto')
      .eq('periodo', periodoActual);

    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodoActual)
      .single();

    const totales = {
      total_facturacion: (totalesData || []).reduce((sum, m) => sum + (m.importe_ventas || 0), 0),
      total_volumen_m3: (totalesData || []).reduce((sum, m) => sum + (m.stock_volumen || 0), 0),
      total_stock_valorizado: (totalesData || []).reduce((sum, m) => sum + (m.stock_costo || 0), 0),
      total_margen_bruto: (totalesData || []).reduce((sum, m) => sum + (m.margen_bruto || 0), 0),
      gastos_facturacion: gastos?.cat1_facturacion_final || 0,
      gastos_volumen: gastos?.cat2_volumen_final || 0,
      gastos_credito: gastos?.cat3_credito_final || 0,
      gastos_rentabilidad: gastos?.cat4_rentabilidad_final || 0,
    };

    // Calcular meses de stock
    const costoPromedioPorUnidad = metricas.stock_unidades > 0
      ? metricas.stock_costo / metricas.stock_unidades
      : 0;
    const unidadesVendidasEstimadas = costoPromedioPorUnidad > 0
      ? metricas.importe_costo / costoPromedioPorUnidad
      : 0;
    const mesesStock = unidadesVendidasEstimadas > 0
      ? metricas.stock_unidades / unidadesVendidasEstimadas
      : 0;
    const stockIdeal = unidadesVendidasEstimadas * 3;
    const excesoStock = Math.max(0, metricas.stock_unidades - stockIdeal);

    return NextResponse.json({
      producto: {
        id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        empresa: producto.empresa,
        subrubro: producto.subrubro,
        proveedor: producto.proveedor,
        comprador: producto.comprador,
        categoria: producto.categoria,
      },
      periodo: periodoActual,
      metricas: {
        ...metricas,
        meses_stock: mesesStock,
        stock_ideal: stockIdeal,
        exceso_stock: excesoStock,
      },
      analisis: {
        ...analisis,
        brecha_markup: analisis.markup_minimo_pct - metricas.markup_pct,
      },
      situacion,
      recomendaciones,
      evolucion: evolucionCompleta,
      acciones: acciones || [],
      totales,
    });
  } catch (error) {
    console.error('Error obteniendo detalle de producto:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

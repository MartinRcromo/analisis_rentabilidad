import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
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

    // 2. Llamar a la función SQL que calcula todo en el servidor (< 1 segundo)
    const { data: subrubrosData, error: errorRpc } = await supabase.rpc('calcular_subrubros', {
      p_periodo: periodoActual,
    });

    if (errorRpc) {
      console.error('Error en RPC calcular_subrubros:', errorRpc);
      return NextResponse.json({ error: 'Error calculando subrubros', details: errorRpc.message }, { status: 500 });
    }

    // 3. Filtrar por empresa si se especificó
    let subrubrosFiltrados = subrubrosData || [];
    if (empresa && empresa !== 'todas') {
      subrubrosFiltrados = subrubrosFiltrados.filter((s: { empresa: string }) => s.empresa === empresa);
    }

    // 4. Calcular totales para el response
    const totales = subrubrosFiltrados.reduce(
      (acc: { total_facturacion: number; total_volumen: number; total_stock: number; total_margen: number }, s: { facturacion: number; volumen: number; stock_costo: number; margen_bruto: number }) => {
        acc.total_facturacion += Number(s.facturacion) || 0;
        acc.total_volumen += Number(s.volumen) || 0;
        acc.total_stock += Number(s.stock_costo) || 0;
        acc.total_margen += Number(s.margen_bruto) || 0;
        return acc;
      },
      { total_facturacion: 0, total_volumen: 0, total_stock: 0, total_margen: 0 }
    );

    // 5. Obtener gastos del período para el response
    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('cat1_facturacion_final, cat2_volumen_final, cat3_credito_final, cat4_rentabilidad_final')
      .eq('periodo', periodoActual)
      .single();

    const GASTOS_FACTURACION = gastos?.cat1_facturacion_final || 0;
    const GASTOS_VOLUMEN = gastos?.cat2_volumen_final || 0;
    const GASTOS_CREDITO = gastos?.cat3_credito_final || 0;
    const GASTOS_RENTABILIDAD = gastos?.cat4_rentabilidad_final || 0;

    return NextResponse.json({
      periodo: periodoActual,
      empresa,
      subrubros: subrubrosFiltrados,
      totales: {
        ...totales,
        total_subrubros: subrubrosFiltrados.length,
        subrubros_perdida: subrubrosFiltrados.filter((s: { en_perdida: boolean }) => s.en_perdida).length,
      },
      gastos: {
        facturacion: GASTOS_FACTURACION,
        volumen: GASTOS_VOLUMEN,
        credito: GASTOS_CREDITO,
        rentabilidad: GASTOS_RENTABILIDAD,
        total: GASTOS_FACTURACION + GASTOS_VOLUMEN + GASTOS_CREDITO + GASTOS_RENTABILIDAD,
      },
    });
  } catch (error) {
    console.error('Error en API subrubros:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

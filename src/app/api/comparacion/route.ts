import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');

    const supabase = createAdminClient();

    // Determinar período
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

    // Llamar a la función SQL que calcula todo sin límite de 1000
    const { data: empresasData, error: errorRpc } = await supabase.rpc('calcular_resumen_empresa', {
      p_periodo: periodoActual,
    });

    if (errorRpc) {
      console.error('Error en RPC calcular_resumen_empresa:', errorRpc);
      return NextResponse.json({ error: 'Error calculando resumen', details: errorRpc.message }, { status: 500 });
    }

    // Obtener gastos totales del período
    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('cat1_facturacion_final, cat2_volumen_final, cat3_credito_final, cat4_rentabilidad_final')
      .eq('periodo', periodoActual)
      .single();

    const gastoTotal = gastos
      ? (gastos.cat1_facturacion_final || 0) +
        (gastos.cat2_volumen_final || 0) +
        (gastos.cat3_credito_final || 0) +
        (gastos.cat4_rentabilidad_final || 0)
      : 0;

    // Transformar datos por empresa
    const cromo = empresasData?.find((e: { empresa: string }) => e.empresa === 'Cromo');
    const bba = empresasData?.find((e: { empresa: string }) => e.empresa === 'BBA');

    const formatEmpresa = (data: {
      empresa: string;
      total_productos: number;
      productos_perdida: number;
      pct_perdida: number;
      perdida_total: number;
      beneficio_total: number;
      resultado_neto: number;
      facturacion_total: number;
      costo_total: number;
      gasto_total: number;
      gasto_pct: number;
      markup_actual: number;
      markup_min: number;
    } | undefined) => {
      if (!data) return null;
      return {
        total_productos: Number(data.total_productos),
        productos_perdida: Number(data.productos_perdida),
        pct_perdida: Number(data.pct_perdida),
        perdida_total: Number(data.perdida_total),
        beneficio_total: Number(data.beneficio_total),
        resultado_neto: Number(data.resultado_neto),
        facturacion_total: Number(data.facturacion_total),
        costo_total: Number(data.costo_total),
        gasto_total: Number(data.gasto_total),
        gasto_pct: Number(data.gasto_pct),
        markup_actual: Number(data.markup_actual),
        markup_min: Number(data.markup_min),
      };
    };

    return NextResponse.json({
      periodo: periodoActual,
      cromo: formatEmpresa(cromo),
      bba: formatEmpresa(bba),
      gastos: {
        total: gastoTotal,
        facturacion: gastos?.cat1_facturacion_final || 0,
        volumen: gastos?.cat2_volumen_final || 0,
        credito: gastos?.cat3_credito_final || 0,
        rentabilidad: gastos?.cat4_rentabilidad_final || 0,
      },
    });
  } catch (error) {
    console.error('Error en API comparacion:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');
    const empresa = searchParams.get('empresa') || 'todas';

    const supabase = createAdminClient();

    // Determinar período a usar (el más reciente si no se especifica)
    let periodoActual = periodo;
    if (!periodoActual) {
      const { data: ultimoPeriodo } = await supabase
        .from('analisis_producto')
        .select('periodo')
        .order('periodo', { ascending: false })
        .limit(1)
        .single();

      if (ultimoPeriodo) {
        periodoActual = ultimoPeriodo.periodo;
      } else {
        return NextResponse.json({ error: 'No hay datos de análisis disponibles' }, { status: 404 });
      }
    }

    // 1. Obtener resumen del período usando función SQL optimizada
    // Esto evita el límite implícito de 1000 registros de Supabase
    const { data: resumenData, error: errorResumen } = await supabase.rpc('calcular_resumen_dashboard', {
      p_periodo: periodoActual,
      p_empresa: empresa,
    });

    if (errorResumen) {
      console.error('Error obteniendo resumen:', errorResumen);
      return NextResponse.json({ error: 'Error obteniendo datos de análisis' }, { status: 500 });
    }

    const resumenRow = resumenData?.[0] || {
      total_productos: 0,
      productos_perdida: 0,
      perdida_total: 0,
      beneficio_total: 0,
      resultado_neto: 0,
      pct_perdida: 0,
    };

    const resumen = {
      total_productos: Number(resumenRow.total_productos),
      productos_perdida: Number(resumenRow.productos_perdida),
      perdida_total: Number(resumenRow.perdida_total),
      beneficio_total: Number(resumenRow.beneficio_total),
      resultado_neto: Number(resumenRow.resultado_neto),
      pct_perdida: Number(resumenRow.pct_perdida),
    };

    // 2. Obtener distribución de gastos
    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodoActual)
      .single();

    const distribucion_gastos = gastos
      ? {
          facturacion: gastos.cat1_facturacion_final,
          volumen: gastos.cat2_volumen_final,
          credito: gastos.cat3_credito_final,
          rentabilidad: gastos.cat4_rentabilidad_final,
          movimiento: gastos.cat5_movimiento_final,
        }
      : {
          facturacion: 0,
          volumen: 0,
          credito: 0,
          rentabilidad: 0,
          movimiento: 0,
        };

    // 3. Obtener evolución últimos 6 meses usando función SQL optimizada
    const { data: evolucionData } = await supabase.rpc('calcular_evolucion_dashboard', {
      p_empresa: empresa,
    });

    const evolucion_6_meses = (evolucionData || []).map((e: { periodo: string; beneficio: number; perdida: number; resultado: number }) => ({
      periodo: e.periodo,
      beneficio: Number(e.beneficio),
      perdida: Number(e.perdida),
      resultado: Number(e.resultado),
    }));

    // 4. Obtener top subrubros usando función SQL optimizada (< 1 segundo)
    const { data: subrubrosData } = await supabase.rpc('calcular_subrubros', {
      p_periodo: periodoActual,
    });

    // Filtrar por empresa si se especificó
    let subrubrosFiltrados = subrubrosData || [];
    if (empresa && empresa !== 'todas') {
      subrubrosFiltrados = subrubrosFiltrados.filter((s: { empresa: string }) => s.empresa === empresa);
    }

    // Tipo para subrubros con markup
    type SubrubroConMarkup = {
      subrubro: string;
      empresa: string;
      total_productos: number;
      resultado: number;
      markup_actual: number;
      markup_min: number;
    };

    // Top 10 peores (ya viene ordenado por resultado ASC)
    const topPeoresData = subrubrosFiltrados.slice(0, 10).map((s: SubrubroConMarkup) => ({
      subrubro: s.subrubro,
      empresa: s.empresa,
      total_productos: Number(s.total_productos),
      resultado: Number(s.resultado),
      markup_actual: Number(s.markup_actual) || 0,
      markup_min: Number(s.markup_min) || 0,
    }));

    // Top 10 mejores (mayor resultado - invertir el orden)
    const topMejoresData = [...subrubrosFiltrados]
      .sort((a: { resultado: number }, b: { resultado: number }) => Number(b.resultado) - Number(a.resultado))
      .slice(0, 10)
      .map((s: SubrubroConMarkup) => ({
        subrubro: s.subrubro,
        empresa: s.empresa,
        total_productos: Number(s.total_productos),
        resultado: Number(s.resultado),
        markup_actual: Number(s.markup_actual) || 0,
        markup_min: Number(s.markup_min) || 0,
      }));

    return NextResponse.json({
      periodo: periodoActual,
      empresa,
      resumen,
      evolucion_6_meses,
      distribucion_gastos,
      top_peores: topPeoresData || [],
      top_mejores: topMejoresData || [],
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

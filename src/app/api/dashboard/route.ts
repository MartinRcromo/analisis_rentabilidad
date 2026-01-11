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

    // 1. Obtener resumen del período
    let resumenQuery = supabase
      .from('analisis_producto')
      .select(`
        resultado,
        en_perdida,
        producto:productos!inner(empresa)
      `)
      .eq('periodo', periodoActual);

    if (empresa !== 'todas') {
      resumenQuery = resumenQuery.eq('producto.empresa', empresa);
    }

    const { data: analisisData, error: errorAnalisis } = await resumenQuery;

    if (errorAnalisis) {
      console.error('Error obteniendo análisis:', errorAnalisis);
      return NextResponse.json({ error: 'Error obteniendo datos de análisis' }, { status: 500 });
    }

    const total_productos = analisisData?.length || 0;
    let productos_perdida = 0;
    let perdida_total = 0;
    let beneficio_total = 0;

    (analisisData || []).forEach((a) => {
      if (a.en_perdida) {
        productos_perdida++;
        perdida_total += a.resultado;
      } else {
        beneficio_total += a.resultado;
      }
    });

    const resumen = {
      total_productos,
      productos_perdida,
      perdida_total,
      beneficio_total,
      resultado_neto: beneficio_total + perdida_total,
      pct_perdida: total_productos > 0 ? (productos_perdida / total_productos) * 100 : 0,
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
        }
      : {
          facturacion: 0,
          volumen: 0,
          credito: 0,
          rentabilidad: 0,
        };

    // 3. Obtener evolución últimos 6 meses
    const { data: periodos } = await supabase
      .from('analisis_producto')
      .select('periodo')
      .order('periodo', { ascending: false });

    const periodosUnicos = [...new Set((periodos || []).map((p) => p.periodo))].slice(0, 6);

    const evolucion_6_meses = [];

    for (const p of periodosUnicos) {
      let evoQuery = supabase
        .from('analisis_producto')
        .select(`
          resultado,
          en_perdida,
          producto:productos!inner(empresa)
        `)
        .eq('periodo', p);

      if (empresa !== 'todas') {
        evoQuery = evoQuery.eq('producto.empresa', empresa);
      }

      const { data: evoData } = await evoQuery;

      let beneficio = 0;
      let perdida = 0;

      (evoData || []).forEach((a) => {
        if (a.en_perdida) {
          perdida += a.resultado;
        } else {
          beneficio += a.resultado;
        }
      });

      evolucion_6_meses.push({
        periodo: p,
        beneficio,
        perdida,
        resultado: beneficio + perdida,
      });
    }

    // Ordenar cronológicamente
    evolucion_6_meses.sort((a, b) => a.periodo.localeCompare(b.periodo));

    // 4. Top 10 peores subrubros
    const { data: topPeores } = await supabase.rpc('get_top_subrubros', {
      p_periodo: periodoActual,
      p_empresa: empresa === 'todas' ? null : empresa,
      p_limit: 10,
      p_order: 'asc',
    });

    // 5. Top 10 mejores subrubros
    const { data: topMejores } = await supabase.rpc('get_top_subrubros', {
      p_periodo: periodoActual,
      p_empresa: empresa === 'todas' ? null : empresa,
      p_limit: 10,
      p_order: 'desc',
    });

    // Si la función RPC no existe, usar query alternativa
    let topPeoresData = topPeores;
    let topMejoresData = topMejores;

    if (!topPeores) {
      // Query alternativa para top subrubros
      const { data: subrubrosData } = await supabase
        .from('analisis_producto')
        .select(`
          resultado,
          producto:productos!inner(
            empresa,
            subrubro:subrubros(id, nombre)
          )
        `)
        .eq('periodo', periodoActual);

      // Agregar por subrubro
      const subrubrosTotales: Record<
        string,
        { nombre: string; empresa: string; resultado: number; productos: number }
      > = {};

      (subrubrosData || []).forEach((a) => {
        const prod = a.producto as unknown as { empresa: string; subrubro: { id: number; nombre: string } | null };
        if (!prod?.subrubro) return;
        if (empresa !== 'todas' && prod.empresa !== empresa) return;

        const key = `${prod.subrubro.id}-${prod.empresa}`;
        if (!subrubrosTotales[key]) {
          subrubrosTotales[key] = {
            nombre: prod.subrubro.nombre,
            empresa: prod.empresa,
            resultado: 0,
            productos: 0,
          };
        }
        subrubrosTotales[key].resultado += a.resultado;
        subrubrosTotales[key].productos++;
      });

      const subrubrosArray = Object.values(subrubrosTotales);

      topPeoresData = subrubrosArray
        .sort((a, b) => a.resultado - b.resultado)
        .slice(0, 10)
        .map((s) => ({
          subrubro: s.nombre,
          empresa: s.empresa,
          total_productos: s.productos,
          resultado: s.resultado,
        }));

      topMejoresData = subrubrosArray
        .sort((a, b) => b.resultado - a.resultado)
        .slice(0, 10)
        .map((s) => ({
          subrubro: s.nombre,
          empresa: s.empresa,
          total_productos: s.productos,
          resultado: s.resultado,
        }));
    }

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

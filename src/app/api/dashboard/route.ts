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

    // 4. Calcular top subrubros con metodología correcta (agregar primero, luego calcular gastos)
    // Obtener TODOS los productos con paginación (Supabase limita a 1000 por defecto)
    type ProductoData = {
      id: number;
      empresa: string;
      subrubro_id: number | null;
      subrubros: { id: number; nombre: string } | { id: number; nombre: string }[] | null;
      metricas_producto: {
        importe_ventas: number;
        importe_costo: number;
        stock_volumen: number;
        stock_costo: number;
        margen_bruto: number;
      }[];
    };

    let allProductosData: ProductoData[] = [];
    let dashPage = 0;
    const dashPageSize = 1000;
    let dashHasMore = true;

    while (dashHasMore) {
      const { data: pageData } = await supabase
        .from('productos')
        .select(`
          id,
          empresa,
          subrubro_id,
          subrubros(id, nombre),
          metricas_producto!inner(
            importe_ventas,
            importe_costo,
            stock_volumen,
            stock_costo,
            margen_bruto
          )
        `)
        .eq('metricas_producto.periodo', periodoActual)
        .range(dashPage * dashPageSize, (dashPage + 1) * dashPageSize - 1);

      if (pageData && pageData.length > 0) {
        allProductosData = [...allProductosData, ...(pageData as ProductoData[])];
        dashHasMore = pageData.length === dashPageSize;
        dashPage++;
      } else {
        dashHasMore = false;
      }
    }

    const productosData = allProductosData;

    // Calcular totales del período
    // IMPORTANTE: TOTAL_MARGEN solo suma valores POSITIVOS
    let TOTAL_FACTURACION = 0;
    let TOTAL_VOLUMEN = 0;
    let TOTAL_STOCK = 0;
    let TOTAL_MARGEN = 0;  // Solo valores positivos

    (productosData || []).forEach((p) => {
      const metricas = p.metricas_producto[0];
      TOTAL_FACTURACION += metricas.importe_ventas || 0;
      TOTAL_VOLUMEN += metricas.stock_volumen || 0;
      TOTAL_STOCK += metricas.stock_costo || 0;
      const margen = metricas.margen_bruto || 0;
      if (margen > 0) {
        TOTAL_MARGEN += margen;
      }
    });

    // Obtener gastos del período
    const GASTOS_FACTURACION = gastos?.cat1_facturacion_final || 0;
    const GASTOS_VOLUMEN = gastos?.cat2_volumen_final || 0;
    const GASTOS_CREDITO = gastos?.cat3_credito_final || 0;
    const GASTOS_RENTABILIDAD = gastos?.cat4_rentabilidad_final || 0;

    // Agregar por subrubro
    const subrubrosMap = new Map<string, {
      empresa: string;
      subrubro_id: number;
      subrubro: string;
      facturacion: number;
      volumen: number;
      stock_costo: number;
      margen_bruto: number;
      productos_count: number;
    }>();

    (productosData || []).forEach((p) => {
      if (!p.subrubros || !p.subrubro_id) return;
      if (empresa !== 'todas' && p.empresa !== empresa) return;

      const subrubroData = p.subrubros as unknown as { id: number; nombre: string } | { id: number; nombre: string }[];
      const subrubroInfo = Array.isArray(subrubroData) ? subrubroData[0] : subrubroData;
      if (!subrubroInfo) return;
      const key = `${p.empresa}_${p.subrubro_id}`;
      const metricas = p.metricas_producto[0];

      if (!subrubrosMap.has(key)) {
        subrubrosMap.set(key, {
          empresa: p.empresa,
          subrubro_id: p.subrubro_id,
          subrubro: subrubroInfo.nombre,
          facturacion: 0,
          volumen: 0,
          stock_costo: 0,
          margen_bruto: 0,
          productos_count: 0,
        });
      }

      const sub = subrubrosMap.get(key)!;
      sub.facturacion += metricas.importe_ventas || 0;
      sub.volumen += metricas.stock_volumen || 0;
      sub.stock_costo += metricas.stock_costo || 0;
      sub.margen_bruto += metricas.margen_bruto || 0;
      sub.productos_count++;
    });

    // Calcular resultado para cada subrubro
    const subrubrosConResultado = Array.from(subrubrosMap.values()).map((sub) => {
      const pct_facturacion = TOTAL_FACTURACION > 0 ? sub.facturacion / TOTAL_FACTURACION : 0;
      const pct_volumen = TOTAL_VOLUMEN > 0 ? sub.volumen / TOTAL_VOLUMEN : 0;
      const pct_credito = TOTAL_STOCK > 0 ? sub.stock_costo / TOTAL_STOCK : 0;
      const margen_positivo = Math.max(sub.margen_bruto, 0);
      const pct_margen = TOTAL_MARGEN > 0 ? margen_positivo / TOTAL_MARGEN : 0;

      const gasto_total =
        pct_facturacion * GASTOS_FACTURACION +
        pct_volumen * GASTOS_VOLUMEN +
        pct_credito * GASTOS_CREDITO +
        pct_margen * GASTOS_RENTABILIDAD;

      const resultado = sub.margen_bruto - gasto_total;

      return {
        subrubro: sub.subrubro,
        empresa: sub.empresa,
        total_productos: sub.productos_count,
        resultado,
      };
    });

    // Top 10 peores (menor resultado)
    const topPeoresData = [...subrubrosConResultado]
      .sort((a, b) => a.resultado - b.resultado)
      .slice(0, 10);

    // Top 10 mejores (mayor resultado)
    const topMejoresData = [...subrubrosConResultado]
      .sort((a, b) => b.resultado - a.resultado)
      .slice(0, 10);

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

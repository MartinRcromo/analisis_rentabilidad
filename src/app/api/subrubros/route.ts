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

    // 2. Obtener TODOS los productos con sus métricas y subrubros
    // IMPORTANTE: Supabase limita a 1000 filas por defecto, necesitamos paginar
    type ProductoConMetricas = {
      id: number;
      codigo: string;
      empresa: string;
      subrubro_id: number | null;
      subrubros: { id: number; nombre: string } | { id: number; nombre: string }[] | null;
      metricas_producto: {
        importe_ventas: number;
        importe_costo: number;
        stock_volumen: number;
        stock_costo: number;
        margen_bruto: number;
        markup_pct: number;
      }[];
    };

    let allProductos: ProductoConMetricas[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageData, error: pageError } = await supabase
        .from('productos')
        .select(`
          id,
          codigo,
          empresa,
          subrubro_id,
          subrubros(id, nombre),
          metricas_producto!inner(
            importe_ventas,
            importe_costo,
            stock_volumen,
            stock_costo,
            margen_bruto,
            markup_pct
          )
        `)
        .eq('metricas_producto.periodo', periodoActual)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (pageError) {
        console.error('Error obteniendo productos página', page, pageError);
        return NextResponse.json({ error: 'Error obteniendo datos' }, { status: 500 });
      }

      if (pageData && pageData.length > 0) {
        allProductos = [...allProductos, ...pageData];
        hasMore = pageData.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    const productos = allProductos;

    // 3. Calcular TOTALES del período (para los porcentajes)
    // IMPORTANTE: TOTAL_MARGEN solo suma valores POSITIVOS (para que los % sumen 100%)
    let TOTAL_FACTURACION = 0;
    let TOTAL_VOLUMEN = 0;
    let TOTAL_STOCK = 0;
    let TOTAL_MARGEN = 0;  // Solo valores positivos

    (productos || []).forEach((p) => {
      const metricas = p.metricas_producto[0];
      TOTAL_FACTURACION += metricas.importe_ventas || 0;
      TOTAL_VOLUMEN += metricas.stock_volumen || 0;
      TOTAL_STOCK += metricas.stock_costo || 0;
      // Solo sumar margen positivo para el total (los negativos no aportan al gasto por rentabilidad)
      const margen = metricas.margen_bruto || 0;
      if (margen > 0) {
        TOTAL_MARGEN += margen;
      }
    });

    // 4. Obtener gastos finales del período
    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodoActual)
      .single();

    const GASTOS_FACTURACION = gastos?.cat1_facturacion_final || 0;
    const GASTOS_VOLUMEN = gastos?.cat2_volumen_final || 0;
    const GASTOS_CREDITO = gastos?.cat3_credito_final || 0;
    const GASTOS_RENTABILIDAD = gastos?.cat4_rentabilidad_final || 0;
    const GASTOS_TOTAL = GASTOS_FACTURACION + GASTOS_VOLUMEN + GASTOS_CREDITO + GASTOS_RENTABILIDAD;

    // 5. AGREGAR por subrubro (empresa + subrubro)
    const subrubrosMap = new Map<string, {
      empresa: string;
      subrubro_id: number;
      subrubro: string;
      facturacion: number;
      costo: number;
      volumen: number;
      stock_costo: number;
      margen_bruto: number;
      productos_count: number;
      markup_sum: number;
    }>();

    (productos || []).forEach((p) => {
      if (!p.subrubros || !p.subrubro_id) return;

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
          costo: 0,
          volumen: 0,
          stock_costo: 0,
          margen_bruto: 0,
          productos_count: 0,
          markup_sum: 0,
        });
      }

      const sub = subrubrosMap.get(key)!;
      sub.facturacion += metricas.importe_ventas || 0;
      sub.costo += metricas.importe_costo || 0;
      sub.volumen += metricas.stock_volumen || 0;
      sub.stock_costo += metricas.stock_costo || 0;
      sub.margen_bruto += metricas.margen_bruto || 0;
      sub.productos_count++;
      sub.markup_sum += metricas.markup_pct || 0;
    });

    // 6. Calcular gastos y resultado para cada subrubro
    const subrubros = Array.from(subrubrosMap.values()).map((sub) => {
      // Porcentajes de participación
      const pct_facturacion = TOTAL_FACTURACION > 0 ? sub.facturacion / TOTAL_FACTURACION : 0;
      const pct_volumen = TOTAL_VOLUMEN > 0 ? sub.volumen / TOTAL_VOLUMEN : 0;
      const pct_credito = TOTAL_STOCK > 0 ? sub.stock_costo / TOTAL_STOCK : 0;
      // Para rentabilidad: si margen negativo = 0% de gasto rentabilidad
      const margen_positivo = Math.max(sub.margen_bruto, 0);
      const pct_margen = TOTAL_MARGEN > 0 ? margen_positivo / TOTAL_MARGEN : 0;

      // Gastos asignados al subrubro
      const gasto_facturacion = pct_facturacion * GASTOS_FACTURACION;
      const gasto_volumen = pct_volumen * GASTOS_VOLUMEN;
      const gasto_credito = pct_credito * GASTOS_CREDITO;
      const gasto_rentabilidad = pct_margen * GASTOS_RENTABILIDAD;
      const gasto_total = gasto_facturacion + gasto_volumen + gasto_credito + gasto_rentabilidad;

      // Resultado
      const resultado = sub.margen_bruto - gasto_total;
      const en_perdida = resultado < 0;
      const gasto_sobre_venta_pct = sub.facturacion > 0 ? (gasto_total / sub.facturacion) * 100 : 0;
      const markup_promedio = sub.productos_count > 0 ? sub.markup_sum / sub.productos_count : 0;

      return {
        empresa: sub.empresa,
        subrubro_id: sub.subrubro_id,
        subrubro: sub.subrubro,
        total_productos: sub.productos_count,

        // Métricas agregadas
        facturacion: sub.facturacion,
        costo: sub.costo,
        volumen: sub.volumen,
        stock_costo: sub.stock_costo,
        margen_bruto: sub.margen_bruto,
        markup_promedio,

        // Porcentajes de participación
        pct_facturacion: pct_facturacion * 100,
        pct_volumen: pct_volumen * 100,
        pct_credito: pct_credito * 100,
        pct_margen: pct_margen * 100,

        // Gastos asignados
        gasto_facturacion,
        gasto_volumen,
        gasto_credito,
        gasto_rentabilidad,
        gasto_total,
        gasto_sobre_venta_pct,

        // Resultado final
        resultado,
        en_perdida,
      };
    });

    // 7. Filtrar por empresa si se especificó
    let subrubrosFiltrados = subrubros;
    if (empresa && empresa !== 'todas') {
      subrubrosFiltrados = subrubros.filter((s) => s.empresa === empresa);
    }

    // Ordenar por resultado ascendente (peores primero)
    subrubrosFiltrados.sort((a, b) => a.resultado - b.resultado);

    // Debug: buscar Bujía de Encendido para verificar cálculo
    const bujiaDebug = subrubrosFiltrados.find(s => s.subrubro.toLowerCase().includes('bujia'));

    return NextResponse.json({
      periodo: periodoActual,
      empresa,
      subrubros: subrubrosFiltrados,
      totales: {
        total_facturacion: TOTAL_FACTURACION,
        total_volumen: TOTAL_VOLUMEN,
        total_stock: TOTAL_STOCK,
        total_margen: TOTAL_MARGEN,
        total_subrubros: subrubrosFiltrados.length,
        subrubros_perdida: subrubrosFiltrados.filter((s) => s.en_perdida).length,
        total_productos: productos?.length || 0,
      },
      gastos: {
        facturacion: GASTOS_FACTURACION,
        volumen: GASTOS_VOLUMEN,
        credito: GASTOS_CREDITO,
        rentabilidad: GASTOS_RENTABILIDAD,
        total: GASTOS_TOTAL,
      },
      // Debug info para verificar cálculos
      debug: {
        bujia_encendido: bujiaDebug || null,
        gastos_raw: gastos ? {
          cat1_facturacion_final: gastos.cat1_facturacion_final,
          cat2_volumen_final: gastos.cat2_volumen_final,
          cat3_credito_final: gastos.cat3_credito_final,
          cat4_rentabilidad_final: gastos.cat4_rentabilidad_final,
        } : null,
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

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get('empresa') || 'todas';
    const anio = searchParams.get('anio');
    const meses = searchParams.get('meses'); // formato: "1,2,3" o "11,12"

    const supabase = createAdminClient();

    // Obtener períodos disponibles
    const { data: periodosDisponibles } = await supabase.rpc('get_periodos_disponibles');

    // Determinar períodos a usar
    let periodosSeleccionados: string[] = [];

    if (anio && meses) {
      // Usuario seleccionó año y meses específicos
      const mesesArray = meses.split(',').map((m) => parseInt(m.trim()));
      periodosSeleccionados = mesesArray.map((mes) => {
        const mesStr = mes.toString().padStart(2, '0');
        return `${anio}-${mesStr}-01`;
      });
    } else {
      // Usar el período más reciente por defecto
      if (periodosDisponibles && periodosDisponibles.length > 0) {
        periodosSeleccionados = [periodosDisponibles[0].periodo];
      } else {
        return NextResponse.json({ error: 'No hay datos de análisis disponibles' }, { status: 404 });
      }
    }

    // 1. Obtener KPIs principales
    const { data: kpisData, error: errorKpis } = await supabase.rpc('calcular_dashboard_kpis', {
      p_periodos: periodosSeleccionados,
      p_empresa: empresa,
    });

    if (errorKpis) {
      console.error('Error obteniendo KPIs:', errorKpis);
      // Fallback a función anterior si la nueva no existe
      const { data: resumenData } = await supabase.rpc('calcular_resumen_dashboard', {
        p_periodo: periodosSeleccionados[0],
        p_empresa: empresa,
      });

      const resumenRow = resumenData?.[0] || {};
      return NextResponse.json({
        periodo: periodosSeleccionados[0],
        periodos_disponibles: periodosDisponibles || [],
        empresa,
        kpis: {
          facturacion: 0,
          costo_mercaderia: 0,
          unidades_vendidas: 0,
          stock_volumen: 0,
          stock_valorizado: 0,
          cantidad_pedidos: 0,
          total_productos: Number(resumenRow.total_productos) || 0,
          productos_perdida: Number(resumenRow.productos_perdida) || 0,
          productos_beneficio: 0,
          resultado_neto: Number(resumenRow.resultado_neto) || 0,
          subrubros_perdida: 0,
          subrubros_beneficio: 0,
        },
        gastos_por_empresa: [],
        evolucion: [],
      });
    }

    const kpis = kpisData?.[0] || {
      facturacion: 0,
      costo_mercaderia: 0,
      unidades_vendidas: 0,
      stock_volumen: 0,
      stock_valorizado: 0,
      cantidad_pedidos: 0,
      total_productos: 0,
      productos_perdida: 0,
      productos_beneficio: 0,
      resultado_neto: 0,
      subrubros_perdida: 0,
      subrubros_beneficio: 0,
    };

    // 2. Obtener gastos por empresa
    const { data: gastosData } = await supabase.rpc('calcular_gastos_por_empresa', {
      p_periodos: periodosSeleccionados,
    });

    const gastos_por_empresa = (gastosData || []).map((g: {
      empresa: string;
      ventas_total: number;
      gastos_total: number;
      pct_gastos: number;
      margen_bruto_total: number;
      gasto_minimo_pct: number;
    }) => ({
      empresa: g.empresa,
      ventas: Number(g.ventas_total),
      gastos: Number(g.gastos_total),
      pct_gastos: Number(g.pct_gastos),
      margen_bruto: Number(g.margen_bruto_total),
      gasto_minimo_pct: Number(g.gasto_minimo_pct),
    }));

    // 3. Obtener evolución (solo resultado)
    const { data: evolucionData } = await supabase.rpc('calcular_evolucion_resultado', {
      p_empresa: empresa,
      p_limit: 6,
    });

    // Fallback si la función nueva no existe
    let evolucion = (evolucionData || []).map((e: { periodo: string; resultado: number }) => ({
      periodo: e.periodo,
      resultado: Number(e.resultado),
    }));

    // Si no hay datos de la nueva función, usar la anterior
    if (evolucion.length === 0) {
      const { data: evolucionOld } = await supabase.rpc('calcular_evolucion_dashboard', {
        p_empresa: empresa,
      });
      evolucion = (evolucionOld || []).map((e: { periodo: string; resultado: number }) => ({
        periodo: e.periodo,
        resultado: Number(e.resultado),
      }));
    }

    // Formatear períodos para mostrar
    const periodosFormateados = periodosSeleccionados.map((p) => {
      const date = new Date(p);
      return date.toLocaleDateString('es-AR', { year: 'numeric', month: 'short' });
    });

    return NextResponse.json({
      periodo: periodosSeleccionados.length === 1
        ? periodosSeleccionados[0]
        : `${periodosSeleccionados.length} meses`,
      periodos_seleccionados: periodosSeleccionados,
      periodos_disponibles: periodosDisponibles || [],
      periodo_display: periodosFormateados.join(', '),
      empresa,
      kpis: {
        facturacion: Number(kpis.facturacion),
        costo_mercaderia: Number(kpis.costo_mercaderia),
        unidades_vendidas: Number(kpis.unidades_vendidas),
        stock_volumen: Number(kpis.stock_volumen),
        stock_valorizado: Number(kpis.stock_valorizado),
        cantidad_pedidos: Number(kpis.cantidad_pedidos),
        total_productos: Number(kpis.total_productos),
        productos_perdida: Number(kpis.productos_perdida),
        productos_beneficio: Number(kpis.productos_beneficio),
        resultado_neto: Number(kpis.resultado_neto),
        subrubros_perdida: Number(kpis.subrubros_perdida),
        subrubros_beneficio: Number(kpis.subrubros_beneficio),
      },
      gastos_por_empresa,
      evolucion,
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

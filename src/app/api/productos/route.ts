import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo');
    const empresa = searchParams.get('empresa') || 'todas';
    const subrubroIds = searchParams.get('subrubro_ids')?.split(',').filter(Boolean) || [];
    const proveedorIds = searchParams.get('proveedor_ids')?.split(',').filter(Boolean) || [];
    const estado = searchParams.get('estado') || 'todos';
    const busqueda = searchParams.get('busqueda') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const orderBy = searchParams.get('orderBy') || 'resultado';
    const orderDir = searchParams.get('orderDir') || 'asc';

    const supabase = createAdminClient();

    // Determinar período
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
        return NextResponse.json({ data: [], pagination: { total: 0, page: 1, pages: 0, hasMore: false } });
      }
    }

    // Construir query base
    let query = supabase
      .from('analisis_producto')
      .select(
        `
        *,
        producto:productos!inner(
          id,
          codigo,
          nombre,
          empresa,
          subrubro:subrubros(id, nombre),
          proveedor:proveedores(id, codigo, nombre),
          comprador:compradores(id, codigo, nombre),
          categoria:categorias(id, codigo, nombre)
        ),
        metricas:metricas_producto!inner(
          importe_ventas,
          importe_costo,
          margen_bruto,
          markup_pct,
          stock_unidades,
          stock_costo,
          stock_volumen
        )
      `,
        { count: 'exact' }
      )
      .eq('periodo', periodoActual)
      .eq('metricas.periodo', periodoActual);

    // Filtros
    if (empresa !== 'todas') {
      query = query.eq('producto.empresa', empresa);
    }

    if (subrubroIds.length > 0) {
      query = query.in('producto.subrubro_id', subrubroIds.map(Number));
    }

    if (proveedorIds.length > 0) {
      query = query.in('producto.proveedor_id', proveedorIds.map(Number));
    }

    if (estado === 'perdida') {
      query = query.eq('en_perdida', true);
    } else if (estado === 'beneficio') {
      query = query.eq('en_perdida', false);
    }

    if (busqueda) {
      query = query.or(
        `producto.nombre.ilike.%${busqueda}%,producto.codigo.ilike.%${busqueda}%`
      );
    }

    // Ordenamiento
    const ascending = orderDir === 'asc';
    if (orderBy === 'resultado') {
      query = query.order('resultado', { ascending });
    } else if (orderBy === 'ventas') {
      query = query.order('metricas.importe_ventas', { ascending, referencedTable: 'metricas' });
    } else if (orderBy === 'markup') {
      query = query.order('metricas.markup_pct', { ascending, referencedTable: 'metricas' });
    }

    // Paginación
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error obteniendo productos:', error);
      return NextResponse.json({ error: 'Error obteniendo productos', details: error.message }, { status: 500 });
    }

    const total = count || 0;
    const pages = Math.ceil(total / limit);

    // Formatear respuesta
    const formattedData = (data || []).map((item) => {
      // Handle producto - might be object or array
      const prodRaw = item.producto;
      const prod = Array.isArray(prodRaw) ? prodRaw[0] : prodRaw;

      // Handle metricas - might be object or array
      const metricasRaw = item.metricas;
      const metricas = Array.isArray(metricasRaw) ? metricasRaw[0] : metricasRaw;

      // Handle nested relations that might be arrays
      const subrubro = prod?.subrubro;
      const subrubroObj = Array.isArray(subrubro) ? subrubro[0] : subrubro;
      const proveedor = prod?.proveedor;
      const proveedorObj = Array.isArray(proveedor) ? proveedor[0] : proveedor;

      return {
        id: item.id,
        producto_id: item.producto_id,
        periodo: item.periodo,
        codigo: prod?.codigo || '',
        nombre: prod?.nombre || '',
        empresa: prod?.empresa || '',
        subrubro: subrubroObj?.nombre || '',
        subrubro_id: subrubroObj?.id || null,
        proveedor: proveedorObj?.nombre || '',
        proveedor_id: proveedorObj?.id || null,
        importe_ventas: metricas?.importe_ventas || 0,
        importe_costo: metricas?.importe_costo || 0,
        margen_bruto: metricas?.margen_bruto || 0,
        markup_pct: metricas?.markup_pct || 0,
        markup_minimo_pct: item.markup_minimo_pct || 0,
        stock_unidades: metricas?.stock_unidades || 0,
        stock_costo: metricas?.stock_costo || 0,
        gasto_total: item.gasto_total || 0,
        resultado: item.resultado || 0,
        en_perdida: item.en_perdida || false,
        cumple_objetivo: item.cumple_objetivo || false,
      };
    });

    return NextResponse.json({
      data: formattedData,
      pagination: {
        total,
        page,
        pages,
        hasMore: page < pages,
      },
      periodo: periodoActual,
    });
  } catch (error) {
    console.error('Error en productos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

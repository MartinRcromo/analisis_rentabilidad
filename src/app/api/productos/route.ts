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

    // Query simple sin nested joins problemáticos
    let query = supabase
      .from('analisis_producto')
      .select('*', { count: 'exact' })
      .eq('periodo', periodoActual);

    if (estado === 'perdida') {
      query = query.eq('en_perdida', true);
    } else if (estado === 'beneficio') {
      query = query.eq('en_perdida', false);
    }

    // Ordenar por resultado
    const ascending = orderDir === 'asc';
    query = query.order('resultado', { ascending });

    // Paginación
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: analisisData, error: analisisError, count } = await query;

    if (analisisError) {
      console.error('Error obteniendo analisis:', analisisError);
      return NextResponse.json({ error: 'Error obteniendo productos', details: analisisError.message }, { status: 500 });
    }

    if (!analisisData || analisisData.length === 0) {
      return NextResponse.json({
        data: [],
        pagination: { total: 0, page: 1, pages: 0, hasMore: false },
        periodo: periodoActual,
      });
    }

    // Obtener IDs de productos
    const productoIds = analisisData.map(a => a.producto_id);

    // Buscar productos
    const { data: productosData } = await supabase
      .from('productos')
      .select('id, codigo, nombre, empresa, subrubro_id, proveedor_id')
      .in('id', productoIds);

    const productosMap: Record<number, {
      codigo: string;
      nombre: string;
      empresa: string;
      subrubro_id: number | null;
      proveedor_id: number | null;
    }> = {};
    (productosData || []).forEach(p => {
      productosMap[p.id] = p;
    });

    // Buscar métricas
    const { data: metricasData } = await supabase
      .from('metricas_producto')
      .select('producto_id, importe_ventas, markup_pct')
      .eq('periodo', periodoActual)
      .in('producto_id', productoIds);

    const metricasMap: Record<number, { importe_ventas: number; markup_pct: number }> = {};
    (metricasData || []).forEach(m => {
      metricasMap[m.producto_id] = {
        importe_ventas: m.importe_ventas || 0,
        markup_pct: m.markup_pct || 0,
      };
    });

    // Buscar subrubros y proveedores
    const subrubroIdsToFetch = [...new Set((productosData || []).map(p => p.subrubro_id).filter(Boolean))];
    const proveedorIdsToFetch = [...new Set((productosData || []).map(p => p.proveedor_id).filter(Boolean))];

    const subrubrosMap: Record<number, string> = {};
    const proveedoresMap: Record<number, string> = {};

    if (subrubroIdsToFetch.length > 0) {
      const { data: subrubrosData } = await supabase
        .from('subrubros')
        .select('id, nombre')
        .in('id', subrubroIdsToFetch);
      (subrubrosData || []).forEach(s => {
        subrubrosMap[s.id] = s.nombre;
      });
    }

    if (proveedorIdsToFetch.length > 0) {
      const { data: proveedoresData } = await supabase
        .from('proveedores')
        .select('id, nombre')
        .in('id', proveedorIdsToFetch);
      (proveedoresData || []).forEach(p => {
        proveedoresMap[p.id] = p.nombre;
      });
    }

    // Formatear respuesta
    let formattedData = analisisData.map((item) => {
      const prod = productosMap[item.producto_id] || {};
      const metricas = metricasMap[item.producto_id] || { importe_ventas: 0, markup_pct: 0 };

      return {
        id: item.id,
        producto_id: item.producto_id,
        periodo: item.periodo,
        codigo: prod.codigo || '',
        nombre: prod.nombre || '',
        empresa: prod.empresa || '',
        subrubro: subrubrosMap[prod.subrubro_id as number] || '',
        subrubro_id: prod.subrubro_id || null,
        proveedor: proveedoresMap[prod.proveedor_id as number] || '',
        proveedor_id: prod.proveedor_id || null,
        importe_ventas: metricas.importe_ventas,
        markup_pct: metricas.markup_pct,
        markup_minimo_pct: item.markup_minimo_pct || 0,
        gasto_total: item.gasto_total || 0,
        resultado: item.resultado || 0,
        en_perdida: item.en_perdida || false,
        cumple_objetivo: item.cumple_objetivo || false,
      };
    });

    // Filtrar por empresa, subrubro, proveedor y búsqueda
    if (empresa !== 'todas') {
      formattedData = formattedData.filter(p => p.empresa === empresa);
    }
    if (subrubroIds.length > 0) {
      const ids = subrubroIds.map(Number);
      formattedData = formattedData.filter(p => p.subrubro_id && ids.includes(p.subrubro_id));
    }
    if (proveedorIds.length > 0) {
      const ids = proveedorIds.map(Number);
      formattedData = formattedData.filter(p => p.proveedor_id && ids.includes(p.proveedor_id));
    }
    if (busqueda) {
      const searchLower = busqueda.toLowerCase();
      formattedData = formattedData.filter(p =>
        p.nombre.toLowerCase().includes(searchLower) ||
        p.codigo.toLowerCase().includes(searchLower)
      );
    }

    const total = count || 0;
    const pages = Math.ceil(total / limit);

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

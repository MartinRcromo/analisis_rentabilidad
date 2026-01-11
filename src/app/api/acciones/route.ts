import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// GET - Listar acciones
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado');
    const tipo = searchParams.get('tipo');
    const periodo = searchParams.get('periodo');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const supabase = createAdminClient();

    let query = supabase
      .from('acciones_subrubro')
      .select(`
        *,
        producto:productos(id, codigo, nombre, empresa),
        subrubro:subrubros(id, nombre),
        proveedor:proveedores(id, nombre)
      `, { count: 'exact' })
      .order('fecha_creacion', { ascending: false });

    if (estado) {
      query = query.eq('estado', estado);
    }

    if (tipo) {
      query = query.eq('tipo_accion', tipo);
    }

    if (periodo) {
      query = query.eq('periodo', periodo);
    }

    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: 'Error obteniendo acciones' }, { status: 500 });
    }

    const total = count || 0;
    const pages = Math.ceil(total / limit);

    return NextResponse.json({
      data: data || [],
      pagination: {
        total,
        page,
        pages,
        hasMore: page < pages,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Crear acción
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      producto_id,
      subrubro_id,
      proveedor_id,
      periodo,
      tipo_accion,
      descripcion,
      impacto_estimado,
    } = body;

    if (!periodo || !tipo_accion || !descripcion) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: periodo, tipo_accion, descripcion' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('acciones_subrubro')
      .insert({
        producto_id: producto_id || null,
        subrubro_id: subrubro_id || null,
        proveedor_id: proveedor_id || null,
        periodo,
        tipo_accion,
        descripcion,
        impacto_estimado: impacto_estimado || null,
        estado: 'pendiente',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Error creando acción', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH - Actualizar acción
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, estado, descripcion, impacto_estimado } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID de acción requerido' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (estado) {
      updates.estado = estado;
      if (estado === 'completada') {
        updates.fecha_cierre = new Date().toISOString();
      }
    }
    if (descripcion) updates.descripcion = descripcion;
    if (impacto_estimado !== undefined) updates.impacto_estimado = impacto_estimado;

    const { data, error } = await supabase
      .from('acciones_subrubro')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Error actualizando acción' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar acción
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID de acción requerido' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase.from('acciones_subrubro').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: 'Error eliminando acción' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

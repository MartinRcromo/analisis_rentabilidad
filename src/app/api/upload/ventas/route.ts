import { NextRequest, NextResponse } from 'next/server';
import { parseVentasExcel, extractPeriodoFromFilename } from '@/lib/parsers/parseVentas';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const periodoParam = formData.get('periodo') as string;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    // Determinar período
    let periodo = periodoParam;
    if (!periodo) {
      periodo = extractPeriodoFromFilename(file.name) || '';
    }

    if (!periodo) {
      return NextResponse.json(
        { error: 'No se pudo determinar el período. Proporcione el parámetro periodo.' },
        { status: 400 }
      );
    }

    // Parsear Excel
    const buffer = await file.arrayBuffer();
    const parseResult = await parseVentasExcel(buffer);

    if (!parseResult.success && parseResult.data.length === 0) {
      return NextResponse.json(
        { error: 'Error parseando Excel', details: parseResult.errors },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Insertar/actualizar subrubros
    const subrubrosUnicos = [...new Set(parseResult.data.map((v) => v.subrubro).filter(Boolean))];
    const { data: subrubrosExistentes } = await supabase
      .from('subrubros')
      .select('id, nombre')
      .in('nombre', subrubrosUnicos);

    const subrubrosMap = new Map<string, number>();
    (subrubrosExistentes || []).forEach((s) => subrubrosMap.set(s.nombre, s.id));

    const subrubrosNuevos = subrubrosUnicos.filter((s) => !subrubrosMap.has(s));
    if (subrubrosNuevos.length > 0) {
      const { data: insertados } = await supabase
        .from('subrubros')
        .insert(subrubrosNuevos.map((nombre) => ({ nombre })))
        .select();

      (insertados || []).forEach((s) => subrubrosMap.set(s.nombre, s.id));
    }

    // 2. Insertar/actualizar proveedores
    const proveedoresUnicos = [
      ...new Set(parseResult.data.map((v) => `${v.idproveedor}|${v.proveedor}`).filter(Boolean)),
    ];
    const proveedoresCodigos = proveedoresUnicos.map((p) => p.split('|')[0]);

    const { data: proveedoresExistentes } = await supabase
      .from('proveedores')
      .select('id, codigo, nombre')
      .in('codigo', proveedoresCodigos);

    const proveedoresMap = new Map<string, number>();
    (proveedoresExistentes || []).forEach((p) => proveedoresMap.set(p.codigo, p.id));

    const proveedoresNuevos = proveedoresUnicos
      .filter((p) => !proveedoresMap.has(p.split('|')[0]))
      .map((p) => {
        const [codigo, nombre] = p.split('|');
        return { codigo, nombre: nombre || codigo };
      });

    if (proveedoresNuevos.length > 0) {
      const { data: insertados } = await supabase
        .from('proveedores')
        .insert(proveedoresNuevos)
        .select();

      (insertados || []).forEach((p) => proveedoresMap.set(p.codigo, p.id));
    }

    // 3. Insertar/actualizar compradores
    const compradoresUnicos = [
      ...new Set(parseResult.data.map((v) => v.idcomprador).filter(Boolean)),
    ];
    const { data: compradoresExistentes } = await supabase
      .from('compradores')
      .select('id, codigo')
      .in('codigo', compradoresUnicos);

    const compradoresMap = new Map<string, number>();
    (compradoresExistentes || []).forEach((c) => compradoresMap.set(c.codigo, c.id));

    const compradoresNuevos = compradoresUnicos
      .filter((c) => !compradoresMap.has(c))
      .map((codigo) => ({ codigo }));

    if (compradoresNuevos.length > 0) {
      const { data: insertados } = await supabase
        .from('compradores')
        .insert(compradoresNuevos)
        .select();

      (insertados || []).forEach((c) => compradoresMap.set(c.codigo, c.id));
    }

    // 4. Insertar/actualizar categorías
    const categoriasUnicas = [
      ...new Set(parseResult.data.map((v) => v.idcategoria).filter(Boolean)),
    ];
    const { data: categoriasExistentes } = await supabase
      .from('categorias')
      .select('id, codigo')
      .in('codigo', categoriasUnicas);

    const categoriasMap = new Map<string, number>();
    (categoriasExistentes || []).forEach((c) => categoriasMap.set(c.codigo, c.id));

    const categoriasNuevas = categoriasUnicas
      .filter((c) => !categoriasMap.has(c))
      .map((codigo) => ({ codigo }));

    if (categoriasNuevas.length > 0) {
      const { data: insertadas } = await supabase
        .from('categorias')
        .insert(categoriasNuevas)
        .select();

      (insertadas || []).forEach((c) => categoriasMap.set(c.codigo, c.id));
    }

    // 5. Insertar/actualizar productos
    const productosCodigos = [...new Set(parseResult.data.map((v) => v.idproducto))];
    const { data: productosExistentes } = await supabase
      .from('productos')
      .select('id, codigo')
      .in('codigo', productosCodigos);

    const productosMap = new Map<string, number>();
    (productosExistentes || []).forEach((p) => productosMap.set(p.codigo, p.id));

    // Preparar productos nuevos
    const productosNuevosData = parseResult.data
      .filter((v) => !productosMap.has(v.idproducto))
      .map((v) => ({
        codigo: v.idproducto,
        nombre: v.producto,
        empresa: v.empresa as 'Cromo' | 'BBA',
        subrubro_id: subrubrosMap.get(v.subrubro) || null,
        proveedor_id: proveedoresMap.get(v.idproveedor) || null,
        comprador_id: compradoresMap.get(v.idcomprador) || null,
        categoria_id: categoriasMap.get(v.idcategoria) || null,
      }));

    // Eliminar duplicados por codigo
    const productosNuevosUnicos = Array.from(
      new Map(productosNuevosData.map((p) => [p.codigo, p])).values()
    );

    if (productosNuevosUnicos.length > 0) {
      // Insertar en lotes de 1000
      const batchSize = 1000;
      for (let i = 0; i < productosNuevosUnicos.length; i += batchSize) {
        const batch = productosNuevosUnicos.slice(i, i + batchSize);
        const { data: insertados } = await supabase.from('productos').insert(batch).select();

        (insertados || []).forEach((p) => productosMap.set(p.codigo, p.id));
      }
    }

    // 6. Insertar métricas del período
    // Primero eliminar métricas existentes del período
    await supabase.from('metricas_producto').delete().eq('periodo', periodo);

    // Preparar métricas
    const metricasData = parseResult.data
      .map((v) => {
        const productoId = productosMap.get(v.idproducto);
        if (!productoId) return null;

        const margenBruto = (v.importe_Ventas || 0) - (v.importe_costo || 0);
        const markupPct =
          v.importe_costo > 0 ? ((v.importe_Ventas / v.importe_costo) - 1) * 100 : 0;

        return {
          producto_id: productoId,
          periodo,
          importe_ventas: v.importe_Ventas || 0,
          importe_costo: v.importe_costo || 0,
          margen_bruto: margenBruto,
          markup_pct: markupPct,
          stock_unidades: v.stock_unidades || 0,
          stock_costo: v.stock_costo || 0,
          stock_volumen: v.stock_volumen || 0,
        };
      })
      .filter(Boolean);

    // Insertar en lotes
    const batchSize = 1000;
    let metricasInsertadas = 0;
    for (let i = 0; i < metricasData.length; i += batchSize) {
      const batch = metricasData.slice(i, i + batchSize);
      const { error } = await supabase.from('metricas_producto').insert(batch);
      if (!error) {
        metricasInsertadas += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      periodo,
      productos_cargados: productosMap.size,
      metricas_insertadas: metricasInsertadas,
      total_ventas: parseResult.summary.totalVentas,
      total_costo: parseResult.summary.totalCosto,
      empresas: parseResult.summary.empresas,
      subrubros: parseResult.summary.subrubros,
      proveedores: parseResult.summary.proveedores,
      warnings: parseResult.errors.length > 0 ? parseResult.errors.slice(0, 10) : [],
    });
  } catch (error) {
    console.error('Error en upload ventas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

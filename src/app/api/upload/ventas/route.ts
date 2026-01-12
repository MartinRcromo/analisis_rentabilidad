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
    const dbErrors: string[] = [];

    // 1. Insertar/actualizar subrubros
    const subrubrosUnicos = [...new Set(parseResult.data.map((v) => v.subrubro).filter(Boolean))];
    const { data: subrubrosExistentes, error: errSubrubrosSelect } = await supabase
      .from('subrubros')
      .select('id, nombre')
      .in('nombre', subrubrosUnicos);

    if (errSubrubrosSelect) {
      dbErrors.push(`Error leyendo subrubros: ${errSubrubrosSelect.message}`);
    }

    const subrubrosMap = new Map<string, number>();
    (subrubrosExistentes || []).forEach((s) => subrubrosMap.set(s.nombre, s.id));

    const subrubrosNuevos = subrubrosUnicos.filter((s) => !subrubrosMap.has(s));
    if (subrubrosNuevos.length > 0) {
      const { data: insertados, error: errSubrubrosInsert } = await supabase
        .from('subrubros')
        .insert(subrubrosNuevos.map((nombre) => ({ nombre })))
        .select();

      if (errSubrubrosInsert) {
        dbErrors.push(`Error insertando subrubros: ${errSubrubrosInsert.message}`);
      }
      (insertados || []).forEach((s) => subrubrosMap.set(s.nombre, s.id));
    }

    // 2. Insertar/actualizar proveedores
    const proveedoresUnicos = [
      ...new Set(parseResult.data.map((v) => `${v.idproveedor}|${v.proveedor}`).filter(Boolean)),
    ];
    const proveedoresCodigos = proveedoresUnicos.map((p) => p.split('|')[0]).filter(Boolean);

    const proveedoresMap = new Map<string, number>();

    if (proveedoresCodigos.length > 0) {
      const { data: proveedoresExistentes, error: errProvSelect } = await supabase
        .from('proveedores')
        .select('id, codigo, nombre')
        .in('codigo', proveedoresCodigos);

      if (errProvSelect) {
        dbErrors.push(`Error leyendo proveedores: ${errProvSelect.message}`);
      }
      (proveedoresExistentes || []).forEach((p) => proveedoresMap.set(p.codigo, p.id));
    }

    const proveedoresNuevos = proveedoresUnicos
      .filter((p) => {
        const codigo = p.split('|')[0];
        return codigo && !proveedoresMap.has(codigo);
      })
      .map((p) => {
        const [codigo, nombre] = p.split('|');
        return { codigo, nombre: nombre || codigo };
      });

    if (proveedoresNuevos.length > 0) {
      const { data: insertados, error: errProvInsert } = await supabase
        .from('proveedores')
        .insert(proveedoresNuevos)
        .select();

      if (errProvInsert) {
        dbErrors.push(`Error insertando proveedores: ${errProvInsert.message}`);
      }
      (insertados || []).forEach((p) => proveedoresMap.set(p.codigo, p.id));
    }

    // 3. Insertar/actualizar compradores
    const compradoresUnicos = [
      ...new Set(parseResult.data.map((v) => v.idcomprador).filter(Boolean)),
    ];
    const compradoresMap = new Map<string, number>();

    if (compradoresUnicos.length > 0) {
      const { data: compradoresExistentes, error: errCompSelect } = await supabase
        .from('compradores')
        .select('id, codigo')
        .in('codigo', compradoresUnicos);

      if (errCompSelect) {
        dbErrors.push(`Error leyendo compradores: ${errCompSelect.message}`);
      }
      (compradoresExistentes || []).forEach((c) => compradoresMap.set(c.codigo, c.id));
    }

    const compradoresNuevos = compradoresUnicos
      .filter((c) => c && !compradoresMap.has(c))
      .map((codigo) => ({ codigo }));

    if (compradoresNuevos.length > 0) {
      const { data: insertados, error: errCompInsert } = await supabase
        .from('compradores')
        .insert(compradoresNuevos)
        .select();

      if (errCompInsert) {
        dbErrors.push(`Error insertando compradores: ${errCompInsert.message}`);
      }
      (insertados || []).forEach((c) => compradoresMap.set(c.codigo, c.id));
    }

    // 4. Insertar/actualizar categorías
    const categoriasUnicas = [
      ...new Set(parseResult.data.map((v) => v.idcategoria).filter(Boolean)),
    ];
    const categoriasMap = new Map<string, number>();

    if (categoriasUnicas.length > 0) {
      const { data: categoriasExistentes, error: errCatSelect } = await supabase
        .from('categorias')
        .select('id, codigo')
        .in('codigo', categoriasUnicas);

      if (errCatSelect) {
        dbErrors.push(`Error leyendo categorías: ${errCatSelect.message}`);
      }
      (categoriasExistentes || []).forEach((c) => categoriasMap.set(c.codigo, c.id));
    }

    const categoriasNuevas = categoriasUnicas
      .filter((c) => c && !categoriasMap.has(c))
      .map((codigo) => ({ codigo }));

    if (categoriasNuevas.length > 0) {
      const { data: insertadas, error: errCatInsert } = await supabase
        .from('categorias')
        .insert(categoriasNuevas)
        .select();

      if (errCatInsert) {
        dbErrors.push(`Error insertando categorías: ${errCatInsert.message}`);
      }
      (insertadas || []).forEach((c) => categoriasMap.set(c.codigo, c.id));
    }

    // 5. Insertar/actualizar productos usando upsert
    const productosMap = new Map<string, number>();

    // Preparar todos los productos (upsert manejará duplicados)
    const productosData = parseResult.data
      .filter((v) => v.idproducto)
      .map((v) => ({
        codigo: v.idproducto,
        nombre: v.producto,
        empresa: v.empresa as 'Cromo' | 'BBA',
        subrubro_id: subrubrosMap.get(v.subrubro) || null,
        proveedor_id: proveedoresMap.get(v.idproveedor) || null,
        comprador_id: compradoresMap.get(v.idcomprador) || null,
        categoria_id: categoriasMap.get(v.idcategoria) || null,
      }));

    // Eliminar duplicados por codigo (mantener el último)
    const productosUnicos = Array.from(
      new Map(productosData.map((p) => [p.codigo, p])).values()
    );

    console.log(`Upserting ${productosUnicos.length} productos`);

    if (productosUnicos.length > 0) {
      // Upsert en lotes de 500
      const batchSize = 500;
      for (let i = 0; i < productosUnicos.length; i += batchSize) {
        const batch = productosUnicos.slice(i, i + batchSize);
        const { data: upserted, error: errProdUpsert } = await supabase
          .from('productos')
          .upsert(batch, { onConflict: 'codigo' })
          .select('id, codigo');

        if (errProdUpsert) {
          dbErrors.push(`Error upserting productos (lote ${i}): ${errProdUpsert.message}`);
          console.error('Error upserting productos:', errProdUpsert);
        }
        (upserted || []).forEach((p) => productosMap.set(p.codigo, p.id));
      }
    }

    console.log(`Total productos en mapa: ${productosMap.size}`);

    // 6. Insertar métricas del período
    // Primero eliminar métricas existentes del período
    const { error: errDeleteMetricas } = await supabase
      .from('metricas_producto')
      .delete()
      .eq('periodo', periodo);

    if (errDeleteMetricas) {
      dbErrors.push(`Error eliminando métricas anteriores: ${errDeleteMetricas.message}`);
    }

    // Preparar métricas
    const metricasData = parseResult.data
      .map((v) => {
        const productoId = productosMap.get(v.idproducto);
        if (!productoId) {
          return null;
        }

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

    console.log(`Insertando ${metricasData.length} métricas`);

    // Insertar en lotes
    const batchSize = 500;
    let metricasInsertadas = 0;
    for (let i = 0; i < metricasData.length; i += batchSize) {
      const batch = metricasData.slice(i, i + batchSize);
      const { error: errMetricasInsert } = await supabase.from('metricas_producto').insert(batch);
      if (errMetricasInsert) {
        dbErrors.push(`Error insertando métricas (lote ${i}): ${errMetricasInsert.message}`);
        console.error('Error insertando métricas:', errMetricasInsert);
      } else {
        metricasInsertadas += batch.length;
      }
    }

    // Si hay errores de BD, devolverlos
    if (dbErrors.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Hubo errores al guardar en la base de datos',
        dbErrors,
        parseErrors: parseResult.errors.slice(0, 10),
        periodo,
        productos_parseados: parseResult.data.length,
        productos_guardados: productosMap.size,
      }, { status: 500 });
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

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
    const batchSize = 200; // Tamaño de lote más pequeño para evitar problemas

    // 1. Upsert subrubros
    const subrubrosUnicos = [...new Set(parseResult.data.map((v) => v.subrubro).filter(Boolean))];
    const subrubrosMap = new Map<string, number>();

    if (subrubrosUnicos.length > 0) {
      const subrubrosData = subrubrosUnicos.map((nombre) => ({ nombre }));

      for (let i = 0; i < subrubrosData.length; i += batchSize) {
        const batch = subrubrosData.slice(i, i + batchSize);
        const { data: upserted, error } = await supabase
          .from('subrubros')
          .upsert(batch, { onConflict: 'nombre' })
          .select('id, nombre');

        if (error) {
          dbErrors.push(`Error upserting subrubros (lote ${i}): ${error.message}`);
        }
        (upserted || []).forEach((s) => subrubrosMap.set(s.nombre, s.id));
      }
    }

    // 2. Upsert proveedores
    const proveedoresUnicos = [
      ...new Set(parseResult.data.map((v) => `${v.idproveedor}|${v.proveedor}`).filter((p) => p && p.split('|')[0])),
    ];
    const proveedoresMap = new Map<string, number>();

    if (proveedoresUnicos.length > 0) {
      const proveedoresData = proveedoresUnicos.map((p) => {
        const [codigo, nombre] = p.split('|');
        return { codigo, nombre: nombre || codigo };
      });

      for (let i = 0; i < proveedoresData.length; i += batchSize) {
        const batch = proveedoresData.slice(i, i + batchSize);
        const { data: upserted, error } = await supabase
          .from('proveedores')
          .upsert(batch, { onConflict: 'codigo' })
          .select('id, codigo');

        if (error) {
          dbErrors.push(`Error upserting proveedores (lote ${i}): ${error.message}`);
        }
        (upserted || []).forEach((p) => proveedoresMap.set(p.codigo, p.id));
      }
    }

    // 3. Upsert compradores
    const compradoresUnicos = [...new Set(parseResult.data.map((v) => v.idcomprador).filter(Boolean))];
    const compradoresMap = new Map<string, number>();

    if (compradoresUnicos.length > 0) {
      const compradoresData = compradoresUnicos.map((codigo) => ({ codigo }));

      for (let i = 0; i < compradoresData.length; i += batchSize) {
        const batch = compradoresData.slice(i, i + batchSize);
        const { data: upserted, error } = await supabase
          .from('compradores')
          .upsert(batch, { onConflict: 'codigo' })
          .select('id, codigo');

        if (error) {
          dbErrors.push(`Error upserting compradores (lote ${i}): ${error.message}`);
        }
        (upserted || []).forEach((c) => compradoresMap.set(c.codigo, c.id));
      }
    }

    // 4. Upsert categorías
    const categoriasUnicas = [...new Set(parseResult.data.map((v) => v.idcategoria).filter(Boolean))];
    const categoriasMap = new Map<string, number>();

    if (categoriasUnicas.length > 0) {
      const categoriasData = categoriasUnicas.map((codigo) => ({ codigo }));

      for (let i = 0; i < categoriasData.length; i += batchSize) {
        const batch = categoriasData.slice(i, i + batchSize);
        const { data: upserted, error } = await supabase
          .from('categorias')
          .upsert(batch, { onConflict: 'codigo' })
          .select('id, codigo');

        if (error) {
          dbErrors.push(`Error upserting categorías (lote ${i}): ${error.message}`);
        }
        (upserted || []).forEach((c) => categoriasMap.set(c.codigo, c.id));
      }
    }

    // 5. Upsert productos
    const productosMap = new Map<string, number>();

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

    // Eliminar duplicados por codigo
    const productosUnicos = Array.from(
      new Map(productosData.map((p) => [p.codigo, p])).values()
    );

    console.log(`Upserting ${productosUnicos.length} productos`);

    for (let i = 0; i < productosUnicos.length; i += batchSize) {
      const batch = productosUnicos.slice(i, i + batchSize);
      const { data: upserted, error } = await supabase
        .from('productos')
        .upsert(batch, { onConflict: 'codigo' })
        .select('id, codigo');

      if (error) {
        dbErrors.push(`Error upserting productos (lote ${i}): ${error.message}`);
        console.error('Error upserting productos:', error);
      }
      (upserted || []).forEach((p) => productosMap.set(p.codigo, p.id));
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
          // Nuevos campos para modelo de 5 grupos
          unidades_vendidas: v.unidades_vendidas || 0,
          veces_pedido: v.veces_pedido || 0,
        };
      })
      .filter(Boolean);

    console.log(`Insertando ${metricasData.length} métricas`);

    // Insertar en lotes
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

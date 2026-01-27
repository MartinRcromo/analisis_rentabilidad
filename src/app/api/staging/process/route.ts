import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// =============================================================================
// HELPER: Obtener todos los registros con paginación
// =============================================================================
async function fetchAllRecords(table: string, filter?: { column: string; value: boolean }) {
  const PAGE_SIZE = 1000;
  let allRecords: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);

    if (filter) {
      query = query.eq(filter.column, filter.value);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Error leyendo ${table}: ${error.message}`);

    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

// =============================================================================
// PROCESAR VENTAS STAGING (TypeScript directo)
// =============================================================================
async function procesarVentasStaging(periodo: string, reprocesar: boolean = false) {
  const results = {
    subrubros_procesados: 0,
    proveedores_procesados: 0,
    compradores_procesados: 0,
    categorias_procesadas: 0,
    productos_procesados: 0,
    metricas_insertadas: 0,
    registros_leidos: 0,
  };

  // 1. Si reprocesar, primero resetear el estado
  if (reprocesar) {
    await supabase
      .from('ventas_staging')
      .update({ procesado: false })
      .eq('procesado', true);
    console.log('Registros de ventas_staging reseteados');
  }

  // 2. Obtener TODOS los datos de staging pendientes (con paginación)
  console.log('Obteniendo registros de ventas_staging...');
  const ventasStaging = await fetchAllRecords('ventas_staging', { column: 'procesado', value: false });

  if (!ventasStaging || ventasStaging.length === 0) {
    return { ...results, mensaje: 'No hay ventas pendientes de procesar' };
  }

  results.registros_leidos = ventasStaging.length;
  console.log(`Procesando ${ventasStaging.length} registros de ventas_staging`);

  // 3. Extraer valores únicos
  const subrubros = [...new Set(ventasStaging.map(v => v.subrubro).filter(Boolean))];
  const proveedores = ventasStaging.filter(v => v.idproveedor).map(v => ({ codigo: v.idproveedor, nombre: v.proveedor }));
  const compradores = [...new Set(ventasStaging.map(v => v.idcomprador).filter(Boolean))];
  const categorias = [...new Set(ventasStaging.map(v => v.idcategoria).filter(Boolean))];

  // 4. Upsert subrubros
  if (subrubros.length > 0) {
    const { error } = await supabase
      .from('subrubros')
      .upsert(subrubros.map(nombre => ({ nombre })), { onConflict: 'nombre' });
    if (error) console.error('Error upsert subrubros:', error);
    else results.subrubros_procesados = subrubros.length;
  }

  // 5. Upsert proveedores (eliminar duplicados)
  const proveedoresUnicos = proveedores.reduce((acc, p) => {
    if (!acc.find((x: { codigo: string; nombre: string }) => x.codigo === p.codigo)) acc.push(p);
    return acc;
  }, [] as typeof proveedores);

  if (proveedoresUnicos.length > 0) {
    // Insertar en lotes de 500
    for (let i = 0; i < proveedoresUnicos.length; i += 500) {
      const batch = proveedoresUnicos.slice(i, i + 500);
      const { error } = await supabase
        .from('proveedores')
        .upsert(batch, { onConflict: 'codigo' });
      if (error) console.error('Error upsert proveedores batch:', error);
    }
    results.proveedores_procesados = proveedoresUnicos.length;
  }

  // 6. Upsert compradores
  if (compradores.length > 0) {
    const { error } = await supabase
      .from('compradores')
      .upsert(compradores.map(codigo => ({ codigo })), { onConflict: 'codigo' });
    if (error) console.error('Error upsert compradores:', error);
    else results.compradores_procesados = compradores.length;
  }

  // 7. Upsert categorías
  if (categorias.length > 0) {
    const { error } = await supabase
      .from('categorias')
      .upsert(categorias.map(codigo => ({ codigo })), { onConflict: 'codigo' });
    if (error) console.error('Error upsert categorías:', error);
    else results.categorias_procesadas = categorias.length;
  }

  // 8. Obtener IDs de tablas maestras
  const { data: subrubrosDb } = await supabase.from('subrubros').select('id, nombre');
  const { data: proveedoresDb } = await supabase.from('proveedores').select('id, codigo');
  const { data: compradoresDb } = await supabase.from('compradores').select('id, codigo');
  const { data: categoriasDb } = await supabase.from('categorias').select('id, codigo');

  const subrubroMap = new Map(subrubrosDb?.map(s => [s.nombre, s.id]) || []);
  const proveedorMap = new Map(proveedoresDb?.map(p => [p.codigo, p.id]) || []);
  const compradorMap = new Map(compradoresDb?.map(c => [c.codigo, c.id]) || []);
  const categoriaMap = new Map(categoriasDb?.map(c => [c.codigo, c.id]) || []);

  // 9. Upsert productos (eliminar duplicados)
  type ProductoUnico = {codigo: string; nombre: string; empresa: string; subrubro_id: number | null; proveedor_id: number | null; comprador_id: number | null; categoria_id: number | null};
  const productosUnicos = ventasStaging.reduce((acc, v) => {
    if (v.idproducto && !acc.find((x: ProductoUnico) => x.codigo === v.idproducto)) {
      acc.push({
        codigo: v.idproducto,
        nombre: v.producto,
        empresa: v.empresa,
        subrubro_id: subrubroMap.get(v.subrubro) || null,
        proveedor_id: proveedorMap.get(v.idproveedor) || null,
        comprador_id: compradorMap.get(v.idcomprador) || null,
        categoria_id: categoriaMap.get(v.idcategoria) || null,
      });
    }
    return acc;
  }, [] as ProductoUnico[]);

  if (productosUnicos.length > 0) {
    // Insertar en lotes de 500
    for (let i = 0; i < productosUnicos.length; i += 500) {
      const batch = productosUnicos.slice(i, i + 500);
      const { error } = await supabase
        .from('productos')
        .upsert(batch, { onConflict: 'codigo' });
      if (error) console.error(`Error upsert productos batch ${i}:`, error);
    }
    results.productos_procesados = productosUnicos.length;
  }

  console.log(`Productos únicos procesados: ${productosUnicos.length}`);

  // 10. Obtener IDs de productos
  const productosDb = await fetchAllRecords('productos');
  const productoMap = new Map(productosDb?.map(p => [p.codigo, p.id]) || []);

  console.log(`Productos en BD: ${productoMap.size}`);

  // 11. Eliminar métricas anteriores del período
  await supabase.from('metricas_producto').delete().eq('periodo', periodo);

  // 12. Insertar métricas (en lotes de 500)
  const metricas = ventasStaging
    .filter(v => v.idproducto && productoMap.has(v.idproducto))
    .map(v => ({
      producto_id: productoMap.get(v.idproducto),
      periodo,
      importe_ventas: v.importe_ventas || 0,
      importe_costo: v.importe_costo || 0,
      margen_bruto: (v.importe_ventas || 0) - (v.importe_costo || 0),
      markup_pct: v.importe_costo > 0 ? ((v.importe_ventas / v.importe_costo) - 1) * 100 : 0,
      stock_unidades: v.stock_unidades || 0,
      stock_costo: v.stock_costo || 0,
      stock_volumen: v.stock_volumen || 0,
      unidades_vendidas: v.unidades_vendidas || 0,
      veces_pedido: v.veces_pedido || 1,
    }));

  console.log(`Métricas a insertar: ${metricas.length}`);

  if (metricas.length > 0) {
    for (let i = 0; i < metricas.length; i += 500) {
      const batch = metricas.slice(i, i + 500);
      const { error } = await supabase.from('metricas_producto').insert(batch);
      if (error) {
        console.error(`Error insertando métricas batch ${i}:`, error);
      } else {
        results.metricas_insertadas += batch.length;
      }
    }
  }

  // 13. Marcar como procesados (en lotes)
  const ids = ventasStaging.map(v => v.id);
  for (let i = 0; i < ids.length; i += 500) {
    const batchIds = ids.slice(i, i + 500);
    await supabase
      .from('ventas_staging')
      .update({ procesado: true })
      .in('id', batchIds);
  }

  return results;
}

// =============================================================================
// PROCESAR GASTOS STAGING (TypeScript directo)
// =============================================================================
async function procesarGastosStaging(periodo: string, reprocesar: boolean = false) {
  const results = {
    gastos_detalle_insertados: 0,
    total_facturacion: 0,
    total_ocupacion: 0,
    total_movimiento: 0,
    total_credito: 0,
    total_rentabilidad: 0,
    total_sin_clasificar: 0,
    total_general: 0,
    registros_leidos: 0,
  };

  // 1. Si reprocesar, primero resetear el estado
  if (reprocesar) {
    await supabase
      .from('gastos_staging')
      .update({ procesado: false })
      .eq('procesado', true);
    console.log('Registros de gastos_staging reseteados');
  }

  // 2. Obtener TODOS los datos de staging pendientes (con paginación)
  console.log('Obteniendo registros de gastos_staging...');
  const gastosStaging = await fetchAllRecords('gastos_staging', { column: 'procesado', value: false });

  if (!gastosStaging || gastosStaging.length === 0) {
    return { ...results, mensaje: 'No hay gastos pendientes de procesar' };
  }

  results.registros_leidos = gastosStaging.length;
  console.log(`Procesando ${gastosStaging.length} registros de gastos_staging`);

  // 3. Obtener clasificaciones maestras
  const { data: clasificacionesMaestras } = await supabase
    .from('gastos_clasificacion_maestra')
    .select('*');

  const clasificacionMap = new Map(
    clasificacionesMaestras?.map(c => [
      `${c.sector?.toLowerCase().trim()}|${c.tipogasto?.toLowerCase().trim()}`,
      { clasificacion: c.clasificacion, se_analiza: c.se_analiza }
    ]) || []
  );

  // 4. Aplicar clasificación a cada gasto
  const gastosConClasificacion = gastosStaging.map(g => {
    let clasificacion = g.clasificacion;
    let seAnaliza = g.se_analiza ?? true;

    // Si no tiene clasificación, buscar en maestra
    if (!clasificacion || clasificacion.trim() === '') {
      const key = `${g.sector?.toLowerCase().trim()}|${g.tipogasto?.toLowerCase().trim()}`;
      const maestra = clasificacionMap.get(key);
      if (maestra) {
        clasificacion = maestra.clasificacion;
        seAnaliza = maestra.se_analiza;
      }
    }

    return { ...g, clasificacion, se_analiza: seAnaliza };
  });

  // 5. Calcular totales por categoría
  let cat1_facturacion = 0;
  let cat2_ocupacion = 0;
  let cat3_credito = 0;
  let cat4_rentabilidad = 0;
  let cat5_movimiento = 0;
  let sin_clasificar = 0;

  for (const g of gastosConClasificacion) {
    const importe = g.importe_gasto || 0;
    const cat = g.clasificacion?.toLowerCase().trim();

    switch (cat) {
      case 'facturacion':
        cat1_facturacion += importe;
        break;
      case 'ocupacion':
      case 'volumen':
        cat2_ocupacion += importe;
        break;
      case 'credito':
        cat3_credito += importe;
        break;
      case 'rentabilidad':
        cat4_rentabilidad += importe;
        break;
      case 'movimiento':
        cat5_movimiento += importe;
        break;
      default:
        sin_clasificar += importe;
    }
  }

  const total_clasificado = cat1_facturacion + cat2_ocupacion + cat3_credito + cat4_rentabilidad + cat5_movimiento;
  const total_general = total_clasificado + sin_clasificar;

  // 6. Calcular pesos (porcentajes)
  const peso_facturacion = total_clasificado > 0 ? cat1_facturacion / total_clasificado : 0;
  const peso_ocupacion = total_clasificado > 0 ? cat2_ocupacion / total_clasificado : 0;
  const peso_credito = total_clasificado > 0 ? cat3_credito / total_clasificado : 0;
  const peso_rentabilidad = total_clasificado > 0 ? cat4_rentabilidad / total_clasificado : 0;
  const peso_movimiento = total_clasificado > 0 ? cat5_movimiento / total_clasificado : 0;

  // 7. Calcular finales (distribuir sin_clasificar proporcionalmente)
  const final_facturacion = cat1_facturacion + (peso_facturacion * sin_clasificar);
  const final_ocupacion = cat2_ocupacion + (peso_ocupacion * sin_clasificar);
  const final_credito = cat3_credito + (peso_credito * sin_clasificar);
  const final_rentabilidad = cat4_rentabilidad + (peso_rentabilidad * sin_clasificar);
  const final_movimiento = cat5_movimiento + (peso_movimiento * sin_clasificar);

  console.log('Distribución gastos:', {
    facturacion: final_facturacion,
    ocupacion: final_ocupacion,
    movimiento: final_movimiento,
    credito: final_credito,
    rentabilidad: final_rentabilidad,
    sin_clasificar,
    total_general
  });

  // 8. Eliminar datos anteriores del período
  await supabase.from('gastos_detalle').delete().eq('periodo', periodo);
  await supabase.from('gastos_mensuales').delete().eq('periodo', periodo);

  // 9. Insertar en gastos_mensuales
  const { data: gastosMensuales, error: errorMensual } = await supabase
    .from('gastos_mensuales')
    .insert({
      periodo,
      cat1_facturacion_base: cat1_facturacion,
      cat2_volumen_base: cat2_ocupacion,
      cat3_credito_base: cat3_credito,
      cat4_rentabilidad_base: cat4_rentabilidad,
      cat5_movimiento_base: cat5_movimiento,
      total_clasificado,
      total_sin_clasificar: sin_clasificar,
      total_general,
      peso_facturacion,
      peso_volumen: peso_ocupacion,
      peso_credito,
      peso_rentabilidad,
      peso_movimiento,
      cat1_facturacion_final: final_facturacion,
      cat2_volumen_final: final_ocupacion,
      cat3_credito_final: final_credito,
      cat4_rentabilidad_final: final_rentabilidad,
      cat5_movimiento_final: final_movimiento,
    })
    .select()
    .single();

  if (errorMensual) throw new Error(`Error insertando gastos_mensuales: ${errorMensual.message}`);

  const gastosMensualesId = gastosMensuales.id;

  // 10. Insertar en gastos_detalle (en lotes de 500)
  const detalles = gastosConClasificacion.map(g => ({
    gastos_mensuales_id: gastosMensualesId,
    periodo,
    gerencia: g.gerencia,
    sector: g.sector,
    tipogasto: g.tipogasto,
    proveedorgasto: g.proveedorgasto,
    comprobante: g.comprobante,
    idcomprobante: g.idcomprobante,
    empresa: g.empresa,
    empresatipo: g.empresatipo,
    importe_gasto: g.importe_gasto,
    clasificacion: ['facturacion', 'ocupacion', 'volumen', 'credito', 'rentabilidad', 'movimiento']
      .includes(g.clasificacion?.toLowerCase().trim() || '') ? g.clasificacion : null,
    se_analiza: g.se_analiza,
  }));

  for (let i = 0; i < detalles.length; i += 500) {
    const batch = detalles.slice(i, i + 500);
    const { error } = await supabase.from('gastos_detalle').insert(batch);
    if (error) console.error(`Error insertando detalle batch ${i}:`, error);
    else results.gastos_detalle_insertados += batch.length;
  }

  // 11. Marcar como procesados (en lotes)
  const ids = gastosStaging.map(g => g.id);
  for (let i = 0; i < ids.length; i += 500) {
    const batchIds = ids.slice(i, i + 500);
    await supabase
      .from('gastos_staging')
      .update({ procesado: true })
      .in('id', batchIds);
  }

  results.total_facturacion = final_facturacion;
  results.total_ocupacion = final_ocupacion;
  results.total_movimiento = final_movimiento;
  results.total_credito = final_credito;
  results.total_rentabilidad = final_rentabilidad;
  results.total_sin_clasificar = sin_clasificar;
  results.total_general = total_general;

  return results;
}

// =============================================================================
// POST: Procesar staging
// =============================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { periodo, reprocesar = false } = body;

    if (!periodo) {
      return NextResponse.json(
        { success: false, error: 'Se requiere el período (formato: YYYY-MM-01)' },
        { status: 400 }
      );
    }

    // Validar formato de período
    const periodoDate = new Date(periodo);
    if (isNaN(periodoDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Formato de período inválido. Use YYYY-MM-01' },
        { status: 400 }
      );
    }

    const results: {
      ventas?: Record<string, unknown>;
      gastos?: Record<string, unknown>;
      errors: string[];
    } = { errors: [] };

    // 1. Procesar ventas
    console.log('Procesando ventas staging...');
    try {
      results.ventas = await procesarVentasStaging(periodo, reprocesar);
      console.log('Ventas procesadas:', results.ventas);
    } catch (error) {
      console.error('Error procesando ventas:', error);
      results.errors.push(`Error procesando ventas: ${error instanceof Error ? error.message : error}`);
    }

    // 2. Procesar gastos
    console.log('Procesando gastos staging...');
    try {
      results.gastos = await procesarGastosStaging(periodo, reprocesar);
      console.log('Gastos procesados:', results.gastos);
    } catch (error) {
      console.error('Error procesando gastos:', error);
      results.errors.push(`Error procesando gastos: ${error instanceof Error ? error.message : error}`);
    }

    // 3. Verificar resultados
    const { count: metricasCount } = await supabase
      .from('metricas_producto')
      .select('*', { count: 'exact', head: true })
      .eq('periodo', periodo);

    const { data: gastosMensuales } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .single();

    return NextResponse.json({
      success: results.errors.length === 0,
      periodo,
      resultados: {
        ventas: results.ventas,
        gastos: results.gastos,
        verificacion: {
          metricas_producto: metricasCount || 0,
          gastos_mensuales: gastosMensuales ? 'OK' : 'NO ENCONTRADO'
        }
      },
      errors: results.errors.length > 0 ? results.errors : undefined
    });

  } catch (error) {
    console.error('Error en proceso staging:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET: Verificar estado de staging
// =============================================================================
export async function GET() {
  try {
    // Consultar directamente las tablas staging
    const { count: ventasTotal } = await supabase
      .from('ventas_staging')
      .select('*', { count: 'exact', head: true });

    const { count: ventasPendientes } = await supabase
      .from('ventas_staging')
      .select('*', { count: 'exact', head: true })
      .eq('procesado', false);

    const { count: gastosTotal } = await supabase
      .from('gastos_staging')
      .select('*', { count: 'exact', head: true });

    const { count: gastosPendientes } = await supabase
      .from('gastos_staging')
      .select('*', { count: 'exact', head: true })
      .eq('procesado', false);

    return NextResponse.json({
      success: true,
      staging: [
        {
          tabla: 'ventas_staging',
          total_registros: ventasTotal || 0,
          pendientes: ventasPendientes || 0,
          procesados: (ventasTotal || 0) - (ventasPendientes || 0)
        },
        {
          tabla: 'gastos_staging',
          total_registros: gastosTotal || 0,
          pendientes: gastosPendientes || 0,
          procesados: (gastosTotal || 0) - (gastosPendientes || 0)
        }
      ]
    });

  } catch (error) {
    console.error('Error verificando staging:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE: Resetear estado de staging (marcar todo como no procesado)
// =============================================================================
export async function DELETE() {
  try {
    // Resetear ventas_staging
    const { error: errorVentas } = await supabase
      .from('ventas_staging')
      .update({ procesado: false })
      .eq('procesado', true);

    if (errorVentas) throw new Error(`Error reseteando ventas_staging: ${errorVentas.message}`);

    // Resetear gastos_staging
    const { error: errorGastos } = await supabase
      .from('gastos_staging')
      .update({ procesado: false })
      .eq('procesado', true);

    if (errorGastos) throw new Error(`Error reseteando gastos_staging: ${errorGastos.message}`);

    return NextResponse.json({
      success: true,
      message: 'Tablas staging reseteadas. Todos los registros están pendientes de procesar.'
    });

  } catch (error) {
    console.error('Error reseteando staging:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

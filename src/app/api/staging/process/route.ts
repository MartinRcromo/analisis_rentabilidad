import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables are not configured');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// =============================================================================
// CONSTANTES
// =============================================================================
const BATCH_LIMIT = 2000; // Máximo registros por llamada para evitar timeout

// =============================================================================
// HELPER: Obtener registros con límite (para procesamiento por lotes)
// =============================================================================
async function fetchRecordsWithLimit(table: string, limit: number, filter?: { column: string; value: boolean }) {
  const db = getSupabase();
  let query = db
    .from(table)
    .select('*')
    .limit(limit);

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Error leyendo ${table}: ${error.message}`);

  return data || [];
}

// =============================================================================
// HELPER: Obtener todos los registros con paginación (para tablas maestras)
// =============================================================================
async function fetchAllRecords(table: string, filter?: { column: string; value: boolean }) {
  const PAGE_SIZE = 1000;
  let allRecords: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;
  const db = getSupabase();

  while (hasMore) {
    let query = db
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
// PROCESAR VENTAS STAGING (TypeScript directo) - CON SOPORTE PARA LOTES
// =============================================================================
async function procesarVentasStaging(periodo: string, reprocesar: boolean = false) {
  const db = getSupabase();
  const results = {
    subrubros_procesados: 0,
    proveedores_procesados: 0,
    compradores_procesados: 0,
    categorias_procesadas: 0,
    productos_procesados: 0,
    metricas_insertadas: 0,
    registros_leidos: 0,
    // Nuevos campos para diagnóstico
    errores_detallados: [] as string[],
    paso_actual: '',
    metricas_fallidas: 0,
    productos_sin_mapeo: 0,
    // Info de lotes
    registros_pendientes: 0,
    lote_completado: false,
  };

  // 1. Si reprocesar, primero resetear el estado y eliminar métricas anteriores
  if (reprocesar) {
    results.paso_actual = 'Reseteando registros...';
    await db
      .from('ventas_staging')
      .update({ procesado: false })
      .eq('procesado', true);
    // Eliminar métricas anteriores del período
    await db.from('metricas_producto').delete().eq('periodo', periodo);
    console.log('Registros de ventas_staging reseteados y métricas eliminadas');
  }

  // 2. Obtener UN LOTE de datos de staging pendientes (máximo BATCH_LIMIT)
  console.log(`Obteniendo hasta ${BATCH_LIMIT} registros de ventas_staging...`);
  const ventasStaging = await fetchRecordsWithLimit('ventas_staging', BATCH_LIMIT, { column: 'procesado', value: false });

  // Contar pendientes totales para informar progreso
  const { count: totalPendientes } = await db
    .from('ventas_staging')
    .select('*', { count: 'exact', head: true })
    .eq('procesado', false);

  results.registros_pendientes = (totalPendientes || 0) - ventasStaging.length;

  if (!ventasStaging || ventasStaging.length === 0) {
    return { ...results, mensaje: 'No hay ventas pendientes de procesar' };
  }

  results.registros_leidos = ventasStaging.length;
  console.log(`Procesando ${ventasStaging.length} registros de ventas_staging`);

  // 3. Extraer valores únicos
  const subrubros = [...new Set(ventasStaging.map(v => String(v.subrubro || '')).filter(Boolean))];
  const proveedores: Array<{codigo: string; nombre: string}> = ventasStaging
    .filter(v => v.idproveedor)
    .map(v => ({ codigo: String(v.idproveedor), nombre: String(v.proveedor || '') }));
  const compradores = [...new Set(ventasStaging.map(v => String(v.idcomprador || '')).filter(Boolean))];
  const categorias = [...new Set(ventasStaging.map(v => String(v.idcategoria || '')).filter(Boolean))];

  // 4. Upsert subrubros
  results.paso_actual = 'Procesando subrubros';
  if (subrubros.length > 0) {
    const { error } = await db
      .from('subrubros')
      .upsert(subrubros.map(nombre => ({ nombre })), { onConflict: 'nombre' });
    if (error) {
      const errorMsg = `Error upsert subrubros: ${error.message} (code: ${error.code})`;
      console.error(errorMsg);
      results.errores_detallados.push(errorMsg);
    } else {
      results.subrubros_procesados = subrubros.length;
    }
  }

  // 5. Upsert proveedores (eliminar duplicados)
  const proveedoresUnicos = proveedores.reduce((acc, p) => {
    if (!acc.find(x => x.codigo === p.codigo)) acc.push(p);
    return acc;
  }, [] as Array<{codigo: string; nombre: string}>);

  results.paso_actual = 'Procesando proveedores';
  if (proveedoresUnicos.length > 0) {
    // Insertar en lotes de 500
    for (let i = 0; i < proveedoresUnicos.length; i += 500) {
      const batch = proveedoresUnicos.slice(i, i + 500);
      const { error } = await db
        .from('proveedores')
        .upsert(batch, { onConflict: 'codigo' });
      if (error) {
        const errorMsg = `Error upsert proveedores batch ${i}: ${error.message} (code: ${error.code})`;
        console.error(errorMsg);
        results.errores_detallados.push(errorMsg);
      }
    }
    results.proveedores_procesados = proveedoresUnicos.length;
  }

  // 6. Upsert compradores
  results.paso_actual = 'Procesando compradores';
  if (compradores.length > 0) {
    const { error } = await db
      .from('compradores')
      .upsert(compradores.map(codigo => ({ codigo })), { onConflict: 'codigo' });
    if (error) {
      const errorMsg = `Error upsert compradores: ${error.message} (code: ${error.code})`;
      console.error(errorMsg);
      results.errores_detallados.push(errorMsg);
    } else {
      results.compradores_procesados = compradores.length;
    }
  }

  // 7. Upsert categorías
  results.paso_actual = 'Procesando categorías';
  if (categorias.length > 0) {
    const { error } = await db
      .from('categorias')
      .upsert(categorias.map(codigo => ({ codigo })), { onConflict: 'codigo' });
    if (error) {
      const errorMsg = `Error upsert categorías: ${error.message} (code: ${error.code})`;
      console.error(errorMsg);
      results.errores_detallados.push(errorMsg);
    } else {
      results.categorias_procesadas = categorias.length;
    }
  }

  // 8. Obtener IDs de tablas maestras
  const { data: subrubrosDb } = await db.from('subrubros').select('id, nombre');
  const { data: proveedoresDb } = await db.from('proveedores').select('id, codigo');
  const { data: compradoresDb } = await db.from('compradores').select('id, codigo');
  const { data: categoriasDb } = await db.from('categorias').select('id, codigo');

  const subrubroMap = new Map(subrubrosDb?.map(s => [s.nombre, s.id]) || []);
  const proveedorMap = new Map(proveedoresDb?.map(p => [p.codigo, p.id]) || []);
  const compradorMap = new Map(compradoresDb?.map(c => [c.codigo, c.id]) || []);
  const categoriaMap = new Map(categoriasDb?.map(c => [c.codigo, c.id]) || []);

  // 9. Upsert productos (eliminar duplicados)
  type ProductoUnico = {codigo: string; nombre: string; empresa: string; subrubro_id: number | null; proveedor_id: number | null; comprador_id: number | null; categoria_id: number | null};
  const productosUnicos: ProductoUnico[] = [];
  const codigosVistos = new Set<string>();

  for (const v of ventasStaging) {
    const codigo = String(v.idproducto || '');
    if (codigo && !codigosVistos.has(codigo)) {
      codigosVistos.add(codigo);
      productosUnicos.push({
        codigo,
        nombre: String(v.producto || ''),
        empresa: String(v.empresa || ''),
        subrubro_id: subrubroMap.get(String(v.subrubro || '')) || null,
        proveedor_id: proveedorMap.get(String(v.idproveedor || '')) || null,
        comprador_id: compradorMap.get(String(v.idcomprador || '')) || null,
        categoria_id: categoriaMap.get(String(v.idcategoria || '')) || null,
      });
    }
  }

  results.paso_actual = 'Procesando productos';
  if (productosUnicos.length > 0) {
    // Insertar en lotes de 500
    let productosExitosos = 0;
    for (let i = 0; i < productosUnicos.length; i += 500) {
      const batch = productosUnicos.slice(i, i + 500);
      const { error } = await db
        .from('productos')
        .upsert(batch, { onConflict: 'codigo' });
      if (error) {
        const errorMsg = `Error upsert productos batch ${i}-${i+batch.length}: ${error.message} (code: ${error.code})`;
        console.error(errorMsg);
        results.errores_detallados.push(errorMsg);
      } else {
        productosExitosos += batch.length;
      }
    }
    results.productos_procesados = productosExitosos;
  }

  console.log(`Productos únicos procesados: ${results.productos_procesados}`);

  // 10. Obtener IDs de productos
  const productosDb = await fetchAllRecords('productos');
  const productoMap = new Map(productosDb?.map(p => [p.codigo, p.id]) || []);

  console.log(`Productos en BD: ${productoMap.size}`);

  // 11. Ya NO eliminamos métricas aquí (se hace solo en reprocesar)
  // Solo eliminamos si NO es reprocesar y es el primer lote
  // await db.from('metricas_producto').delete().eq('periodo', periodo);

  // 12. Insertar métricas (en lotes de 500)
  results.paso_actual = 'Preparando métricas';

  // Contar productos sin mapeo para diagnóstico
  const sinMapeo = ventasStaging.filter(v => v.idproducto && !productoMap.has(String(v.idproducto)));
  results.productos_sin_mapeo = sinMapeo.length;
  if (sinMapeo.length > 0) {
    const ejemplos = sinMapeo.slice(0, 5).map(v => String(v.idproducto));
    results.errores_detallados.push(`${sinMapeo.length} registros sin mapeo de producto. Ejemplos: ${ejemplos.join(', ')}`);
  }

  const metricas = ventasStaging
    .filter(v => v.idproducto && productoMap.has(String(v.idproducto)))
    .map(v => {
      const importeVentas = Number(v.importe_ventas) || 0;
      const importeCosto = Number(v.importe_costo) || 0;
      return {
        producto_id: productoMap.get(String(v.idproducto)),
        periodo,
        importe_ventas: importeVentas,
        importe_costo: importeCosto,
        margen_bruto: importeVentas - importeCosto,
        markup_pct: importeCosto > 0 ? ((importeVentas / importeCosto) - 1) * 100 : 0,
        stock_unidades: Number(v.stock_unidades) || 0,
        stock_costo: Number(v.stock_costo) || 0,
        stock_volumen: Number(v.stock_volumen) || 0,
        unidades_vendidas: Number(v.unidades_vendidas) || 0,
        veces_pedido: Number(v.veces_pedido) || 1,
      };
    });

  console.log(`Métricas a insertar: ${metricas.length}`);
  results.paso_actual = `Insertando ${metricas.length} métricas`;

  if (metricas.length > 0) {
    for (let i = 0; i < metricas.length; i += 500) {
      const batch = metricas.slice(i, i + 500);
      const { error, data } = await db.from('metricas_producto').insert(batch).select('id');
      if (error) {
        const errorMsg = `Error insertando métricas batch ${i}-${i+batch.length}: ${error.message} (code: ${error.code}, details: ${error.details || 'none'}, hint: ${error.hint || 'none'})`;
        console.error(errorMsg);
        results.errores_detallados.push(errorMsg);
        results.metricas_fallidas += batch.length;

        // Intentar identificar el registro problemático
        if (batch.length <= 10) {
          for (let j = 0; j < batch.length; j++) {
            const singleResult = await db.from('metricas_producto').insert(batch[j]).select('id');
            if (singleResult.error) {
              results.errores_detallados.push(`  -> Registro ${i+j} falló: producto_id=${batch[j].producto_id}, error=${singleResult.error.message}`);
            } else {
              results.metricas_insertadas += 1;
              results.metricas_fallidas -= 1;
            }
          }
        }
      } else {
        results.metricas_insertadas += data?.length || batch.length;
      }
    }
  }

  // 13. Marcar como procesados (en lotes)
  results.paso_actual = 'Marcando como procesados';
  const ids = ventasStaging.map(v => v.id);
  let marcadosExitosos = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const batchIds = ids.slice(i, i + 500);
    const { error } = await db
      .from('ventas_staging')
      .update({ procesado: true })
      .in('id', batchIds);
    if (error) {
      const errorMsg = `Error marcando procesados batch ${i}-${i+batchIds.length}: ${error.message}`;
      console.error(errorMsg);
      results.errores_detallados.push(errorMsg);
    } else {
      marcadosExitosos += batchIds.length;
    }
  }

  results.paso_actual = 'Completado';
  results.lote_completado = results.registros_pendientes === 0;
  console.log(`Ventas marcadas como procesadas: ${marcadosExitosos}/${ids.length}. Pendientes: ${results.registros_pendientes}`);

  return results;
}

// =============================================================================
// PROCESAR GASTOS STAGING (TypeScript directo)
// =============================================================================
async function procesarGastosStaging(periodo: string, reprocesar: boolean = false) {
  const db = getSupabase();
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
    // Nuevos campos para diagnóstico (igual que ventas)
    errores_detallados: [] as string[],
    paso_actual: '',
  };

  // 1. Si reprocesar, primero resetear el estado
  if (reprocesar) {
    results.paso_actual = 'Reseteando registros de gastos...';

    // Contar cuántos hay que resetear
    const { count: countToReset } = await db
      .from('gastos_staging')
      .select('*', { count: 'exact', head: true })
      .eq('procesado', true);

    console.log(`Gastos a resetear: ${countToReset}`);

    const { error: resetError } = await db
      .from('gastos_staging')
      .update({ procesado: false })
      .eq('procesado', true);

    if (resetError) {
      const errorMsg = `Error reseteando gastos_staging: ${resetError.message}`;
      console.error(errorMsg);
      results.errores_detallados.push(errorMsg);
    } else {
      console.log(`Registros de gastos_staging reseteados: ${countToReset}`);
    }
  }

  // 2. Obtener TODOS los datos de staging pendientes (con paginación)
  results.paso_actual = 'Obteniendo registros de gastos_staging...';
  console.log('Obteniendo registros de gastos_staging...');
  const gastosStaging = await fetchAllRecords('gastos_staging', { column: 'procesado', value: false });

  // Verificación adicional: contar total en la tabla
  const { count: totalGastos } = await db
    .from('gastos_staging')
    .select('*', { count: 'exact', head: true });

  const { count: gastosProcesados } = await db
    .from('gastos_staging')
    .select('*', { count: 'exact', head: true })
    .eq('procesado', true);

  console.log(`Estado gastos_staging: Total=${totalGastos}, Procesados=${gastosProcesados}, Pendientes obtenidos=${gastosStaging.length}`);

  if (!gastosStaging || gastosStaging.length === 0) {
    results.errores_detallados.push(`No hay gastos pendientes. Total en tabla: ${totalGastos}, Ya procesados: ${gastosProcesados}`);
    return { ...results, mensaje: 'No hay gastos pendientes de procesar' };
  }

  results.registros_leidos = gastosStaging.length;
  console.log(`Procesando ${gastosStaging.length} registros de gastos_staging`);

  // Verificar datos de ejemplo para diagnóstico
  if (gastosStaging.length > 0) {
    const ejemplo = gastosStaging[0];
    console.log('Ejemplo de registro gastos_staging:', {
      id: ejemplo.id,
      importe_gasto: ejemplo.importe_gasto,
      tipo_importe: typeof ejemplo.importe_gasto,
      clasificacion: ejemplo.clasificacion,
      sector: ejemplo.sector,
      tipogasto: ejemplo.tipogasto
    });
  }

  // 3. Obtener clasificaciones maestras
  results.paso_actual = 'Obteniendo clasificaciones maestras...';
  const { data: clasificacionesMaestras, error: errorClasif } = await db
    .from('gastos_clasificacion_maestra')
    .select('*');

  if (errorClasif) {
    console.error('Error obteniendo clasificaciones maestras:', errorClasif);
    results.errores_detallados.push(`Error obteniendo clasificaciones: ${errorClasif.message}`);
  }

  console.log(`Clasificaciones maestras encontradas: ${clasificacionesMaestras?.length || 0}`);

  const clasificacionMap = new Map(
    clasificacionesMaestras?.map(c => [
      `${c.sector?.toLowerCase().trim()}|${c.tipogasto?.toLowerCase().trim()}`,
      { clasificacion: c.clasificacion, se_analiza: c.se_analiza }
    ]) || []
  );

  // 4. Aplicar clasificación a cada gasto y calcular totales
  results.paso_actual = 'Calculando totales por categoría...';
  let cat1_facturacion = 0;
  let cat2_ocupacion = 0;
  let cat3_credito = 0;
  let cat4_rentabilidad = 0;
  let cat5_movimiento = 0;
  let sin_clasificar = 0;
  let registros_con_importe_cero = 0;
  let registros_con_importe_null = 0;

  // Procesar cada gasto: aplicar clasificación y sumar
  interface GastoConClasificacion {
    original: Record<string, unknown>;
    clasificacion: string;
    se_analiza: boolean;
  }
  const gastosConClasificacion: GastoConClasificacion[] = [];

  for (const g of gastosStaging) {
    let clasificacion = String(g.clasificacion || '');
    let seAnaliza = Boolean(g.se_analiza ?? true);

    // Si no tiene clasificación, buscar en maestra
    if (!clasificacion || clasificacion.trim() === '') {
      const sector = String(g.sector || '').toLowerCase().trim();
      const tipogasto = String(g.tipogasto || '').toLowerCase().trim();
      const key = `${sector}|${tipogasto}`;
      const maestra = clasificacionMap.get(key);
      if (maestra) {
        clasificacion = maestra.clasificacion || '';
        seAnaliza = Boolean(maestra.se_analiza);
      }
    }

    gastosConClasificacion.push({ original: g, clasificacion, se_analiza: seAnaliza });

    // Sumar al total correspondiente
    const rawImporte = g.importe_gasto;
    const importe = Number(rawImporte) || 0;
    const cat = clasificacion.toLowerCase().trim();

    // Diagnóstico de importes
    if (rawImporte === null || rawImporte === undefined) {
      registros_con_importe_null++;
    } else if (importe === 0) {
      registros_con_importe_cero++;
    }

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

  // Log diagnóstico de importes
  console.log('Diagnóstico de importes:', {
    total_registros: gastosStaging.length,
    registros_con_importe_null: registros_con_importe_null,
    registros_con_importe_cero: registros_con_importe_cero,
    registros_con_importe_valido: gastosStaging.length - registros_con_importe_null - registros_con_importe_cero
  });

  if (registros_con_importe_null > 0 || registros_con_importe_cero > 0) {
    results.errores_detallados.push(
      `Advertencia: ${registros_con_importe_null} registros con importe NULL, ${registros_con_importe_cero} registros con importe 0`
    );
  }

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

  results.paso_actual = 'Eliminando datos anteriores del período...';

  // 8. Eliminar datos anteriores del período
  await db.from('gastos_detalle').delete().eq('periodo', periodo);
  await db.from('gastos_mensuales').delete().eq('periodo', periodo);

  // 9. Insertar en gastos_mensuales
  results.paso_actual = 'Insertando en gastos_mensuales...';
  const { data: gastosMensuales, error: errorMensual } = await db
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

  if (errorMensual) {
    results.errores_detallados.push(`Error insertando gastos_mensuales: ${errorMensual.message}`);
    throw new Error(`Error insertando gastos_mensuales: ${errorMensual.message}`);
  }

  console.log('gastos_mensuales insertado con ID:', gastosMensuales?.id);

  const gastosMensualesId = gastosMensuales?.id;

  if (!gastosMensualesId) {
    const errorMsg = 'Error: gastosMensualesId es null o undefined después de insertar';
    console.error(errorMsg);
    results.errores_detallados.push(errorMsg);
    return results;
  }

  // 10. Insertar en gastos_detalle (en lotes de 500)
  results.paso_actual = `Preparando ${gastosConClasificacion.length} detalles para insertar...`;
  console.log(`Preparando ${gastosConClasificacion.length} detalles para insertar con gastos_mensuales_id=${gastosMensualesId}`);

  const detalles = gastosConClasificacion.map(g => {
    const clasif = String(g.clasificacion || '').toLowerCase().trim();
    const orig = g.original;
    return {
      gastos_mensuales_id: gastosMensualesId,
      periodo,
      gerencia: orig.gerencia ? String(orig.gerencia) : null,
      sector: orig.sector ? String(orig.sector) : null,
      tipogasto: orig.tipogasto ? String(orig.tipogasto) : null,
      proveedorgasto: orig.proveedorgasto ? String(orig.proveedorgasto) : null,
      comprobante: orig.comprobante ? String(orig.comprobante) : null,
      idcomprobante: orig.idcomprobante ? String(orig.idcomprobante) : null,
      empresa: orig.empresa ? String(orig.empresa) : null,
      empresatipo: orig.empresatipo ? String(orig.empresatipo) : null,
      importe_gasto: Number(orig.importe_gasto) || 0,
      clasificacion: ['facturacion', 'ocupacion', 'volumen', 'credito', 'rentabilidad', 'movimiento']
        .includes(clasif) ? g.clasificacion : null,
      se_analiza: g.se_analiza,
    };
  });

  console.log(`Total de detalles a insertar: ${detalles.length}`);
  results.paso_actual = `Insertando ${detalles.length} detalles en gastos_detalle...`;

  let erroresDetalles = 0;
  for (let i = 0; i < detalles.length; i += 500) {
    const batch = detalles.slice(i, i + 500);
    const { error } = await db.from('gastos_detalle').insert(batch);
    if (error) {
      const errorMsg = `Error insertando detalle batch ${i}-${i+batch.length}: ${error.message} (code: ${error.code}, details: ${error.details || 'none'})`;
      console.error(errorMsg);
      results.errores_detallados.push(errorMsg);
      erroresDetalles += batch.length;
    } else {
      results.gastos_detalle_insertados += batch.length;
    }
  }

  if (erroresDetalles > 0) {
    results.errores_detallados.push(`Total de detalles con error: ${erroresDetalles}/${detalles.length}`);
  }

  console.log(`Detalles insertados: ${results.gastos_detalle_insertados}/${detalles.length}`);

  // 11. Marcar como procesados (en lotes)
  results.paso_actual = 'Marcando registros como procesados...';
  const ids = gastosStaging.map(g => g.id);
  let marcadosExitosos = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const batchIds = ids.slice(i, i + 500);
    const { error } = await db
      .from('gastos_staging')
      .update({ procesado: true })
      .in('id', batchIds);
    if (error) {
      const errorMsg = `Error marcando gastos procesados batch ${i}-${i+batchIds.length}: ${error.message}`;
      console.error(errorMsg);
      results.errores_detallados.push(errorMsg);
    } else {
      marcadosExitosos += batchIds.length;
    }
  }

  console.log(`Gastos marcados como procesados: ${marcadosExitosos}/${ids.length}`);

  results.paso_actual = 'Completado';
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
    const db = getSupabase();
    const { count: metricasCount } = await db
      .from('metricas_producto')
      .select('*', { count: 'exact', head: true })
      .eq('periodo', periodo);

    const { data: gastosMensuales } = await db
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .single();

    // Combinar todos los errores para diagnóstico
    const ventasErrores = (results.ventas as Record<string, unknown>)?.errores_detallados as string[] || [];
    const gastosErrores = (results.gastos as Record<string, unknown>)?.errores_detallados as string[] || [];
    const todosLosErrores = [...results.errors, ...ventasErrores, ...gastosErrores];

    // Determinar si hay más registros pendientes
    const ventasPendientes = (results.ventas as Record<string, unknown>)?.registros_pendientes as number || 0;
    const hayMasPendientes = ventasPendientes > 0;

    return NextResponse.json({
      success: results.errors.length === 0 && ventasErrores.length === 0 && gastosErrores.length === 0,
      periodo,
      resultados: {
        ventas: results.ventas,
        gastos: results.gastos,
        verificacion: {
          metricas_producto: metricasCount || 0,
          gastos_mensuales: gastosMensuales ? 'OK' : 'NO ENCONTRADO'
        }
      },
      errors: todosLosErrores.length > 0 ? todosLosErrores : undefined,
      diagnostico: {
        ventas_paso: (results.ventas as Record<string, unknown>)?.paso_actual || 'no iniciado',
        ventas_metricas_fallidas: (results.ventas as Record<string, unknown>)?.metricas_fallidas || 0,
        ventas_productos_sin_mapeo: (results.ventas as Record<string, unknown>)?.productos_sin_mapeo || 0,
      },
      // Info para procesamiento por lotes
      hay_mas_pendientes: hayMasPendientes,
      registros_pendientes: ventasPendientes,
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
    const db = getSupabase();
    // Consultar directamente las tablas staging
    const { count: ventasTotal } = await db
      .from('ventas_staging')
      .select('*', { count: 'exact', head: true });

    const { count: ventasPendientes } = await db
      .from('ventas_staging')
      .select('*', { count: 'exact', head: true })
      .eq('procesado', false);

    const { count: gastosTotal } = await db
      .from('gastos_staging')
      .select('*', { count: 'exact', head: true });

    const { count: gastosPendientes } = await db
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
    const db = getSupabase();
    // Resetear ventas_staging
    const { error: errorVentas } = await db
      .from('ventas_staging')
      .update({ procesado: false })
      .eq('procesado', true);

    if (errorVentas) throw new Error(`Error reseteando ventas_staging: ${errorVentas.message}`);

    // Resetear gastos_staging
    const { error: errorGastos } = await db
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

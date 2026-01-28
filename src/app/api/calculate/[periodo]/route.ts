import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Helper to normalize periodo to YYYY-MM-DD format
function normalizePeriodo(periodo: string): string {
  // Handle various formats: YYYY-MM-DD, YYYY-MM, etc.
  const trimmed = periodo.trim();

  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // If in YYYY-MM format, add -01
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  // Try to parse as date and format
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return trimmed;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ periodo: string }> }
) {
  try {
    const { periodo: rawPeriodo } = await params;

    if (!rawPeriodo) {
      return NextResponse.json({ error: 'Período no proporcionado' }, { status: 400 });
    }

    // Normalize periodo format
    const periodo = normalizePeriodo(decodeURIComponent(rawPeriodo));
    console.log(`[Calculate] Periodo normalizado: ${periodo} (original: ${rawPeriodo})`);

    const supabase = createAdminClient();

    // 1. Obtener gastos del período
    console.log(`[Calculate] Buscando gastos para periodo: ${periodo}`);
    const { data: gastos, error: errorGastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .single();

    if (errorGastos) {
      console.error(`[Calculate] Error buscando gastos: ${errorGastos.message}`);
    }

    if (errorGastos || !gastos) {
      return NextResponse.json(
        { error: `No se encontraron gastos para el período ${periodo}. Cargue primero los gastos.` },
        { status: 400 }
      );
    }

    console.log(`[Calculate] Gastos encontrados:`, {
      facturacion: gastos.cat1_facturacion_final,
      volumen: gastos.cat2_volumen_final,
      credito: gastos.cat3_credito_final,
      rentabilidad: gastos.cat4_rentabilidad_final,
      movimiento: gastos.cat5_movimiento_final,
    });

    // 2. Obtener totales del período
    console.log(`[Calculate] Buscando métricas para periodo: ${periodo}`);
    const { data: totalesData, error: errorTotales } = await supabase
      .from('metricas_producto')
      .select('importe_ventas, stock_volumen, stock_costo, margen_bruto, veces_pedido')
      .eq('periodo', periodo);

    if (errorTotales) {
      console.error(`[Calculate] Error buscando métricas: ${errorTotales.message}`);
    }

    console.log(`[Calculate] Métricas encontradas para totales: ${totalesData?.length || 0}`);

    if (errorTotales || !totalesData || totalesData.length === 0) {
      return NextResponse.json(
        { error: `No se encontraron ventas para el período ${periodo}. Cargue primero las ventas.` },
        { status: 400 }
      );
    }

    const totales = {
      total_facturacion: totalesData.reduce((sum, m) => sum + (Number(m.importe_ventas) || 0), 0),
      total_volumen_m3: totalesData.reduce((sum, m) => sum + (Number(m.stock_volumen) || 0), 0),
      total_stock_valorizado: totalesData.reduce((sum, m) => sum + (Number(m.stock_costo) || 0), 0),
      total_margen_bruto: totalesData.reduce((sum, m) => sum + (Number(m.margen_bruto) || 0), 0),
      total_veces_pedido: totalesData.reduce((sum, m) => sum + (Number(m.veces_pedido) || 0), 0),
      gastos_facturacion: Number(gastos.cat1_facturacion_final) || 0,
      gastos_volumen: Number(gastos.cat2_volumen_final) || 0,
      gastos_credito: Number(gastos.cat3_credito_final) || 0,
      gastos_rentabilidad: Number(gastos.cat4_rentabilidad_final) || 0,
      gastos_movimiento: Number(gastos.cat5_movimiento_final) || 0,
    };

    console.log(`[Calculate] Totales calculados:`, totales);

    // 3. Obtener todas las métricas del período (solo con producto_id válido)
    console.log(`[Calculate] Obteniendo métricas completas para periodo: ${periodo}`);
    const { data: metricasRaw, error: errorMetricas } = await supabase
      .from('metricas_producto')
      .select('*')
      .eq('periodo', periodo)
      .not('producto_id', 'is', null);

    if (errorMetricas) {
      console.error(`[Calculate] Error obteniendo métricas: ${errorMetricas.message}`);
      return NextResponse.json({ error: `Error obteniendo métricas: ${errorMetricas.message}` }, { status: 500 });
    }

    if (!metricasRaw) {
      return NextResponse.json({ error: 'Error obteniendo métricas: respuesta vacía' }, { status: 500 });
    }

    // Filter out any records with null producto_id (extra safety)
    const metricas = metricasRaw.filter(m => m.producto_id != null);
    console.log(`[Calculate] Métricas válidas: ${metricas.length} (de ${metricasRaw.length} totales)`);

    if (metricas.length === 0) {
      return NextResponse.json({
        error: `No se encontraron métricas con producto válido para el período ${periodo}`,
        metricas_totales: metricasRaw.length,
        metricas_con_producto: 0,
      }, { status: 400 });
    }

    // 4. Eliminar análisis existentes del período
    console.log(`[Calculate] Eliminando análisis existentes para periodo: ${periodo}`);
    const { error: deleteError } = await supabase
      .from('analisis_producto')
      .delete()
      .eq('periodo', periodo);

    if (deleteError) {
      console.error(`[Calculate] Error eliminando análisis: ${deleteError.message}`);
    } else {
      console.log(`[Calculate] Análisis anteriores eliminados exitosamente`);
    }

    // 5. Calcular análisis para cada producto
    const analisisData = metricas.map((m) => {
      const importe_ventas = m.importe_ventas || 0;
      const importe_costo = m.importe_costo || 0;
      const margen_bruto = m.margen_bruto || 0;
      const markup_pct = m.markup_pct || 0;
      const stock_costo = m.stock_costo || 0;
      const stock_volumen = m.stock_volumen || 0;
      const veces_pedido = m.veces_pedido || 0;

      // Calcular porcentajes de asignación
      const porcentaje_facturacion =
        totales.total_facturacion > 0 ? importe_ventas / totales.total_facturacion : 0;

      const porcentaje_volumen =
        totales.total_volumen_m3 > 0 ? stock_volumen / totales.total_volumen_m3 : 0;

      const porcentaje_credito =
        totales.total_stock_valorizado > 0 ? stock_costo / totales.total_stock_valorizado : 0;

      const porcentaje_markup =
        totales.total_margen_bruto > 0 ? margen_bruto / totales.total_margen_bruto : 0;

      const porcentaje_movimiento =
        totales.total_veces_pedido > 0 ? veces_pedido / totales.total_veces_pedido : 0;

      // Asignar gastos
      const gasto_facturacion = porcentaje_facturacion * totales.gastos_facturacion;
      const gasto_volumen = porcentaje_volumen * totales.gastos_volumen;
      const gasto_credito = porcentaje_credito * totales.gastos_credito;
      const gasto_markup = porcentaje_markup * totales.gastos_rentabilidad;
      const gasto_movimiento = porcentaje_movimiento * totales.gastos_movimiento;
      const gasto_total = gasto_facturacion + gasto_volumen + gasto_credito + gasto_markup + gasto_movimiento;

      // Resultado
      const resultado = margen_bruto - gasto_total;
      const en_perdida = resultado < 0;

      // Markup mínimo - capped at 9999.9999 to prevent NUMERIC(8,4) overflow
      const markup_minimo_raw = importe_costo > 0 ? (gasto_total / importe_costo) * 100 : 0;
      const markup_minimo_pct = Math.min(markup_minimo_raw, 9999.9999);
      const cumple_objetivo = markup_pct >= markup_minimo_pct;

      return {
        producto_id: m.producto_id,
        periodo,
        porcentaje_facturacion,
        porcentaje_volumen,
        porcentaje_credito,
        porcentaje_markup,
        porcentaje_movimiento,
        gasto_facturacion,
        gasto_volumen,
        gasto_credito,
        gasto_markup,
        gasto_movimiento,
        gasto_total,
        resultado,
        en_perdida,
        markup_minimo_pct,
        cumple_objetivo,
      };
    });

    // 6. Insertar análisis en lotes
    const batchSize = 1000;
    let insertados = 0;
    let productosEnPerdida = 0;
    let perdidaTotal = 0;
    let beneficioTotal = 0;
    const erroresInsercion: string[] = [];

    console.log(`[Calculate] Intentando insertar ${analisisData.length} análisis para período ${periodo}`);

    // Log sample of first record for debugging
    if (analisisData.length > 0) {
      console.log(`[Calculate] Ejemplo de registro a insertar:`, JSON.stringify(analisisData[0], null, 2));
    }

    for (let i = 0; i < analisisData.length; i += batchSize) {
      const batch = analisisData.slice(i, i + batchSize);

      // Validate batch data before insert
      const invalidRecords = batch.filter(a => a.producto_id == null || isNaN(a.gasto_total));
      if (invalidRecords.length > 0) {
        const errorMsg = `Batch ${i} tiene ${invalidRecords.length} registros inválidos (producto_id null o gasto_total NaN)`;
        console.error(`[Calculate] ${errorMsg}`);
        erroresInsercion.push(errorMsg);
      }

      const { error, data: insertedData } = await supabase
        .from('analisis_producto')
        .insert(batch)
        .select('id');

      if (error) {
        const errorMsg = `Error insertando batch ${i}-${i + batch.length}: ${error.message} (code: ${error.code}, details: ${error.details || 'none'})`;
        console.error(`[Calculate] ${errorMsg}`);
        erroresInsercion.push(errorMsg);

        // Try to identify problematic records by inserting one by one
        if (batch.length <= 50) {
          console.log(`[Calculate] Intentando inserción individual para identificar registro problemático...`);
          for (let j = 0; j < batch.length; j++) {
            const singleResult = await supabase.from('analisis_producto').insert(batch[j]).select('id');
            if (singleResult.error) {
              erroresInsercion.push(`  -> Registro ${i + j} (producto_id=${batch[j].producto_id}) falló: ${singleResult.error.message}`);
            } else {
              insertados += 1;
              if (batch[j].en_perdida) {
                productosEnPerdida++;
                perdidaTotal += batch[j].resultado;
              } else {
                beneficioTotal += batch[j].resultado;
              }
            }
          }
        }
      } else {
        const count = insertedData?.length || batch.length;
        insertados += count;
        batch.forEach((a) => {
          if (a.en_perdida) {
            productosEnPerdida++;
            perdidaTotal += a.resultado;
          } else {
            beneficioTotal += a.resultado;
          }
        });
        console.log(`[Calculate] Batch ${i}-${i + batch.length} insertado exitosamente (${count} registros)`);
      }
    }

    console.log(`[Calculate] Análisis insertados: ${insertados}/${analisisData.length}`);
    if (erroresInsercion.length > 0) {
      console.log(`[Calculate] Errores de inserción: ${erroresInsercion.length}`);
    }

    // 7. Refrescar vistas materializadas
    try {
      await supabase.rpc('refresh_materialized_views');
    } catch {
      console.log('No se pudieron refrescar las vistas materializadas');
    }

    return NextResponse.json({
      success: erroresInsercion.length === 0,
      periodo,
      productos_analizados: insertados,
      productos_perdida: productosEnPerdida,
      productos_beneficio: insertados - productosEnPerdida,
      perdida_total: perdidaTotal,
      beneficio_total: beneficioTotal,
      resultado_total: beneficioTotal + perdidaTotal,
      pct_en_perdida: insertados > 0 ? ((productosEnPerdida / insertados) * 100).toFixed(2) + '%' : '0%',
      totales: {
        total_facturacion: totales.total_facturacion,
        total_volumen_m3: totales.total_volumen_m3,
        total_stock_valorizado: totales.total_stock_valorizado,
        total_margen_bruto: totales.total_margen_bruto,
      },
      metricas_encontradas: metricas.length,
      errores: erroresInsercion.length > 0 ? erroresInsercion : undefined,
    });
  } catch (error) {
    console.error('Error en cálculo:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

// GET para obtener el estado del cálculo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodo: string }> }
) {
  try {
    const { periodo } = await params;
    const supabase = createAdminClient();

    // Verificar si existe análisis para el período
    const { count: countAnalisis } = await supabase
      .from('analisis_producto')
      .select('*', { count: 'exact', head: true })
      .eq('periodo', periodo);

    const { count: countMetricas } = await supabase
      .from('metricas_producto')
      .select('*', { count: 'exact', head: true })
      .eq('periodo', periodo);

    const { data: gastos } = await supabase
      .from('gastos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .single();

    return NextResponse.json({
      periodo,
      tiene_ventas: (countMetricas || 0) > 0,
      tiene_gastos: !!gastos,
      tiene_analisis: (countAnalisis || 0) > 0,
      productos_cargados: countMetricas || 0,
      productos_analizados: countAnalisis || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error verificando estado', details: String(error) },
      { status: 500 }
    );
  }
}

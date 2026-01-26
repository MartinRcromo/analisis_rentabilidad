import { NextRequest, NextResponse } from 'next/server';
import { parseGastosExcel, calcularGastosFinales } from '@/lib/parsers/parseGastos';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const periodoParam = formData.get('periodo') as string;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    if (!periodoParam) {
      return NextResponse.json({ error: 'Debe proporcionar el período' }, { status: 400 });
    }

    // Parsear Excel
    const buffer = await file.arrayBuffer();

    // Obtener clasificación maestra de la BD
    const supabase = createAdminClient();
    const { data: clasificacionesMaestras } = await supabase
      .from('gastos_clasificacion_maestra')
      .select('sector, tipogasto, clasificacion');

    // Convertir a mapa
    const clasificacionMapa: Record<string, string> = {};
    (clasificacionesMaestras || []).forEach((c) => {
      const key = `${c.sector.toLowerCase()}|${c.tipogasto.toLowerCase()}`;
      clasificacionMapa[key] = c.clasificacion || 'SinClasificar';
    });

    const parseResult = await parseGastosExcel(buffer, clasificacionMapa);

    if (!parseResult.success && parseResult.data.length === 0) {
      return NextResponse.json(
        { error: 'Error parseando Excel de gastos', details: parseResult.errors },
        { status: 400 }
      );
    }

    // Calcular gastos finales con distribución proporcional
    const gastosCalculados = calcularGastosFinales(parseResult.clasificados);

    const dbErrors: string[] = [];

    // Eliminar gastos existentes del período (para poder recargar sin duplicados)
    const { error: errDeleteMensuales } = await supabase
      .from('gastos_mensuales')
      .delete()
      .eq('periodo', periodoParam);

    if (errDeleteMensuales) {
      dbErrors.push(`Error eliminando gastos mensuales anteriores: ${errDeleteMensuales.message}`);
    }

    const { error: errDeleteDetalle } = await supabase
      .from('gastos_detalle')
      .delete()
      .eq('periodo', periodoParam);

    if (errDeleteDetalle) {
      dbErrors.push(`Error eliminando detalle de gastos anteriores: ${errDeleteDetalle.message}`);
    }

    // Insertar gastos mensuales (5 grupos)
    const { data: gastoMensual, error: errorGasto } = await supabase
      .from('gastos_mensuales')
      .insert({
        periodo: periodoParam,
        cat1_facturacion_base: gastosCalculados.gastosBase.facturacion,
        cat2_volumen_base: gastosCalculados.gastosBase.ocupacion, // Ahora es Ocupación
        cat3_credito_base: gastosCalculados.gastosBase.credito,
        cat4_rentabilidad_base: gastosCalculados.gastosBase.rentabilidad,
        cat5_movimiento_base: gastosCalculados.gastosBase.movimiento, // Nuevo
        total_clasificado: gastosCalculados.totalClasificado,
        total_sin_clasificar: gastosCalculados.totalSinClasificar,
        total_general: gastosCalculados.totalGeneral,
        peso_facturacion: gastosCalculados.pesos.facturacion,
        peso_volumen: gastosCalculados.pesos.ocupacion, // Ahora es Ocupación
        peso_credito: gastosCalculados.pesos.credito,
        peso_rentabilidad: gastosCalculados.pesos.rentabilidad,
        peso_movimiento: gastosCalculados.pesos.movimiento, // Nuevo
        cat1_facturacion_final: gastosCalculados.gastosFinales.facturacion,
        cat2_volumen_final: gastosCalculados.gastosFinales.ocupacion, // Ahora es Ocupación
        cat3_credito_final: gastosCalculados.gastosFinales.credito,
        cat4_rentabilidad_final: gastosCalculados.gastosFinales.rentabilidad,
        cat5_movimiento_final: gastosCalculados.gastosFinales.movimiento, // Nuevo
      })
      .select()
      .single();

    if (errorGasto) {
      console.error('Error insertando gastos mensuales:', errorGasto);
      dbErrors.push(`Error insertando gastos mensuales: ${errorGasto.message}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Error guardando gastos mensuales',
          dbErrors,
          parseErrors: parseResult.errors.slice(0, 10),
          periodo: periodoParam,
        },
        { status: 500 }
      );
    }

    // Insertar detalle de gastos en lotes
    const detallesData = parseResult.data.map((g) => ({
      gastos_mensuales_id: gastoMensual.id,
      periodo: periodoParam,
      gerencia: g.gerencia,
      sector: g.sector,
      tipogasto: g.tipogasto,
      proveedorgasto: g.proveedorgasto,
      comprobante: g.comprobante,
      idcomprobante: g.idcomprobante || null,
      empresa: g.empresa,
      empresatipo: g.empresatipo,
      importe_gasto: g.importe_gasto,
      clasificacion: g.Clasificacion,
      se_analiza: true,
    }));

    const batchSize = 500;
    let detallesInsertados = 0;
    for (let i = 0; i < detallesData.length; i += batchSize) {
      const batch = detallesData.slice(i, i + batchSize);
      const { error: errBatch } = await supabase.from('gastos_detalle').insert(batch);
      if (errBatch) {
        dbErrors.push(`Error insertando detalle de gastos (lote ${i}): ${errBatch.message}`);
        console.error('Error insertando detalle de gastos:', errBatch);
      } else {
        detallesInsertados += batch.length;
      }
    }

    // Si hay errores de BD, devolverlos
    if (dbErrors.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Hubo errores al guardar gastos en la base de datos',
        dbErrors,
        parseErrors: parseResult.errors.slice(0, 10),
        periodo: periodoParam,
        gastos_parseados: parseResult.data.length,
        gastos_guardados: detallesInsertados,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      periodo: periodoParam,
      gastos_cargados: detallesInsertados,
      total_gastos: gastosCalculados.totalGeneral,
      distribucion: {
        base: {
          facturacion: gastosCalculados.gastosBase.facturacion,
          ocupacion: gastosCalculados.gastosBase.ocupacion,
          movimiento: gastosCalculados.gastosBase.movimiento,
          credito: gastosCalculados.gastosBase.credito,
          rentabilidad: gastosCalculados.gastosBase.rentabilidad,
          sin_clasificar: gastosCalculados.gastosBase.sinClasificar,
        },
        pesos: {
          facturacion: (gastosCalculados.pesos.facturacion * 100).toFixed(2) + '%',
          ocupacion: (gastosCalculados.pesos.ocupacion * 100).toFixed(2) + '%',
          movimiento: (gastosCalculados.pesos.movimiento * 100).toFixed(2) + '%',
          credito: (gastosCalculados.pesos.credito * 100).toFixed(2) + '%',
          rentabilidad: (gastosCalculados.pesos.rentabilidad * 100).toFixed(2) + '%',
        },
        final: {
          facturacion: gastosCalculados.gastosFinales.facturacion,
          ocupacion: gastosCalculados.gastosFinales.ocupacion,
          movimiento: gastosCalculados.gastosFinales.movimiento,
          credito: gastosCalculados.gastosFinales.credito,
          rentabilidad: gastosCalculados.gastosFinales.rentabilidad,
        },
      },
      warnings: parseResult.errors.length > 0 ? parseResult.errors.slice(0, 10) : [],
    });
  } catch (error) {
    console.error('Error en upload gastos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}

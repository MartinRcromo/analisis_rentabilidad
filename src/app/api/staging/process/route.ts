import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { periodo } = body;

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

    // 1. Verificar estado de staging
    const { data: estadoStaging, error: errorEstado } = await supabase
      .rpc('verificar_staging');

    if (errorEstado) {
      console.error('Error verificando staging:', errorEstado);
      results.errors.push(`Error verificando staging: ${errorEstado.message}`);
    } else {
      console.log('Estado staging:', estadoStaging);
    }

    // 2. Procesar ventas
    console.log('Procesando ventas staging...');
    const { data: ventasResult, error: ventasError } = await supabase
      .rpc('procesar_ventas_staging', { p_periodo: periodo });

    if (ventasError) {
      console.error('Error procesando ventas:', ventasError);
      results.errors.push(`Error procesando ventas: ${ventasError.message}`);
    } else {
      results.ventas = ventasResult?.[0] || ventasResult;
      console.log('Ventas procesadas:', results.ventas);
    }

    // 3. Procesar gastos
    console.log('Procesando gastos staging...');
    const { data: gastosResult, error: gastosError } = await supabase
      .rpc('procesar_gastos_staging', { p_periodo: periodo });

    if (gastosError) {
      console.error('Error procesando gastos:', gastosError);
      results.errors.push(`Error procesando gastos: ${gastosError.message}`);
    } else {
      results.gastos = gastosResult?.[0] || gastosResult;
      console.log('Gastos procesados:', results.gastos);
    }

    // 4. Verificar resultados
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

export async function GET() {
  try {
    // Verificar estado de staging
    const { data: estadoStaging, error } = await supabase
      .rpc('verificar_staging');

    if (error) {
      // Si la función no existe, consultar directamente
      const { count: ventasCount } = await supabase
        .from('ventas_staging')
        .select('*', { count: 'exact', head: true })
        .eq('procesado', false);

      const { count: gastosCount } = await supabase
        .from('gastos_staging')
        .select('*', { count: 'exact', head: true })
        .eq('procesado', false);

      return NextResponse.json({
        success: true,
        staging: {
          ventas_pendientes: ventasCount || 0,
          gastos_pendientes: gastosCount || 0
        },
        nota: 'Ejecutá el script procesar_staging.sql en Supabase para crear las funciones'
      });
    }

    return NextResponse.json({
      success: true,
      staging: estadoStaging
    });

  } catch (error) {
    console.error('Error verificando staging:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

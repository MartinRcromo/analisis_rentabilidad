'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import {
  Database,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Play,
  Calculator
} from 'lucide-react';

interface StagingStatus {
  tabla: string;
  total_registros: number;
  pendientes: number;
  procesados: number;
}

interface ProcessResult {
  success: boolean;
  periodo: string;
  resultados?: {
    ventas?: {
      subrubros_procesados?: number;
      proveedores_procesados?: number;
      productos_procesados?: number;
      metricas_insertadas?: number;
      metricas_fallidas?: number;
      productos_sin_mapeo?: number;
      registros_leidos?: number;
      registros_pendientes?: number;
      mensaje?: string;
      paso_actual?: string;
      errores_detallados?: string[];
    };
    gastos?: {
      gastos_detalle_insertados?: number;
      total_facturacion?: number;
      total_ocupacion?: number;
      total_movimiento?: number;
      total_credito?: number;
      total_rentabilidad?: number;
      total_general?: number;
      registros_leidos?: number;
      mensaje?: string;
    };
    verificacion?: {
      metricas_producto: number;
      gastos_mensuales: string;
    };
  };
  errors?: string[];
  diagnostico?: {
    ventas_paso?: string;
    ventas_metricas_fallidas?: number;
    ventas_productos_sin_mapeo?: number;
  };
  hay_mas_pendientes?: boolean;
  registros_pendientes?: number;
}

interface BatchProgress {
  lote_actual: number;
  registros_procesados: number;
  registros_totales: number;
  metricas_totales: number;
  en_progreso: boolean;
}

interface CalculateResult {
  success: boolean;
  productos_analizados?: number;
  productos_perdida?: number;
  productos_beneficio?: number;
  error?: string;
}

export default function StagingPage() {
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [reprocesar, setReprocesar] = useState(false);
  const [stagingStatus, setStagingStatus] = useState<StagingStatus[] | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [calculateResult, setCalculateResult] = useState<CalculateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  // Función para parsear el período en diferentes formatos
  const parsePeriodo = (input: string): string | null => {
    // Si ya está en formato YYYY-MM, retornar directamente
    if (/^\d{4}-\d{2}$/.test(input)) {
      return input;
    }

    // Intentar parsear formatos localizados (ej: "diciembre de 2025", "December 2025")
    const mesesES: Record<string, string> = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    const mesesEN: Record<string, string> = {
      'january': '01', 'february': '02', 'march': '03', 'april': '04',
      'may': '05', 'june': '06', 'july': '07', 'august': '08',
      'september': '09', 'october': '10', 'november': '11', 'december': '12'
    };

    const normalized = input.toLowerCase().trim();

    // Buscar año (4 dígitos)
    const yearMatch = normalized.match(/\d{4}/);
    if (!yearMatch) return null;
    const year = yearMatch[0];

    // Buscar mes en español
    for (const [mes, num] of Object.entries(mesesES)) {
      if (normalized.includes(mes)) {
        return `${year}-${num}`;
      }
    }

    // Buscar mes en inglés
    for (const [mes, num] of Object.entries(mesesEN)) {
      if (normalized.includes(mes)) {
        return `${year}-${num}`;
      }
    }

    return null;
  };

  const checkStatus = async () => {
    setCheckingStatus(true);
    setError(null);

    try {
      const response = await fetch('/api/staging/process');
      const data = await response.json();

      if (data.staging) {
        if (Array.isArray(data.staging)) {
          setStagingStatus(data.staging);
        } else {
          // Formato alternativo cuando las funciones no existen
          setStagingStatus([
            { tabla: 'ventas_staging', total_registros: data.staging.ventas_pendientes || 0, pendientes: data.staging.ventas_pendientes || 0, procesados: 0 },
            { tabla: 'gastos_staging', total_registros: data.staging.gastos_pendientes || 0, pendientes: data.staging.gastos_pendientes || 0, procesados: 0 }
          ]);
        }
      }
    } catch (err) {
      setError(`Error verificando staging: ${err}`);
    } finally {
      setCheckingStatus(false);
    }
  };

  const processStaging = async () => {
    if (!periodo) {
      setError('Seleccione un período');
      return;
    }

    const parsedPeriodo = parsePeriodo(periodo);
    if (!parsedPeriodo) {
      setError('Formato de período inválido. Use el selector de mes o ingrese en formato AAAA-MM (ej: 2025-12)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setBatchProgress({
      lote_actual: 0,
      registros_procesados: 0,
      registros_totales: stagingStatus?.find(s => s.tabla === 'ventas_staging')?.total_registros || 0,
      metricas_totales: 0,
      en_progreso: true,
    });

    const formattedPeriodo = `${parsedPeriodo}-01`;
    let loteActual = 0;
    let totalProcesados = 0;
    let totalMetricas = 0;
    let hayMasPendientes = true;
    let ultimoResultado: ProcessResult | null = null;
    let esReprocesar = reprocesar;

    try {
      // Procesar en lotes hasta que no haya más pendientes
      while (hayMasPendientes) {
        loteActual++;

        setBatchProgress(prev => prev ? {
          ...prev,
          lote_actual: loteActual,
          en_progreso: true,
        } : null);

        const response = await fetch('/api/staging/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            periodo: formattedPeriodo,
            reprocesar: esReprocesar // Solo reprocesar en el primer lote
          }),
        });

        // Después del primer lote, ya no reprocesamos
        esReprocesar = false;

        const text = await response.text();

        // Verificar si la respuesta es JSON válido
        let data: ProcessResult;
        try {
          data = JSON.parse(text);
        } catch {
          // Si no es JSON, probablemente es un error de timeout
          throw new Error(`Timeout o error del servidor. Respuesta: ${text.substring(0, 200)}`);
        }

        ultimoResultado = data;

        // Acumular resultados
        const registrosLote = data.resultados?.ventas?.registros_leidos || 0;
        const metricasLote = data.resultados?.ventas?.metricas_insertadas || 0;
        totalProcesados += registrosLote;
        totalMetricas += metricasLote;

        setBatchProgress(prev => prev ? {
          ...prev,
          registros_procesados: totalProcesados,
          metricas_totales: totalMetricas,
        } : null);

        // Verificar si hay más pendientes
        hayMasPendientes = data.hay_mas_pendientes === true && (data.registros_pendientes || 0) > 0;

        // Si hubo errores graves, detener
        if (data.errors && data.errors.length > 0) {
          // Mostrar errores pero continuar si hay más pendientes
          console.warn('Errores en lote:', data.errors);
        }

        // Pequeña pausa entre lotes para no saturar
        if (hayMasPendientes) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Actualizar resultado final
      if (ultimoResultado) {
        // Modificar para mostrar totales acumulados
        if (ultimoResultado.resultados?.ventas) {
          ultimoResultado.resultados.ventas.registros_leidos = totalProcesados;
          ultimoResultado.resultados.ventas.metricas_insertadas = totalMetricas;
        }
        setResult(ultimoResultado);

        if (!ultimoResultado.success && ultimoResultado.errors) {
          setError(ultimoResultado.errors.join('\n'));
        }
      }

      // Actualizar status después de procesar
      await checkStatus();

    } catch (err) {
      setError(`Error procesando lote ${loteActual}: ${err}`);
    } finally {
      setLoading(false);
      setBatchProgress(prev => prev ? { ...prev, en_progreso: false } : null);
    }
  };

  const runCalculation = async () => {
    if (!result?.periodo) {
      setError('Primero debe procesar los datos staging');
      return;
    }

    setCalculating(true);
    setError(null);
    setCalculateResult(null);

    try {
      const response = await fetch(`/api/calculate/${result.periodo}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setCalculateResult({
          success: true,
          productos_analizados: data.productos_analizados,
          productos_perdida: data.productos_perdida,
          productos_beneficio: data.productos_beneficio,
        });
      } else {
        setCalculateResult({
          success: false,
          error: data.error || 'Error ejecutando cálculo',
        });
      }
    } catch (err) {
      setCalculateResult({
        success: false,
        error: `Error: ${err}`,
      });
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return '-';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <Database className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Procesar Datos Staging</h1>
            <p className="text-gray-500">
              Procesa los datos cargados en ventas_staging y gastos_staging
            </p>
          </div>
        </div>

        {/* Estado de las tablas staging */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Estado de Tablas Staging</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={checkStatus}
                disabled={checkingStatus}
              >
                {checkingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Actualizar</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {stagingStatus ? (
              <div className="grid gap-4 md:grid-cols-2">
                {stagingStatus.map((tabla) => (
                  <div
                    key={tabla.tabla}
                    className={`rounded-lg border p-4 ${
                      tabla.pendientes > 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <h4 className="font-medium">{tabla.tabla}</h4>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Total:</span>
                        <span className="ml-1 font-semibold">{tabla.total_registros}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Pendientes:</span>
                        <span className={`ml-1 font-semibold ${tabla.pendientes > 0 ? 'text-blue-600' : ''}`}>
                          {tabla.pendientes}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Procesados:</span>
                        <span className="ml-1 font-semibold text-green-600">{tabla.procesados}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">
                Haga clic en &quot;Actualizar&quot; para ver el estado de las tablas staging
              </p>
            )}
          </CardContent>
        </Card>

        {/* Formulario de procesamiento */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Ejecutar Procesamiento</CardTitle>
            <CardDescription>
              Seleccione el período y ejecute el procesamiento de los datos staging
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="periodo">Período (AAAA-MM)</Label>
                  <Input
                    id="periodo"
                    type="month"
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    placeholder="2024-12"
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={processStaging}
                  disabled={loading || !periodo}
                  className="min-w-[200px]"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Procesar Staging
                  </>
                )}
                </Button>
              </div>

              {/* Checkbox reprocesar */}
              <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-3 border border-yellow-200">
                <input
                  type="checkbox"
                  id="reprocesar"
                  checked={reprocesar}
                  onChange={(e) => setReprocesar(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="reprocesar" className="text-sm text-yellow-800 cursor-pointer">
                  <strong>Reprocesar:</strong> Resetear registros ya procesados y volver a procesar todos (usar si los datos ya fueron procesados antes)
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progreso por lotes */}
        {batchProgress && batchProgress.en_progreso && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                <CardTitle className="text-blue-800">Procesando por lotes...</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Lote actual:</span>
                  <span className="font-bold text-blue-700">{batchProgress.lote_actual}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Registros procesados:</span>
                  <span className="font-bold text-blue-700">
                    {batchProgress.registros_procesados.toLocaleString()} / {batchProgress.registros_totales.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Métricas insertadas:</span>
                  <span className="font-bold text-green-600">{batchProgress.metricas_totales.toLocaleString()}</span>
                </div>
                {/* Barra de progreso */}
                <div className="w-full bg-blue-200 rounded-full h-4">
                  <div
                    className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                    style={{
                      width: `${batchProgress.registros_totales > 0
                        ? Math.min((batchProgress.registros_procesados / batchProgress.registros_totales) * 100, 100)
                        : 0}%`
                    }}
                  />
                </div>
                <p className="text-xs text-blue-600 text-center">
                  Procesando en lotes de 2000 registros para evitar timeout...
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium text-red-800">Error</p>
                <pre className="mt-1 whitespace-pre-wrap text-sm text-red-700">{error}</pre>
              </div>
            </div>
          </Alert>
        )}

        {/* Diagnóstico detallado */}
        {result && (result.diagnostico || result.errors) && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-6 w-6 text-orange-500" />
                <CardTitle className="text-orange-800">Diagnóstico del Procesamiento</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {result.diagnostico && (
                <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
                  <div className="rounded bg-white p-2">
                    <span className="text-gray-500">Paso actual:</span>
                    <span className="ml-2 font-medium">{result.diagnostico.ventas_paso || 'N/A'}</span>
                  </div>
                  <div className="rounded bg-white p-2">
                    <span className="text-gray-500">Métricas fallidas:</span>
                    <span className={`ml-2 font-medium ${(result.diagnostico.ventas_metricas_fallidas || 0) > 0 ? 'text-red-600' : ''}`}>
                      {result.diagnostico.ventas_metricas_fallidas || 0}
                    </span>
                  </div>
                  <div className="rounded bg-white p-2">
                    <span className="text-gray-500">Productos sin mapeo:</span>
                    <span className={`ml-2 font-medium ${(result.diagnostico.ventas_productos_sin_mapeo || 0) > 0 ? 'text-orange-600' : ''}`}>
                      {result.diagnostico.ventas_productos_sin_mapeo || 0}
                    </span>
                  </div>
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="rounded bg-white p-3">
                  <p className="mb-2 font-medium text-red-800">Errores detallados ({result.errors.length}):</p>
                  <div className="max-h-60 overflow-y-auto">
                    <ul className="space-y-1 text-xs text-red-700 font-mono">
                      {result.errors.map((err, idx) => (
                        <li key={idx} className="border-b border-red-100 pb-1">
                          {idx + 1}. {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {result.resultados?.ventas?.errores_detallados && result.resultados.ventas.errores_detallados.length > 0 && (
                <div className="mt-4 rounded bg-white p-3">
                  <p className="mb-2 font-medium text-orange-800">Errores de ventas ({result.resultados.ventas.errores_detallados.length}):</p>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="space-y-1 text-xs text-orange-700 font-mono">
                      {result.resultados.ventas.errores_detallados.map((err, idx) => (
                        <li key={idx} className="border-b border-orange-100 pb-1">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Resultado */}
        {result && result.success && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <CardTitle className="text-green-800">Procesamiento Exitoso</CardTitle>
              </div>
              <CardDescription className="text-green-600">
                Período: {result.periodo}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Ventas */}
                {result.resultados?.ventas && (
                  <div className="rounded-lg bg-white p-4">
                    <h4 className="mb-3 font-semibold text-gray-800">Ventas Procesadas</h4>
                    {result.resultados.ventas.mensaje && (
                      <p className="mb-2 text-sm text-yellow-600">{result.resultados.ventas.mensaje}</p>
                    )}
                    <ul className="space-y-1 text-sm">
                      <li className="flex justify-between">
                        <span className="text-gray-600">Registros leídos:</span>
                        <span className="font-medium text-blue-600">{result.resultados.ventas.registros_leidos || 0}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Subrubros:</span>
                        <span className="font-medium">{result.resultados.ventas.subrubros_procesados || 0}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Proveedores:</span>
                        <span className="font-medium">{result.resultados.ventas.proveedores_procesados || 0}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Productos:</span>
                        <span className="font-medium">{result.resultados.ventas.productos_procesados || 0}</span>
                      </li>
                      <li className="flex justify-between border-t pt-1">
                        <span className="text-gray-600">Métricas insertadas:</span>
                        <span className="font-semibold text-blue-600">
                          {result.resultados.ventas.metricas_insertadas || 0}
                        </span>
                      </li>
                      {(result.resultados.ventas.metricas_fallidas || 0) > 0 && (
                        <li className="flex justify-between text-red-600">
                          <span>Métricas fallidas:</span>
                          <span className="font-semibold">{result.resultados.ventas.metricas_fallidas}</span>
                        </li>
                      )}
                      {(result.resultados.ventas.productos_sin_mapeo || 0) > 0 && (
                        <li className="flex justify-between text-orange-600">
                          <span>Productos sin mapeo:</span>
                          <span className="font-semibold">{result.resultados.ventas.productos_sin_mapeo}</span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Gastos */}
                {result.resultados?.gastos && (
                  <div className="rounded-lg bg-white p-4">
                    <h4 className="mb-3 font-semibold text-gray-800">Gastos Procesados</h4>
                    <ul className="space-y-1 text-sm">
                      <li className="flex justify-between">
                        <span className="text-gray-600">Detalle insertados:</span>
                        <span className="font-medium">{result.resultados.gastos.gastos_detalle_insertados || 0}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Facturación:</span>
                        <span className="font-medium">{formatCurrency(result.resultados.gastos.total_facturacion)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Ocupación:</span>
                        <span className="font-medium">{formatCurrency(result.resultados.gastos.total_ocupacion)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Movimiento:</span>
                        <span className="font-medium">{formatCurrency(result.resultados.gastos.total_movimiento)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Crédito:</span>
                        <span className="font-medium">{formatCurrency(result.resultados.gastos.total_credito)}</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-gray-600">Rentabilidad:</span>
                        <span className="font-medium">{formatCurrency(result.resultados.gastos.total_rentabilidad)}</span>
                      </li>
                      <li className="flex justify-between border-t pt-1">
                        <span className="text-gray-600">Total General:</span>
                        <span className="font-semibold text-blue-600">
                          {formatCurrency(result.resultados.gastos.total_general)}
                        </span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Verificación */}
              {result.resultados?.verificacion && (
                <div className="mt-4 rounded-lg bg-white p-4">
                  <h4 className="mb-2 font-semibold text-gray-800">Verificación</h4>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-gray-600">metricas_producto:</span>
                      <span className="ml-2 font-medium">{result.resultados.verificacion.metricas_producto} registros</span>
                    </div>
                    <div>
                      <span className="text-gray-600">gastos_mensuales:</span>
                      <span className={`ml-2 font-medium ${
                        result.resultados.verificacion.gastos_mensuales === 'OK' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {result.resultados.verificacion.gastos_mensuales}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Botón para ejecutar cálculo */}
              <div className="mt-6 flex flex-col gap-4">
                <Button
                  onClick={runCalculation}
                  disabled={calculating}
                  className="w-full"
                  size="lg"
                >
                  {calculating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Calculando...
                    </>
                  ) : (
                    <>
                      <Calculator className="mr-2 h-5 w-5" />
                      Ejecutar Cálculo de Resultados
                    </>
                  )}
                </Button>

                {/* Resultado del cálculo */}
                {calculateResult && (
                  <div className={`rounded-lg p-4 ${calculateResult.success ? 'bg-green-100' : 'bg-red-100'}`}>
                    {calculateResult.success ? (
                      <div className="text-green-800">
                        <p className="font-semibold">Cálculo completado</p>
                        <ul className="mt-2 text-sm">
                          <li>Productos analizados: {calculateResult.productos_analizados}</li>
                          <li>En beneficio: <span className="text-green-600 font-medium">{calculateResult.productos_beneficio}</span></li>
                          <li>En pérdida: <span className="text-red-600 font-medium">{calculateResult.productos_perdida}</span></li>
                        </ul>
                      </div>
                    ) : (
                      <p className="text-red-800">{calculateResult.error}</p>
                    )}
                  </div>
                )}

                <Button variant="outline" asChild>
                  <a href="/dashboard">Ver Dashboard</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instrucciones */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Instrucciones</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            <ol className="list-inside list-decimal space-y-2">
              <li>
                <strong>Cargar datos en Supabase:</strong> Importá tus archivos CSV/Excel directamente
                en las tablas <code className="rounded bg-gray-100 px-1">ventas_staging</code> y{' '}
                <code className="rounded bg-gray-100 px-1">gastos_staging</code>
              </li>
              <li>
                <strong>Verificar estado:</strong> Hacé clic en &quot;Actualizar&quot; para ver cuántos
                registros hay pendientes de procesar
              </li>
              <li>
                <strong>Seleccionar período:</strong> Elegí el mes y año correspondiente a los datos (ej: 2024-12)
              </li>
              <li>
                <strong>Procesar:</strong> Hacé clic en &quot;Procesar Staging&quot; para mover los datos
                a las tablas finales
              </li>
              <li>
                <strong>Ejecutar cálculo:</strong> Una vez procesados ventas y gastos, ejecutá el cálculo
                de resultados para generar el análisis de rentabilidad
              </li>
            </ol>

            <div className="mt-4 rounded-lg bg-yellow-50 p-3">
              <p className="font-medium text-yellow-800">Nota importante:</p>
              <p className="mt-1 text-yellow-700">
                Antes de usar esta página, asegurate de ejecutar el script{' '}
                <code className="rounded bg-yellow-100 px-1">supabase/procesar_staging.sql</code>{' '}
                en Supabase SQL Editor para crear las funciones necesarias.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

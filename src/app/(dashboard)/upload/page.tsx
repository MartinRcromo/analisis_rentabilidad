'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type UploadStep = 'periodo' | 'ventas' | 'gastos' | 'calculate' | 'complete';

interface UploadResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>('periodo');
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    ventas?: UploadResult;
    gastos?: UploadResult;
    calculate?: UploadResult;
  }>({});

  const handlePeriodoSubmit = () => {
    if (!periodo) return;
    // Formatear período a YYYY-MM-DD
    const formattedPeriodo = `${periodo}-01`;
    setPeriodo(formattedPeriodo);
    setStep('ventas');
  };

  const uploadVentas = useCallback(
    async (file: File) => {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('periodo', periodo);

      try {
        const response = await fetch('/api/upload/ventas', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          setResults((prev) => ({
            ...prev,
            ventas: {
              success: true,
              message: `Cargados ${data.productos_cargados} productos`,
              details: data,
            },
          }));
          setStep('gastos');
        } else {
          setResults((prev) => ({
            ...prev,
            ventas: { success: false, message: data.error, details: data },
          }));
        }
      } catch (error) {
        setResults((prev) => ({
          ...prev,
          ventas: { success: false, message: String(error) },
        }));
      } finally {
        setLoading(false);
      }
    },
    [periodo]
  );

  const uploadGastos = useCallback(
    async (file: File) => {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('periodo', periodo);

      try {
        const response = await fetch('/api/upload/gastos', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          setResults((prev) => ({
            ...prev,
            gastos: {
              success: true,
              message: `Cargados ${data.gastos_cargados} gastos`,
              details: data,
            },
          }));
          setStep('calculate');
        } else {
          setResults((prev) => ({
            ...prev,
            gastos: { success: false, message: data.error, details: data },
          }));
        }
      } catch (error) {
        setResults((prev) => ({
          ...prev,
          gastos: { success: false, message: String(error) },
        }));
      } finally {
        setLoading(false);
      }
    },
    [periodo]
  );

  const runCalculation = async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/calculate/${periodo}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setResults((prev) => ({
          ...prev,
          calculate: {
            success: true,
            message: `Analizados ${data.productos_analizados} productos`,
            details: data,
          },
        }));
        setStep('complete');
      } else {
        setResults((prev) => ({
          ...prev,
          calculate: { success: false, message: data.error, details: data },
        }));
      }
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        calculate: { success: false, message: String(error) },
      }));
    } finally {
      setLoading(false);
    }
  };

  const resetProcess = () => {
    setStep('periodo');
    setPeriodo('');
    setResults({});
  };

  const progress = {
    periodo: 0,
    ventas: 25,
    gastos: 50,
    calculate: 75,
    complete: 100,
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold">Cargar Datos Mensuales</h1>
        <p className="mb-6 text-gray-500">
          Siga los pasos para cargar las ventas y gastos del período.
        </p>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="mb-2 flex justify-between text-sm">
            <span>Progreso</span>
            <span>{progress[step]}%</span>
          </div>
          <Progress value={progress[step]} />
        </div>

        {/* Step 1: Período */}
        {step === 'periodo' && (
          <Card>
            <CardHeader>
              <CardTitle>Paso 1: Seleccionar Período</CardTitle>
              <CardDescription>Ingrese el mes y año a procesar</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="periodo">Período (AAAA-MM)</Label>
                  <Input
                    id="periodo"
                    type="month"
                    value={periodo.slice(0, 7)}
                    onChange={(e) => setPeriodo(e.target.value)}
                    placeholder="2025-12"
                  />
                </div>
                <Button onClick={handlePeriodoSubmit} disabled={!periodo}>
                  Continuar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Ventas */}
        {step === 'ventas' && (
          <Card>
            <CardHeader>
              <CardTitle>Paso 2: Cargar Ventas</CardTitle>
              <CardDescription>
                Suba el archivo Excel con los datos de ventas del período {periodo.slice(0, 7)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileDropzone
                onDrop={(files) => files[0] && uploadVentas(files[0])}
                loading={loading}
                accept=".xlsx,.xls"
              />
              {results.ventas && (
                <ResultAlert result={results.ventas} className="mt-4" />
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Gastos */}
        {step === 'gastos' && (
          <Card>
            <CardHeader>
              <CardTitle>Paso 3: Cargar Gastos</CardTitle>
              <CardDescription>
                Suba el archivo Excel con los gastos del período {periodo.slice(0, 7)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileDropzone
                onDrop={(files) => files[0] && uploadGastos(files[0])}
                loading={loading}
                accept=".xlsx,.xls"
              />
              {results.gastos && (
                <ResultAlert result={results.gastos} className="mt-4" />
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Calculate */}
        {step === 'calculate' && (
          <Card>
            <CardHeader>
              <CardTitle>Paso 4: Calcular Resultados</CardTitle>
              <CardDescription>
                Ejecutar el cálculo de rentabilidad para todos los productos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-4">
                  <h4 className="font-medium">Resumen de datos cargados:</h4>
                  <ul className="mt-2 space-y-1 text-sm text-gray-600">
                    <li>Período: {periodo.slice(0, 7)}</li>
                    <li>
                      Productos:{' '}
                      {(results.ventas?.details as { productos_cargados?: number })?.productos_cargados || 0}
                    </li>
                    <li>
                      Total Ventas: $
                      {(
                        ((results.ventas?.details as { total_ventas?: number })?.total_ventas || 0) / 1e6
                      ).toFixed(1)}
                      M
                    </li>
                    <li>
                      Total Gastos: $
                      {(
                        ((results.gastos?.details as { total_gastos?: number })?.total_gastos || 0) / 1e6
                      ).toFixed(1)}
                      M
                    </li>
                  </ul>
                </div>
                <Button onClick={runCalculation} disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Calculando...
                    </>
                  ) : (
                    'Ejecutar Cálculo'
                  )}
                </Button>
                {results.calculate && (
                  <ResultAlert result={results.calculate} />
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Complete */}
        {step === 'complete' && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <div>
                  <h3 className="text-lg font-semibold text-green-800">
                    Proceso completado exitosamente
                  </h3>
                  <p className="text-green-600">
                    Se analizaron{' '}
                    {(results.calculate?.details as { productos_analizados?: number })?.productos_analizados || 0}{' '}
                    productos del período {periodo.slice(0, 7)}.
                  </p>
                  {results.calculate?.details && (
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div className="rounded bg-white p-3">
                        <span className="text-gray-500">En Pérdida:</span>
                        <span className="ml-2 font-semibold text-red-600">
                          {(results.calculate.details as { productos_perdida?: number }).productos_perdida || 0}
                        </span>
                      </div>
                      <div className="rounded bg-white p-3">
                        <span className="text-gray-500">En Beneficio:</span>
                        <span className="ml-2 font-semibold text-green-600">
                          {(results.calculate.details as { productos_beneficio?: number }).productos_beneficio || 0}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 flex gap-4">
                <Button onClick={resetProcess} variant="outline">
                  Cargar otro período
                </Button>
                <Button asChild>
                  <a href="/dashboard">Ver Dashboard</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function FileDropzone({
  onDrop,
  loading,
  accept,
}: {
  onDrop: (files: File[]) => void;
  loading: boolean;
  accept: string;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    disabled: loading,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : loading
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input {...getInputProps()} accept={accept} />
      {loading ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
          <p className="mt-2 text-gray-500">Procesando archivo...</p>
        </>
      ) : (
        <>
          {isDragActive ? (
            <Upload className="h-10 w-10 text-blue-500" />
          ) : (
            <FileSpreadsheet className="h-10 w-10 text-gray-400" />
          )}
          <p className="mt-2 text-center text-gray-500">
            {isDragActive
              ? 'Suelte el archivo aquí'
              : 'Arrastre un archivo Excel aquí, o haga clic para seleccionar'}
          </p>
          <p className="mt-1 text-sm text-gray-400">Solo archivos .xlsx o .xls</p>
        </>
      )}
    </div>
  );
}

function ResultAlert({
  result,
  className = '',
}: {
  result: UploadResult;
  className?: string;
}) {
  return (
    <Alert
      className={`${className} ${result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
    >
      <div className="flex items-center gap-2">
        {result.success ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-500" />
        )}
        <span className={result.success ? 'text-green-700' : 'text-red-700'}>
          {result.message}
        </span>
      </div>
    </Alert>
  );
}

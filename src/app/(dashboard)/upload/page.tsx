'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Search } from 'lucide-react';

type UploadStep = 'periodo' | 'ventas' | 'gastos' | 'calculate' | 'complete';

interface ValidacionResult {
  valido: boolean;
  hojas: string[];
  hoja_usada: string;
  total_filas: number;
  columnas_encontradas: string[];
  columnas_requeridas: string[];
  columnas_faltantes: string[];
  columnas_extra: string[];
  empresas_encontradas?: Record<string, number>;
  periodos_muestra?: string[];
  muestra?: Record<string, unknown>[];
  errores: string[];
}

interface UploadResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>('periodo');
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState<{
    ventas?: UploadResult;
    gastos?: UploadResult;
    calculate?: UploadResult;
  }>({});
  const [validaciones, setValidaciones] = useState<{
    ventas?: ValidacionResult;
    gastos?: ValidacionResult;
  }>({});

  const handlePeriodoSubmit = () => {
    if (!periodo) return;
    // Formatear período a YYYY-MM-DD
    const formattedPeriodo = `${periodo}-01`;
    setPeriodo(formattedPeriodo);
    setStep('ventas');
  };

  const validarArchivo = useCallback(async (file: File, tipo: 'ventas' | 'gastos') => {
    setValidating(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tipo', tipo);

    try {
      const response = await fetch('/api/validate', { method: 'POST', body: formData });
      const data: ValidacionResult = await response.json();
      setValidaciones((prev) => ({ ...prev, [tipo]: data }));
    } catch (error) {
      setValidaciones((prev) => ({
        ...prev,
        [tipo]: {
          valido: false,
          hojas: [],
          hoja_usada: '',
          total_filas: 0,
          columnas_encontradas: [],
          columnas_requeridas: [],
          columnas_faltantes: [],
          columnas_extra: [],
          errores: [String(error)],
        },
      }));
    } finally {
      setValidating(false);
    }
  }, []);

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
            <CardContent className="space-y-4">
              <FileDropzoneWithValidation
                onDrop={(files) => {
                  if (files[0]) {
                    setValidaciones((prev) => ({ ...prev, ventas: undefined }));
                    setResults((prev) => ({ ...prev, ventas: undefined }));
                  }
                }}
                onValidate={(files) => files[0] && validarArchivo(files[0], 'ventas')}
                onUpload={(files) => files[0] && uploadVentas(files[0])}
                loading={loading}
                validating={validating}
                accept=".xlsx,.xls"
              />
              {validaciones.ventas && (
                <ValidacionPanel resultado={validaciones.ventas} />
              )}
              {results.ventas && (
                <ResultAlert result={results.ventas} className="mt-2" />
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
            <CardContent className="space-y-4">
              <FileDropzoneWithValidation
                onDrop={(files) => {
                  if (files[0]) {
                    setValidaciones((prev) => ({ ...prev, gastos: undefined }));
                    setResults((prev) => ({ ...prev, gastos: undefined }));
                  }
                }}
                onValidate={(files) => files[0] && validarArchivo(files[0], 'gastos')}
                onUpload={(files) => files[0] && uploadGastos(files[0])}
                loading={loading}
                validating={validating}
                accept=".xlsx,.xls"
              />
              {validaciones.gastos && (
                <ValidacionPanel resultado={validaciones.gastos} />
              )}
              {results.gastos && (
                <ResultAlert result={results.gastos} className="mt-2" />
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

function FileDropzoneWithValidation({
  onDrop,
  onValidate,
  onUpload,
  loading,
  validating,
  accept,
}: {
  onDrop: (files: File[]) => void;
  onValidate: (files: File[]) => void;
  onUpload: (files: File[]) => void;
  loading: boolean;
  validating: boolean;
  accept: string;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (files[0]) {
        setSelectedFile(files[0]);
        onDrop(files);
      }
    },
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    disabled: loading || validating,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : loading || validating
              ? 'border-gray-200 bg-gray-50'
              : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} accept={accept} />
        {loading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <p className="mt-2 text-gray-500">Subiendo archivo...</p>
          </>
        ) : validating ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <p className="mt-2 text-blue-500">Validando formato...</p>
          </>
        ) : (
          <>
            {isDragActive ? (
              <Upload className="h-8 w-8 text-blue-500" />
            ) : (
              <FileSpreadsheet className="h-8 w-8 text-gray-400" />
            )}
            <p className="mt-2 text-center text-gray-500">
              {selectedFile
                ? `Archivo: ${selectedFile.name}`
                : isDragActive
                  ? 'Suelte el archivo aquí'
                  : 'Arrastre un archivo Excel aquí, o haga clic para seleccionar'}
            </p>
            <p className="mt-1 text-sm text-gray-400">Solo archivos .xlsx o .xls</p>
          </>
        )}
      </div>

      {selectedFile && !loading && !validating && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => onValidate([selectedFile])}
          >
            <Search className="mr-2 h-4 w-4" />
            Validar formato
          </Button>
          <Button
            className="flex-1"
            onClick={() => onUpload([selectedFile])}
          >
            <Upload className="mr-2 h-4 w-4" />
            Subir archivo
          </Button>
        </div>
      )}
    </div>
  );
}

function ValidacionPanel({ resultado }: { resultado: ValidacionResult }) {
  return (
    <div className={`rounded-lg border p-4 text-sm ${resultado.valido ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className="mb-3 flex items-center gap-2">
        {resultado.valido ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-500" />
        )}
        <span className={`font-semibold ${resultado.valido ? 'text-green-800' : 'text-red-800'}`}>
          {resultado.valido ? 'Formato válido' : 'Formato con problemas'}
        </span>
        <span className="ml-auto text-gray-500">
          {resultado.total_filas.toLocaleString()} filas | Hoja: {resultado.hoja_usada}
        </span>
      </div>

      {/* Columnas faltantes */}
      {resultado.columnas_faltantes.length > 0 && (
        <div className="mb-3">
          <p className="font-medium text-red-700">Columnas FALTANTES (requeridas):</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {resultado.columnas_faltantes.map((col) => (
              <Badge key={col} variant="destructive" className="text-xs">{col}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Columnas encontradas */}
      <div className="mb-3">
        <p className="font-medium text-gray-700">Columnas encontradas en el archivo:</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {resultado.columnas_encontradas.map((col) => {
            const esRequerida = resultado.columnas_requeridas.includes(col.toLowerCase());
            return (
              <Badge
                key={col}
                variant={esRequerida ? 'default' : 'secondary'}
                className="text-xs"
              >
                {col}
              </Badge>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-gray-400">Azul = requerida y encontrada | Gris = extra (no requerida)</p>
      </div>

      {/* Empresas encontradas (solo ventas) */}
      {resultado.empresas_encontradas && Object.keys(resultado.empresas_encontradas).length > 0 && (
        <div className="mb-3">
          <p className="font-medium text-gray-700">Valores de empresa encontrados:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {Object.entries(resultado.empresas_encontradas).map(([emp, count]) => {
              const esValida = ['Cromo', 'BBA'].includes(emp);
              return (
                <span
                  key={emp}
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    esValida ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {emp}: {count} filas {!esValida && '⚠ debe ser "Cromo" o "BBA"'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Períodos encontrados */}
      {resultado.periodos_muestra && resultado.periodos_muestra.length > 0 && (
        <div className="mb-3">
          <p className="font-medium text-gray-700">Períodos encontrados (muestra):</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {resultado.periodos_muestra.map((p) => (
              <span key={p} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Errores */}
      {resultado.errores.length > 0 && (
        <div>
          <p className="font-medium text-red-700">Errores detectados:</p>
          <ul className="mt-1 list-inside list-disc text-red-600">
            {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {resultado.valido && (
        <p className="mt-2 text-green-700">El archivo tiene el formato correcto. Podés subirlo.</p>
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
  const details = result.details as {
    dbErrors?: string[];
    parseErrors?: string[];
    productos_parseados?: number;
    productos_guardados?: number;
    gastos_parseados?: number;
    gastos_guardados?: number;
  } | undefined;

  return (
    <Alert
      className={`${className} ${result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
    >
      <div className="flex flex-col gap-2">
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

        {/* Mostrar detalles de error de BD */}
        {!result.success && details?.dbErrors && details.dbErrors.length > 0 && (
          <div className="mt-2 rounded bg-red-100 p-3 text-sm">
            <p className="font-medium text-red-800">Errores de Base de Datos:</p>
            <ul className="mt-1 list-inside list-disc text-red-700">
              {details.dbErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Mostrar estadísticas parciales */}
        {!result.success && (
          <div className="mt-2 text-sm text-gray-600">
            {details?.productos_parseados !== undefined && (
              <p>Productos parseados: {details.productos_parseados} | Guardados: {details.productos_guardados || 0}</p>
            )}
            {details?.gastos_parseados !== undefined && (
              <p>Gastos parseados: {details.gastos_parseados} | Guardados: {details.gastos_guardados || 0}</p>
            )}
          </div>
        )}

        {/* Mostrar warnings de parseo */}
        {!result.success && details?.parseErrors && details.parseErrors.length > 0 && (
          <div className="mt-2 rounded bg-yellow-100 p-3 text-sm">
            <p className="font-medium text-yellow-800">Advertencias de parseo:</p>
            <ul className="mt-1 list-inside list-disc text-yellow-700">
              {details.parseErrors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {details.parseErrors.length > 5 && (
                <li>... y {details.parseErrors.length - 5} advertencias más</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Alert>
  );
}

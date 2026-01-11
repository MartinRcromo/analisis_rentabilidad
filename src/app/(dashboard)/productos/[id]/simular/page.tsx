'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw, Save, TrendingUp, TrendingDown } from 'lucide-react';

interface SimulacionData {
  actual: {
    markup_pct: number;
    importe_ventas: number;
    margen_bruto: number;
    stock_unidades: number;
    stock_costo: number;
    gasto_total: number;
    resultado: number;
    en_perdida: boolean;
    markup_minimo_pct: number;
  };
  proyectado: {
    nuevo_markup_pct: number;
    nuevas_ventas: number;
    nuevo_margen: number;
    nuevo_stock_unidades: number;
    nuevo_gasto_total: number;
    nuevo_resultado: number;
    en_perdida: boolean;
    nuevo_markup_minimo: number;
    nuevo_precio: number;
  };
  diferencias: {
    ahorro_credito: number;
    ahorro_volumen: number;
    mejora_resultado: number;
    delta_ventas: number;
  };
  resumen: {
    mejora_total: number;
    ahorro_total: number;
    sale_de_perdida: boolean;
    cumple_objetivo: boolean;
  };
}

interface ProductoInfo {
  producto: {
    codigo: string;
    nombre: string;
    empresa: string;
  };
  periodo: string;
  metricas: {
    markup_pct: number;
    stock_unidades: number;
  };
  analisis: {
    resultado: number;
    en_perdida: boolean;
    markup_minimo_pct: number;
  };
}

export default function SimularPage() {
  const params = useParams();
  const router = useRouter();
  const [productoInfo, setProductoInfo] = useState<ProductoInfo | null>(null);
  const [simulacion, setSimulacion] = useState<SimulacionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Controles de simulación
  const [deltaMarkup, setDeltaMarkup] = useState(0);
  const [reduccionStock, setReduccionStock] = useState(0);

  useEffect(() => {
    async function fetchProducto() {
      try {
        const response = await fetch(`/api/productos/${params.id}`);
        if (response.ok) {
          const data = await response.json();
          setProductoInfo(data);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      fetchProducto();
    }
  }, [params.id]);

  useEffect(() => {
    if (productoInfo) {
      runSimulation();
    }
  }, [deltaMarkup, reduccionStock, productoInfo]);

  async function runSimulation() {
    if (!productoInfo) return;

    setSimulating(true);
    try {
      const response = await fetch(`/api/productos/${params.id}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo: productoInfo.periodo,
          delta_markup_pct: deltaMarkup,
          reduccion_stock_pct: reduccionStock,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSimulacion(data.simulacion);
      }
    } catch (error) {
      console.error('Error en simulación:', error);
    } finally {
      setSimulating(false);
    }
  }

  const formatCurrency = (num: number) => {
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const resetSimulation = () => {
    setDeltaMarkup(0);
    setReduccionStock(0);
  };

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!productoInfo) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600">Producto no encontrado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={productoInfo.producto.empresa === 'Cromo' ? 'default' : 'secondary'}>
            {productoInfo.producto.empresa}
          </Badge>
          <h1 className="text-2xl font-bold">Simulador de Cambios</h1>
        </div>
        <p className="text-gray-500">
          {productoInfo.producto.codigo} - {productoInfo.producto.nombre}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Panel de Control */}
        <Card>
          <CardHeader>
            <CardTitle>Controles de Simulación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Control de Markup */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Ajustar Mark-Up</Label>
                <span className="text-sm text-gray-500">
                  {deltaMarkup >= 0 ? '+' : ''}
                  {deltaMarkup.toFixed(1)} pp
                </span>
              </div>
              <Slider
                value={[deltaMarkup]}
                onValueChange={([v]) => setDeltaMarkup(v)}
                min={-20}
                max={50}
                step={0.5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>-20%</span>
                <span>0%</span>
                <span>+50%</span>
              </div>
              <div className="rounded bg-gray-50 p-3">
                <p className="text-sm">
                  <span className="text-gray-500">Actual:</span>{' '}
                  <span className="font-medium">{productoInfo.metricas.markup_pct.toFixed(2)}%</span>
                </p>
                <p className="text-sm">
                  <span className="text-gray-500">Nuevo:</span>{' '}
                  <span className="font-medium text-blue-600">
                    {(productoInfo.metricas.markup_pct + deltaMarkup).toFixed(2)}%
                  </span>
                </p>
              </div>
            </div>

            {/* Control de Stock */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Reducir Stock</Label>
                <span className="text-sm text-gray-500">-{reduccionStock.toFixed(0)}%</span>
              </div>
              <Slider
                value={[reduccionStock]}
                onValueChange={([v]) => setReduccionStock(v)}
                min={0}
                max={80}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0%</span>
                <span>40%</span>
                <span>80%</span>
              </div>
              <div className="rounded bg-gray-50 p-3">
                <p className="text-sm">
                  <span className="text-gray-500">Actual:</span>{' '}
                  <span className="font-medium">
                    {productoInfo.metricas.stock_unidades.toLocaleString()} unidades
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-gray-500">Nuevo:</span>{' '}
                  <span className="font-medium text-blue-600">
                    {Math.round(
                      productoInfo.metricas.stock_unidades * (1 - reduccionStock / 100)
                    ).toLocaleString()}{' '}
                    unidades
                  </span>
                </p>
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={resetSimulation} className="flex-1">
                <RefreshCw className="mr-2 h-4 w-4" />
                Resetear
              </Button>
              <Button className="flex-1" disabled={!simulacion?.resumen.mejora_total}>
                <Save className="mr-2 h-4 w-4" />
                Guardar Acción
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        <div className="space-y-6">
          {/* Situación Actual */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Situación Actual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Resultado</p>
                  <p
                    className={`text-xl font-bold ${productoInfo.analisis.en_perdida ? 'text-red-600' : 'text-green-600'}`}
                  >
                    {formatCurrency(productoInfo.analisis.resultado)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Mark-Up</p>
                  <p className="text-xl font-bold">{productoInfo.metricas.markup_pct.toFixed(2)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Proyección */}
          {simulacion && (
            <Card
              className={
                simulacion.resumen.sale_de_perdida
                  ? 'border-green-300 bg-green-50'
                  : simulacion.proyectado.en_perdida
                    ? 'border-red-200 bg-red-50'
                    : ''
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  Proyección con Cambios
                  {simulating && <RefreshCw className="h-4 w-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Nuevo Resultado</p>
                    <p
                      className={`text-xl font-bold ${simulacion.proyectado.en_perdida ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {formatCurrency(simulacion.proyectado.nuevo_resultado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Nuevo Mark-Up</p>
                    <p className="text-xl font-bold">
                      {simulacion.proyectado.nuevo_markup_pct.toFixed(2)}%
                    </p>
                  </div>
                </div>

                {/* Diferencias */}
                <div className="rounded border bg-white p-3">
                  <p className="mb-2 text-sm font-medium">Impacto de los cambios:</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mejora en resultado:</span>
                      <span
                        className={
                          simulacion.diferencias.mejora_resultado > 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }
                      >
                        {simulacion.diferencias.mejora_resultado > 0 ? '+' : ''}
                        {formatCurrency(simulacion.diferencias.mejora_resultado)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ahorro en gasto crédito:</span>
                      <span className="text-green-600">
                        {formatCurrency(simulacion.diferencias.ahorro_credito)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ahorro en gasto volumen:</span>
                      <span className="text-green-600">
                        {formatCurrency(simulacion.diferencias.ahorro_volumen)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Resumen */}
                <div
                  className={`rounded p-3 ${
                    simulacion.resumen.sale_de_perdida
                      ? 'bg-green-100 text-green-800'
                      : simulacion.proyectado.en_perdida
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {simulacion.resumen.sale_de_perdida ? (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      <span className="font-medium">
                        ¡Con estos cambios el producto sale de pérdida!
                      </span>
                    </div>
                  ) : simulacion.proyectado.en_perdida ? (
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5" />
                      <span>
                        Aún en pérdida. Mark-up mínimo:{' '}
                        {simulacion.proyectado.nuevo_markup_minimo.toFixed(2)}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      <span>Producto rentable</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comparación detallada */}
          {simulacion && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Comparación Detallada</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium">Métrica</th>
                      <th className="py-2 text-right font-medium">Actual</th>
                      <th className="py-2 text-right font-medium">Proyectado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 text-gray-500">Ventas</td>
                      <td className="py-2 text-right">
                        {formatCurrency(simulacion.actual.importe_ventas)}
                      </td>
                      <td className="py-2 text-right text-blue-600">
                        {formatCurrency(simulacion.proyectado.nuevas_ventas)}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 text-gray-500">Margen Bruto</td>
                      <td className="py-2 text-right">
                        {formatCurrency(simulacion.actual.margen_bruto)}
                      </td>
                      <td className="py-2 text-right text-blue-600">
                        {formatCurrency(simulacion.proyectado.nuevo_margen)}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 text-gray-500">Gasto Total</td>
                      <td className="py-2 text-right">
                        {formatCurrency(simulacion.actual.gasto_total)}
                      </td>
                      <td className="py-2 text-right text-blue-600">
                        {formatCurrency(simulacion.proyectado.nuevo_gasto_total)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 font-medium">Resultado</td>
                      <td
                        className={`py-2 text-right font-medium ${simulacion.actual.en_perdida ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {formatCurrency(simulacion.actual.resultado)}
                      </td>
                      <td
                        className={`py-2 text-right font-medium ${simulacion.proyectado.en_perdida ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {formatCurrency(simulacion.proyectado.nuevo_resultado)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

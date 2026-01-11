'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductoEvolucionChart } from '@/components/dashboard/Charts';
import {
  ArrowLeft,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Package,
  Warehouse,
  Calculator,
  Lightbulb,
} from 'lucide-react';

interface ProductoDetalle {
  producto: {
    id: number;
    codigo: string;
    nombre: string;
    empresa: string;
    subrubro: { id: number; nombre: string } | null;
    proveedor: { id: number; nombre: string } | null;
    comprador: { id: number; nombre: string } | null;
    categoria: { id: number; codigo: string } | null;
  };
  periodo: string;
  metricas: {
    importe_ventas: number;
    importe_costo: number;
    margen_bruto: number;
    markup_pct: number;
    stock_unidades: number;
    stock_costo: number;
    stock_volumen: number;
    meses_stock: number;
    stock_ideal: number;
    exceso_stock: number;
  };
  analisis: {
    gasto_facturacion: number;
    gasto_volumen: number;
    gasto_credito: number;
    gasto_markup: number;
    gasto_total: number;
    resultado: number;
    en_perdida: boolean;
    markup_minimo_pct: number;
    cumple_objetivo: boolean;
    brecha_markup: number;
  };
  situacion: {
    estado: 'critico' | 'alerta' | 'normal' | 'optimo';
    titulo: string;
    descripcion: string;
    indicadores: Array<{ label: string; valor: string; estado: 'ok' | 'warning' | 'error' }>;
  };
  recomendaciones: Array<{
    prioridad: 'critica' | 'alta' | 'media' | 'baja';
    tipo: string;
    descripcion: string;
    impacto_estimado: number | null;
  }>;
  evolucion: Array<{
    periodo: string;
    importe_ventas: number;
    resultado: number;
  }>;
}

export default function ProductoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ProductoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducto() {
      try {
        const response = await fetch(`/api/productos/${params.id}`);
        if (!response.ok) {
          throw new Error('Producto no encontrado');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      fetchProducto();
    }
  }, [params.id]);

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-AR').format(num);
  };

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-800">Error</h3>
              <p className="text-red-600">{error || 'Producto no encontrado'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const estadoColors = {
    critico: 'bg-red-100 border-red-300 text-red-800',
    alerta: 'bg-amber-100 border-amber-300 text-amber-800',
    normal: 'bg-blue-100 border-blue-300 text-blue-800',
    optimo: 'bg-green-100 border-green-300 text-green-800',
  };

  const prioridadColors = {
    critica: 'bg-red-100 text-red-800',
    alta: 'bg-orange-100 text-orange-800',
    media: 'bg-amber-100 text-amber-800',
    baja: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={data.producto.empresa === 'Cromo' ? 'default' : 'secondary'}>
                {data.producto.empresa}
              </Badge>
              <span className="text-sm text-gray-500">SKU: {data.producto.codigo}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold">{data.producto.nombre}</h1>
          </div>
          <Button asChild>
            <Link href={`/productos/${params.id}/simular`}>
              <Calculator className="mr-2 h-4 w-4" />
              Simular Cambios
            </Link>
          </Button>
        </div>
      </div>

      {/* Estado Card */}
      <Card className={`mb-6 border ${estadoColors[data.situacion.estado]}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {data.analisis.en_perdida ? (
              <TrendingDown className="h-8 w-8 text-red-500" />
            ) : (
              <TrendingUp className="h-8 w-8 text-green-500" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold">{data.situacion.titulo}</h3>
              <p className="text-sm">{data.situacion.descripcion}</p>
              <div className="mt-3 flex flex-wrap gap-4">
                {data.situacion.indicadores.map((ind, i) => (
                  <div key={i} className="rounded bg-white/50 px-3 py-1">
                    <span className="text-sm text-gray-600">{ind.label}: </span>
                    <span
                      className={`font-semibold ${
                        ind.estado === 'error'
                          ? 'text-red-600'
                          : ind.estado === 'warning'
                            ? 'text-amber-600'
                            : 'text-green-600'
                      }`}
                    >
                      {ind.valor}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Información General */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Información General
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">Subrubro</dt>
                <dd className="font-medium">{data.producto.subrubro?.nombre || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Proveedor</dt>
                <dd className="font-medium">{data.producto.proveedor?.nombre || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Comprador</dt>
                <dd className="font-medium">{data.producto.comprador?.nombre || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Categoría</dt>
                <dd className="font-medium">{data.producto.categoria?.codigo || '-'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Ventas */}
        <Card>
          <CardHeader>
            <CardTitle>Ventas del Período</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-500">Facturación</dt>
                <dd className="font-semibold">{formatCurrency(data.metricas.importe_ventas)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Costo</dt>
                <dd className="font-semibold">{formatCurrency(data.metricas.importe_costo)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <dt className="text-gray-500">Margen Bruto</dt>
                <dd className="font-semibold text-green-600">
                  {formatCurrency(data.metricas.margen_bruto)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Mark-Up Real</dt>
                <dd className="font-semibold">{data.metricas.markup_pct.toFixed(2)}%</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Stock */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5" />
              Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-500">Unidades</dt>
                <dd className="font-semibold">{formatNumber(data.metricas.stock_unidades)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Meses de Stock</dt>
                <dd
                  className={`font-semibold ${data.metricas.meses_stock > 6 ? 'text-amber-600' : 'text-green-600'}`}
                >
                  {data.metricas.meses_stock.toFixed(1)} meses
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Valorizado</dt>
                <dd className="font-semibold">{formatCurrency(data.metricas.stock_costo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Volumen</dt>
                <dd className="font-semibold">{data.metricas.stock_volumen.toFixed(2)} m³</dd>
              </div>
              {data.metricas.exceso_stock > 0 && (
                <div className="rounded bg-amber-50 p-2 text-sm text-amber-700">
                  Exceso: {formatNumber(data.metricas.exceso_stock)} unidades (ideal: 3 meses)
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Gastos Asignados */}
        <Card>
          <CardHeader>
            <CardTitle>Gastos Asignados</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-500">Por Facturación</dt>
                <dd className="font-semibold">{formatCurrency(data.analisis.gasto_facturacion)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Por Volumen</dt>
                <dd className="font-semibold">{formatCurrency(data.analisis.gasto_volumen)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Por Crédito</dt>
                <dd className="font-semibold">{formatCurrency(data.analisis.gasto_credito)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Por Rentabilidad</dt>
                <dd className="font-semibold">{formatCurrency(data.analisis.gasto_markup)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <dt className="font-medium">Total Gastos</dt>
                <dd className="font-bold text-red-600">
                  {formatCurrency(data.analisis.gasto_total)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card className={data.analisis.en_perdida ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-4xl font-bold">
                <span className={data.analisis.en_perdida ? 'text-red-600' : 'text-green-600'}>
                  {formatCurrency(data.analisis.resultado)}
                </span>
              </p>
              <p className="mt-2 text-gray-600">
                {data.analisis.en_perdida ? 'EN PÉRDIDA' : 'EN BENEFICIO'}
              </p>
              <div className="mt-4 rounded bg-white/50 p-3">
                <p className="text-sm text-gray-600">
                  Mark-up mínimo requerido:{' '}
                  <span className="font-semibold">{data.analisis.markup_minimo_pct.toFixed(2)}%</span>
                </p>
                <p className="text-sm text-gray-600">
                  Brecha:{' '}
                  <span
                    className={`font-semibold ${data.analisis.brecha_markup > 0 ? 'text-red-600' : 'text-green-600'}`}
                  >
                    {data.analisis.brecha_markup > 0 ? '-' : '+'}
                    {Math.abs(data.analisis.brecha_markup).toFixed(2)} pp
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recomendaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Recomendaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recomendaciones.length === 0 ? (
              <p className="text-center text-gray-500">No hay recomendaciones para este producto</p>
            ) : (
              <div className="space-y-3">
                {data.recomendaciones.map((rec, i) => (
                  <div key={i} className="rounded border p-3">
                    <div className="flex items-start gap-2">
                      <Badge className={prioridadColors[rec.prioridad]}>{rec.prioridad}</Badge>
                      <div className="flex-1">
                        <p className="text-sm">{rec.descripcion}</p>
                        {rec.impacto_estimado && (
                          <p className="mt-1 text-sm text-green-600">
                            Impacto estimado: {formatCurrency(rec.impacto_estimado)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Evolución */}
      {data.evolucion.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Evolución Últimos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductoEvolucionChart data={data.evolucion} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PeriodoSelector } from '@/components/dashboard/PeriodoSelector';
import { EvolucionResultadoChart } from '@/components/dashboard/Charts';
import {
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Package,
  DollarSign,
  Boxes,
  Truck,
  ReceiptText,
  ShoppingCart,
} from 'lucide-react';
import Link from 'next/link';

interface PeriodoDisponible {
  anio: number;
  mes: number;
  periodo: string;
}

interface GastoEmpresa {
  empresa: string;
  ventas: number;
  gastos: number;
  pct_gastos: number;
  margen_bruto: number;
  gasto_minimo_pct: number;
}

interface DashboardData {
  periodo: string;
  periodo_display: string;
  periodos_disponibles: PeriodoDisponible[];
  empresa: string;
  kpis: {
    facturacion: number;
    costo_mercaderia: number;
    unidades_vendidas: number;
    stock_volumen: number;
    stock_valorizado: number;
    cantidad_pedidos: number;
    total_productos: number;
    productos_perdida: number;
    productos_beneficio: number;
    resultado_neto: number;
    subrubros_perdida: number;
    subrubros_beneficio: number;
  };
  gastos_por_empresa: GastoEmpresa[];
  evolucion: Array<{
    periodo: string;
    resultado: number;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState('todas');
  const [anioSeleccionado, setAnioSeleccionado] = useState<string>('');
  const [mesesSeleccionados, setMesesSeleccionados] = useState<number[]>([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = `/api/dashboard?empresa=${empresa}`;
      if (anioSeleccionado && mesesSeleccionados.length > 0) {
        url += `&anio=${anioSeleccionado}&meses=${mesesSeleccionados.join(',')}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error cargando dashboard');
      }
      const dashboardData = await response.json();
      setData(dashboardData);

      // Inicializar año y mes si es la primera carga
      if (!anioSeleccionado && dashboardData.periodos_disponibles?.length > 0) {
        const primerPeriodo = dashboardData.periodos_disponibles[0];
        setAnioSeleccionado(primerPeriodo.anio.toString());
        setMesesSeleccionados([primerPeriodo.mes]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [empresa, anioSeleccionado, mesesSeleccionados]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="p-3 sm:p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-4 p-4 sm:p-6">
            <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8 text-red-500 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-800">Error cargando datos</h3>
              <p className="text-sm text-red-600">{error}</p>
              <Link href="/upload" className="mt-2 inline-block text-sm font-medium text-red-700 underline">
                Ir a cargar datos
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (num: number) => {
    if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
    return num.toLocaleString('es-AR');
  };

  const { kpis, gastos_por_empresa, evolucion } = data;

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* Header con filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard de Rentabilidad</h1>
          <p className="text-sm text-gray-500">{data.periodo_display || 'Cargando...'}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {data.periodos_disponibles && data.periodos_disponibles.length > 0 && (
            <PeriodoSelector
              periodosDisponibles={data.periodos_disponibles}
              anioSeleccionado={anioSeleccionado}
              mesesSeleccionados={mesesSeleccionados}
              onAnioChange={setAnioSeleccionado}
              onMesesChange={setMesesSeleccionados}
            />
          )}
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="Cromo">Cromo</SelectItem>
              <SelectItem value="BBA">BBA</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* FILA 1: KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <ReceiptText className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500">Facturación</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(kpis.facturacion)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-gray-500">CMV</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(kpis.costo_mercaderia)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-gray-500">Uds Vendidas</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(kpis.unidades_vendidas)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Boxes className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-gray-500">Stock m³</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(kpis.stock_volumen)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500">Stock $</span>
          </div>
          <p className="text-lg font-bold">{formatCurrency(kpis.stock_valorizado)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="h-4 w-4 text-cyan-500" />
            <span className="text-xs text-gray-500">Pedidos</span>
          </div>
          <p className="text-lg font-bold">{formatNumber(kpis.cantidad_pedidos)}</p>
        </Card>
      </div>

      {/* FILA 2: Gastos por empresa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">% Gasto por Empresa</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {gastos_por_empresa.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {gastos_por_empresa.map((g) => (
                  <div key={g.empresa} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{g.empresa}</span>
                      <span className="font-bold">{g.pct_gastos.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(g.pct_gastos, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Gastos: {formatCurrency(g.gastos)}</span>
                      <span>Ventas: {formatCurrency(g.ventas)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">% Gasto Mínimo (Punto Flotación)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {gastos_por_empresa.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {gastos_por_empresa.map((g) => {
                  const diferencia = g.pct_gastos - g.gasto_minimo_pct;
                  const enPeligro = diferencia > 0;
                  return (
                    <div key={g.empresa} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{g.empresa}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${enPeligro ? 'text-red-600' : 'text-green-600'}`}>
                            {g.gasto_minimo_pct.toFixed(1)}%
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${enPeligro ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {enPeligro ? '+' : ''}{diferencia.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all ${enPeligro ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(g.gasto_minimo_pct, 100)}%` }}
                        />
                        {/* Indicador del gasto actual */}
                        <div
                          className="absolute top-0 h-full w-0.5 bg-red-600"
                          style={{ left: `${Math.min(g.pct_gastos, 100)}%` }}
                          title={`Gasto actual: ${g.pct_gastos.toFixed(1)}%`}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Margen Bruto: {formatCurrency(g.margen_bruto)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FILA 3: Subrubros + Resultado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <span className="text-sm text-gray-600">Subrubros en Pérdida</span>
          </div>
          <p className="text-3xl font-bold text-red-600">{kpis.subrubros_perdida}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <span className="text-sm text-gray-600">Subrubros en Beneficio</span>
          </div>
          <p className="text-3xl font-bold text-green-600">{kpis.subrubros_beneficio}</p>
        </Card>
        <Card className={`p-4 ${kpis.resultado_neto >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className={`h-5 w-5 ${kpis.resultado_neto >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            <span className="text-sm text-gray-600">Resultado Final</span>
          </div>
          <p className={`text-3xl font-bold ${kpis.resultado_neto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(kpis.resultado_neto)}
          </p>
        </Card>
      </div>

      {/* FILA 4: Gráfico de evolución */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">Evolución Resultado (Últimos 6 meses)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {evolucion && evolucion.length > 0 ? (
            <EvolucionResultadoChart data={evolucion} />
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">No hay datos históricos</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>

      <Skeleton className="h-72" />
    </div>
  );
}

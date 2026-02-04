'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { EvolucionChart, DistribucionGastosChart } from '@/components/dashboard/Charts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, TrendingDown, TrendingUp, Package, DollarSign, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface SubrubroItem {
  subrubro: string;
  empresa: string;
  total_productos: number;
  resultado: number;
  markup_actual: number;
  markup_min: number;
}

interface DashboardData {
  periodo: string;
  empresa: string;
  resumen: {
    total_productos: number;
    productos_perdida: number;
    perdida_total: number;
    beneficio_total: number;
    resultado_neto: number;
    pct_perdida: number;
  };
  evolucion_6_meses: Array<{
    periodo: string;
    beneficio: number;
    perdida: number;
    resultado: number;
  }>;
  distribucion_gastos: {
    facturacion: number;
    volumen: number;
    movimiento: number;
    credito: number;
    rentabilidad: number;
  };
  top_peores: SubrubroItem[];
  top_mejores: SubrubroItem[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState('todas');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboard?empresa=${empresa}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error cargando dashboard');
      }
      const dashboardData = await response.json();
      setData(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [empresa]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
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

  const getMarkupStatus = (actual: number, min: number) => {
    if (!actual || !min) return 'neutral';
    if (actual >= min) return 'good';
    return 'bad';
  };

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard de Rentabilidad</h1>
          <p className="text-sm text-gray-500">
            {new Date(data.periodo).toLocaleDateString('es-AR', { year: 'numeric', month: 'short' })}
          </p>
        </div>
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger className="w-32 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="Cromo">Cromo</SelectItem>
            <SelectItem value="BBA">BBA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metrics */}
      <div className="mb-4 sm:mb-6 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <MetricCard
          title="En Pérdida"
          value={`${data.resumen.productos_perdida.toLocaleString()}`}
          subtitle={`${data.resumen.pct_perdida.toFixed(0)}% de ${data.resumen.total_productos.toLocaleString()}`}
          type="danger"
          icon={<Package className="h-5 w-5 sm:h-6 sm:w-6" />}
        />
        <MetricCard
          title="Pérdida"
          value={formatCurrency(data.resumen.perdida_total)}
          type="danger"
          icon={<TrendingDown className="h-5 w-5 sm:h-6 sm:w-6" />}
        />
        <MetricCard
          title="Beneficio"
          value={formatCurrency(data.resumen.beneficio_total)}
          type="success"
          icon={<TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" />}
        />
        <MetricCard
          title="Resultado"
          value={formatCurrency(data.resumen.resultado_neto)}
          type={data.resumen.resultado_neto >= 0 ? 'success' : 'danger'}
          icon={<DollarSign className="h-5 w-5 sm:h-6 sm:w-6" />}
        />
      </div>

      {/* Charts */}
      <div className="mb-4 sm:mb-6 grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-base">Evolución 6 Meses</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            {data.evolucion_6_meses.length > 0 ? (
              <EvolucionChart data={data.evolucion_6_meses} />
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">No hay datos históricos</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-base">Distribución de Gastos</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <DistribucionGastosChart data={data.distribucion_gastos} />
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Top Peores */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
              Top 10 Peores Subrubros
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Subrubro</TableHead>
                    <TableHead className="hidden sm:table-cell">Emp.</TableHead>
                    <TableHead className="text-right">MU</TableHead>
                    <TableHead className="text-right">Mín</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_peores.map((item, idx) => {
                    const status = getMarkupStatus(item.markup_actual, item.markup_min);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="max-w-[120px] sm:max-w-[150px]">
                          <span className="block truncate text-sm font-medium" title={item.subrubro}>
                            {item.subrubro}
                          </span>
                          <span className="sm:hidden text-xs text-gray-500">{item.empresa}</span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={item.empresa === 'Cromo' ? 'default' : 'secondary'} className="text-xs">
                            {item.empresa}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm ${status === 'bad' ? 'text-red-600 font-medium' : status === 'good' ? 'text-green-600' : ''}`}>
                            {item.markup_actual.toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-gray-600">
                          {item.markup_min.toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {status === 'bad' && <AlertTriangle className="h-3 w-3 text-amber-500 hidden sm:block" />}
                            <span className="text-sm font-medium text-red-600">
                              {formatCurrency(item.resultado)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top Mejores */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
              Top 10 Mejores Subrubros
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Subrubro</TableHead>
                    <TableHead className="hidden sm:table-cell">Emp.</TableHead>
                    <TableHead className="text-right">MU</TableHead>
                    <TableHead className="text-right">Mín</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_mejores.map((item, idx) => {
                    const status = getMarkupStatus(item.markup_actual, item.markup_min);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="max-w-[120px] sm:max-w-[150px]">
                          <span className="block truncate text-sm font-medium" title={item.subrubro}>
                            {item.subrubro}
                          </span>
                          <span className="sm:hidden text-xs text-gray-500">{item.empresa}</span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={item.empresa === 'Cromo' ? 'default' : 'secondary'} className="text-xs">
                            {item.empresa}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm ${status === 'good' ? 'text-green-600 font-medium' : ''}`}>
                            {item.markup_actual.toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-gray-600">
                          {item.markup_min.toFixed(0)}%
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-medium text-green-600">
                            {formatCurrency(item.resultado)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <Skeleton className="h-7 w-48 sm:h-8 sm:w-64" />
        <Skeleton className="mt-2 h-4 w-32 sm:w-48" />
      </div>

      <div className="mb-4 sm:mb-6 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 sm:h-32" />
        ))}
      </div>

      <div className="mb-4 sm:mb-6 grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 sm:h-80" />
        <Skeleton className="h-64 sm:h-80" />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 sm:h-96" />
        <Skeleton className="h-80 sm:h-96" />
      </div>
    </div>
  );
}

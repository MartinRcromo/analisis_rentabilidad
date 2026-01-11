'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { EvolucionChart, DistribucionGastosChart } from '@/components/dashboard/Charts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, TrendingDown, TrendingUp, Package, DollarSign } from 'lucide-react';
import Link from 'next/link';

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
    credito: number;
    rentabilidad: number;
  };
  top_peores: Array<{
    subrubro: string;
    empresa: string;
    total_productos: number;
    resultado: number;
  }>;
  top_mejores: Array<{
    subrubro: string;
    empresa: string;
    total_productos: number;
    resultado: number;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState('todas');

  useEffect(() => {
    fetchDashboard();
  }, [empresa]);

  async function fetchDashboard() {
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
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-800">Error cargando datos</h3>
              <p className="text-red-600">{error}</p>
              <p className="mt-2 text-sm text-red-500">
                Asegúrese de haber cargado datos de ventas y gastos primero.
              </p>
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
    return `$${num.toFixed(0)}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard de Rentabilidad</h1>
          <p className="text-gray-500">
            Período: {new Date(data.periodo).toLocaleDateString('es-AR', { year: 'numeric', month: 'long' })}
          </p>
        </div>
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger className="w-40">
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
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Productos en Pérdida"
          value={`${data.resumen.productos_perdida.toLocaleString()} / ${data.resumen.total_productos.toLocaleString()}`}
          subtitle={`${data.resumen.pct_perdida.toFixed(1)}% del total`}
          type="danger"
          icon={<Package className="h-6 w-6" />}
        />
        <MetricCard
          title="Pérdida Total"
          value={formatCurrency(data.resumen.perdida_total)}
          type="danger"
          icon={<TrendingDown className="h-6 w-6" />}
        />
        <MetricCard
          title="Beneficio Total"
          value={formatCurrency(data.resumen.beneficio_total)}
          type="success"
          icon={<TrendingUp className="h-6 w-6" />}
        />
        <MetricCard
          title="Resultado Neto"
          value={formatCurrency(data.resumen.resultado_neto)}
          type={data.resumen.resultado_neto >= 0 ? 'success' : 'danger'}
          icon={<DollarSign className="h-6 w-6" />}
        />
      </div>

      {/* Charts */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolución Últimos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            {data.evolucion_6_meses.length > 0 ? (
              <EvolucionChart data={data.evolucion_6_meses} />
            ) : (
              <p className="py-8 text-center text-gray-500">No hay datos históricos</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución de Gastos</CardTitle>
          </CardHeader>
          <CardContent>
            <DistribucionGastosChart data={data.distribucion_gastos} />
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Peores */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              Top 10 Peores Subrubros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subrubro</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Productos</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_peores.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.subrubro}</TableCell>
                    <TableCell>
                      <Badge variant={item.empresa === 'Cromo' ? 'default' : 'secondary'}>
                        {item.empresa}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.total_productos}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {formatCurrency(item.resultado)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Mejores */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Top 10 Mejores Subrubros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subrubro</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Productos</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_mejores.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.subrubro}</TableCell>
                    <TableCell>
                      <Badge variant={item.empresa === 'Cromo' ? 'default' : 'secondary'}>
                        {item.empresa}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.total_productos}</TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatCurrency(item.resultado)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

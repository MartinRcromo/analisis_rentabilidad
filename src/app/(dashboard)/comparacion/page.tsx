'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompare, TrendingUp, TrendingDown, Package, DollarSign } from 'lucide-react';

interface EmpresaData {
  total_productos: number;
  productos_perdida: number;
  perdida_total: number;
  beneficio_total: number;
  resultado_neto: number;
  pct_perdida: number;
}

interface ComparacionData {
  periodo: string;
  cromo: EmpresaData | null;
  bba: EmpresaData | null;
}

export default function ComparacionPage() {
  const [data, setData] = useState<ComparacionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch data para Cromo
        const cromoResponse = await fetch('/api/dashboard?empresa=Cromo');
        const cromoData = await cromoResponse.json();

        // Fetch data para BBA
        const bbaResponse = await fetch('/api/dashboard?empresa=BBA');
        const bbaData = await bbaResponse.json();

        setData({
          periodo: cromoData.periodo || bbaData.periodo,
          cromo: cromoData.resumen || null,
          bba: bbaData.resumen || null,
        });
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const formatCurrency = (num: number) => {
    if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    return `$${num.toLocaleString()}`;
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

  if (!data || (!data.cromo && !data.bba)) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-gray-500">
              No hay datos disponibles para comparar. Cargue datos de ventas primero.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const MetricRow = ({
    label,
    cromoValue,
    bbaValue,
    format = 'currency',
    inverse = false,
  }: {
    label: string;
    cromoValue: number | null;
    bbaValue: number | null;
    format?: 'currency' | 'number' | 'percent';
    inverse?: boolean;
  }) => {
    const formatValue = (val: number | null) => {
      if (val === null) return '-';
      if (format === 'currency') return formatCurrency(val);
      if (format === 'percent') return `${val.toFixed(1)}%`;
      return val.toLocaleString();
    };

    const cromoBetter = cromoValue !== null && bbaValue !== null
      ? inverse
        ? cromoValue < bbaValue
        : cromoValue > bbaValue
      : null;

    return (
      <div className="grid grid-cols-3 gap-4 border-b py-3">
        <div className="font-medium text-gray-700">{label}</div>
        <div
          className={`text-right ${cromoBetter === true ? 'font-semibold text-green-600' : cromoBetter === false ? 'text-gray-500' : ''}`}
        >
          {formatValue(cromoValue)}
          {cromoBetter === true && <span className="ml-1">✓</span>}
        </div>
        <div
          className={`text-right ${cromoBetter === false ? 'font-semibold text-green-600' : cromoBetter === true ? 'text-gray-500' : ''}`}
        >
          {formatValue(bbaValue)}
          {cromoBetter === false && <span className="ml-1">✓</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <GitCompare className="h-6 w-6" />
          Comparación Cromo vs BBA
        </h1>
        <p className="text-gray-500">
          Análisis comparativo de rentabilidad entre empresas
          {data.periodo && ` - ${new Date(data.periodo).toLocaleDateString('es-AR', { year: 'numeric', month: 'long' })}`}
        </p>
      </div>

      {/* Cards comparativas */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Cromo */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge>Cromo</Badge>
              Resumen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.cromo ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Package className="h-4 w-4" />
                    <span className="text-sm">Productos</span>
                  </div>
                  <p className="text-2xl font-bold">{data.cromo.total_productos.toLocaleString()}</p>
                </div>
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="text-sm">En Pérdida</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    {data.cromo.productos_perdida.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">{data.cromo.pct_perdida.toFixed(1)}%</p>
                </div>
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Beneficio</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(data.cromo.beneficio_total)}
                  </p>
                </div>
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-sm">Resultado Neto</span>
                  </div>
                  <p
                    className={`text-2xl font-bold ${data.cromo.resultado_neto >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatCurrency(data.cromo.resultado_neto)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Sin datos</p>
            )}
          </CardContent>
        </Card>

        {/* BBA */}
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="secondary">BBA</Badge>
              Resumen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.bba ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Package className="h-4 w-4" />
                    <span className="text-sm">Productos</span>
                  </div>
                  <p className="text-2xl font-bold">{data.bba.total_productos.toLocaleString()}</p>
                </div>
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="text-sm">En Pérdida</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    {data.bba.productos_perdida.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">{data.bba.pct_perdida.toFixed(1)}%</p>
                </div>
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Beneficio</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(data.bba.beneficio_total)}
                  </p>
                </div>
                <div className="rounded bg-white p-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-sm">Resultado Neto</span>
                  </div>
                  <p
                    className={`text-2xl font-bold ${data.bba.resultado_neto >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {formatCurrency(data.bba.resultado_neto)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla comparativa */}
      <Card>
        <CardHeader>
          <CardTitle>Comparación Detallada</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 border-b pb-2 font-semibold">
            <div>Métrica</div>
            <div className="text-right">
              <Badge>Cromo</Badge>
            </div>
            <div className="text-right">
              <Badge variant="secondary">BBA</Badge>
            </div>
          </div>

          <MetricRow
            label="Total Productos"
            cromoValue={data.cromo?.total_productos ?? null}
            bbaValue={data.bba?.total_productos ?? null}
            format="number"
          />
          <MetricRow
            label="Productos en Pérdida"
            cromoValue={data.cromo?.productos_perdida ?? null}
            bbaValue={data.bba?.productos_perdida ?? null}
            format="number"
            inverse={true}
          />
          <MetricRow
            label="% en Pérdida"
            cromoValue={data.cromo?.pct_perdida ?? null}
            bbaValue={data.bba?.pct_perdida ?? null}
            format="percent"
            inverse={true}
          />
          <MetricRow
            label="Pérdida Total"
            cromoValue={data.cromo?.perdida_total ?? null}
            bbaValue={data.bba?.perdida_total ?? null}
            inverse={true}
          />
          <MetricRow
            label="Beneficio Total"
            cromoValue={data.cromo?.beneficio_total ?? null}
            bbaValue={data.bba?.beneficio_total ?? null}
          />
          <MetricRow
            label="Resultado Neto"
            cromoValue={data.cromo?.resultado_neto ?? null}
            bbaValue={data.bba?.resultado_neto ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}

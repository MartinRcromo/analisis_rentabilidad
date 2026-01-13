'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompare, TrendingUp, TrendingDown, Package, DollarSign, Percent, Target } from 'lucide-react';

interface EmpresaData {
  total_productos: number;
  productos_perdida: number;
  perdida_total: number;
  beneficio_total: number;
  resultado_neto: number;
  pct_perdida: number;
  facturacion_total: number;
  costo_total: number;
  gasto_total: number;
  gasto_pct: number;
  markup_actual: number;
  markup_min: number;
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
        const response = await fetch('/api/comparacion');
        const result = await response.json();
        setData(result);
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
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-6">
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
      <div className="p-3 sm:p-6">
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
      <div className="grid grid-cols-3 gap-2 sm:gap-4 border-b py-2 sm:py-3">
        <div className="text-xs sm:text-sm font-medium text-gray-700">{label}</div>
        <div
          className={`text-right text-xs sm:text-sm ${cromoBetter === true ? 'font-semibold text-green-600' : cromoBetter === false ? 'text-gray-500' : ''}`}
        >
          {formatValue(cromoValue)}
          {cromoBetter === true && <span className="ml-1">✓</span>}
        </div>
        <div
          className={`text-right text-xs sm:text-sm ${cromoBetter === false ? 'font-semibold text-green-600' : cromoBetter === true ? 'text-gray-500' : ''}`}
        >
          {formatValue(bbaValue)}
          {cromoBetter === false && <span className="ml-1">✓</span>}
        </div>
      </div>
    );
  };

  const EmpresaCard = ({
    empresa,
    data,
    color
  }: {
    empresa: string;
    data: EmpresaData | null;
    color: 'blue' | 'purple'
  }) => {
    const bgColor = color === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-purple-200 bg-purple-50';

    return (
      <Card className={bgColor}>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Badge variant={color === 'blue' ? 'default' : 'secondary'}>{empresa}</Badge>
            Resumen
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          {data ? (
            <div className="grid gap-2 sm:gap-4 grid-cols-2">
              <div className="rounded bg-white p-2 sm:p-3">
                <div className="flex items-center gap-1 sm:gap-2 text-gray-500">
                  <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-sm">Productos</span>
                </div>
                <p className="text-lg sm:text-2xl font-bold">{data.total_productos.toLocaleString()}</p>
              </div>
              <div className="rounded bg-white p-2 sm:p-3">
                <div className="flex items-center gap-1 sm:gap-2 text-gray-500">
                  <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
                  <span className="text-xs sm:text-sm">En Pérdida</span>
                </div>
                <p className="text-lg sm:text-2xl font-bold text-red-600">
                  {data.productos_perdida.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">{data.pct_perdida.toFixed(1)}%</p>
              </div>
              <div className="rounded bg-white p-2 sm:p-3">
                <div className="flex items-center gap-1 sm:gap-2 text-gray-500">
                  <Percent className="h-3 w-3 sm:h-4 sm:w-4 text-orange-500" />
                  <span className="text-xs sm:text-sm">Gasto %</span>
                </div>
                <p className="text-lg sm:text-2xl font-bold text-orange-600">
                  {data.gasto_pct.toFixed(1)}%
                </p>
              </div>
              <div className="rounded bg-white p-2 sm:p-3">
                <div className="flex items-center gap-1 sm:gap-2 text-gray-500">
                  <Target className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500" />
                  <span className="text-xs sm:text-sm">MU Mín</span>
                </div>
                <p className="text-lg sm:text-2xl font-bold text-blue-600">
                  {data.markup_min.toFixed(1)}%
                </p>
              </div>
              <div className="rounded bg-white p-2 sm:p-3">
                <div className="flex items-center gap-1 sm:gap-2 text-gray-500">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
                  <span className="text-xs sm:text-sm">MU Actual</span>
                </div>
                <p className={`text-lg sm:text-2xl font-bold ${data.markup_actual >= data.markup_min ? 'text-green-600' : 'text-red-600'}`}>
                  {data.markup_actual.toFixed(1)}%
                </p>
              </div>
              <div className="rounded bg-white p-2 sm:p-3">
                <div className="flex items-center gap-1 sm:gap-2 text-gray-500">
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-sm">Resultado</span>
                </div>
                <p
                  className={`text-lg sm:text-2xl font-bold ${data.resultado_neto >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {formatCurrency(data.resultado_neto)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Sin datos</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
          <GitCompare className="h-5 w-5 sm:h-6 sm:w-6" />
          Comparación Cromo vs BBA
        </h1>
        <p className="text-sm sm:text-base text-gray-500">
          Análisis comparativo de rentabilidad entre empresas
          {data.periodo && ` - ${new Date(data.periodo).toLocaleDateString('es-AR', { year: 'numeric', month: 'long' })}`}
        </p>
      </div>

      {/* Cards comparativas */}
      <div className="mb-4 sm:mb-6 grid gap-4 sm:gap-6 lg:grid-cols-2">
        <EmpresaCard empresa="Cromo" data={data.cromo} color="blue" />
        <EmpresaCard empresa="BBA" data={data.bba} color="purple" />
      </div>

      {/* Tabla comparativa */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Comparación Detallada</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 border-b pb-2 font-semibold">
            <div className="text-xs sm:text-sm">Métrica</div>
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
            label="Facturación"
            cromoValue={data.cromo?.facturacion_total ?? null}
            bbaValue={data.bba?.facturacion_total ?? null}
          />
          <MetricRow
            label="Gasto Total"
            cromoValue={data.cromo?.gasto_total ?? null}
            bbaValue={data.bba?.gasto_total ?? null}
            inverse={true}
          />
          <MetricRow
            label="Gasto %"
            cromoValue={data.cromo?.gasto_pct ?? null}
            bbaValue={data.bba?.gasto_pct ?? null}
            format="percent"
            inverse={true}
          />
          <MetricRow
            label="Markup Actual"
            cromoValue={data.cromo?.markup_actual ?? null}
            bbaValue={data.bba?.markup_actual ?? null}
            format="percent"
          />
          <MetricRow
            label="Markup Mínimo"
            cromoValue={data.cromo?.markup_min ?? null}
            bbaValue={data.bba?.markup_min ?? null}
            format="percent"
            inverse={true}
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

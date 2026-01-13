'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ArrowUpDown, Users, TrendingDown, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface ProveedorData {
  proveedor_id: number;
  proveedor: string;
  empresa: string;
  total_productos: number;
  facturacion: number;
  costo: number;
  margen_bruto: number;
  gasto_total: number;
  gasto_sobre_venta_pct: number;
  markup_actual: number;
  markup_min: number;
  resultado: number;
  en_perdida: boolean;
}

interface ApiResponse {
  periodo: string;
  empresa: string;
  proveedores: ProveedorData[];
  totales: {
    total_facturacion: number;
    total_volumen: number;
    total_stock: number;
    total_margen: number;
    total_proveedores: number;
    proveedores_perdida: number;
  };
  gastos: {
    facturacion: number;
    volumen: number;
    credito: number;
    rentabilidad: number;
    total: number;
  };
}

export default function ProveedoresPage() {
  const [data, setData] = useState<ProveedorData[]>([]);
  const [totales, setTotales] = useState<ApiResponse['totales'] | null>(null);
  const [gastos, setGastos] = useState<ApiResponse['gastos'] | null>(null);
  const [periodo, setPeriodo] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    empresa: 'todas',
    busqueda: '',
    orderBy: 'resultado',
    orderDir: 'asc' as 'asc' | 'desc',
  });

  const fetchProveedores = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.empresa !== 'todas') params.set('empresa', filters.empresa);

      const response = await fetch(`/api/proveedores?${params}`);
      const result: ApiResponse = await response.json();

      if (result.proveedores) {
        setData(result.proveedores);
        setTotales(result.totales);
        setGastos(result.gastos);
        setPeriodo(result.periodo);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.empresa]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const filteredData = data
    .filter((p) => {
      if (filters.busqueda) {
        return p.proveedor.toLowerCase().includes(filters.busqueda.toLowerCase());
      }
      return true;
    })
    .sort((a, b) => {
      const mult = filters.orderDir === 'asc' ? 1 : -1;
      if (filters.orderBy === 'resultado') return (a.resultado - b.resultado) * mult;
      if (filters.orderBy === 'facturacion') return (a.facturacion - b.facturacion) * mult;
      if (filters.orderBy === 'gasto_sobre_venta') return (a.gasto_sobre_venta_pct - b.gasto_sobre_venta_pct) * mult;
      if (filters.orderBy === 'markup_actual') return ((a.markup_actual || 0) - (b.markup_actual || 0)) * mult;
      if (filters.orderBy === 'markup_min') return ((a.markup_min || 0) - (b.markup_min || 0)) * mult;
      if (filters.orderBy === 'productos') return (a.total_productos - b.total_productos) * mult;
      return 0;
    });

  const formatCurrency = (num: number) => {
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const handleSort = (column: string) => {
    setFilters((prev) => ({
      ...prev,
      orderBy: column,
      orderDir: prev.orderBy === column && prev.orderDir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const proveedoresPerdida = filteredData.filter((p) => p.en_perdida).length;
  const totalResultado = filteredData.reduce((sum, p) => sum + p.resultado, 0);

  // Markup comparison helper
  const getMarkupStatus = (actual: number, min: number) => {
    if (!actual || !min) return 'neutral';
    if (actual >= min) return 'good';
    return 'bad';
  };

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
          <Users className="h-5 w-5 sm:h-6 sm:w-6" />
          Análisis por Proveedor
        </h1>
        <p className="text-sm sm:text-base text-gray-500">
          Rentabilidad por proveedor
          {periodo && ` - ${new Date(periodo).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })}`}
        </p>
      </div>

      {/* Resumen - Cards */}
      {totales && (
        <div className="mb-4 sm:mb-6 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-500">
                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Total </span>Proveedores
              </div>
              <div className="mt-1 text-lg sm:text-2xl font-bold">{totales.total_proveedores}</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-red-600">
                <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />
                En Pérdida
              </div>
              <div className="mt-1 text-lg sm:text-2xl font-bold text-red-600">{proveedoresPerdida}</div>
              <div className="text-xs text-red-500">
                {filteredData.length > 0 ? ((proveedoresPerdida / filteredData.length) * 100).toFixed(0) : 0}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-500">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                Gastos
              </div>
              <div className="mt-1 text-lg sm:text-2xl font-bold">{formatCurrency(gastos?.total || 0)}</div>
            </CardContent>
          </Card>
          <Card className={totalResultado >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            <CardContent className="p-3 sm:p-4">
              <div className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${totalResultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalResultado >= 0 ? <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" /> : <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />}
                Resultado
              </div>
              <div className={`mt-1 text-lg sm:text-2xl font-bold ${totalResultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalResultado)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card className="mb-4 sm:mb-6">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar proveedor..."
                value={filters.busqueda}
                onChange={(e) => setFilters((prev) => ({ ...prev, busqueda: e.target.value }))}
                className="w-full sm:w-64"
              />
            </div>

            <div className="flex items-center gap-3">
              <Select
                value={filters.empresa}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, empresa: v }))}
              >
                <SelectTrigger className="w-28 sm:w-32">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="Cromo">Cromo</SelectItem>
                  <SelectItem value="BBA">BBA</SelectItem>
                </SelectContent>
              </Select>

              <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                {filteredData.length} proveedores
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Proveedores ({filteredData.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Proveedor</TableHead>
                    <TableHead className="hidden sm:table-cell">Emp.</TableHead>
                    <TableHead
                      className="cursor-pointer text-right hidden md:table-cell"
                      onClick={() => handleSort('productos')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Prod.
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('facturacion')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span className="hidden sm:inline">Facturación</span>
                        <span className="sm:hidden">Fact.</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Gasto</TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('markup_actual')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span className="hidden sm:inline">Markup</span>
                        <span className="sm:hidden">MU</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('markup_min')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span className="hidden sm:inline">MU Mín</span>
                        <span className="sm:hidden">Min</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('resultado')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span className="hidden sm:inline">Resultado</span>
                        <span className="sm:hidden">Res.</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center hidden sm:table-cell">Ver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((proveedor, idx) => {
                    const markupStatus = getMarkupStatus(proveedor.markup_actual, proveedor.markup_min);
                    return (
                      <TableRow
                        key={`${proveedor.proveedor}-${proveedor.empresa}-${idx}`}
                        className={proveedor.en_perdida ? 'bg-red-50' : ''}
                      >
                        <TableCell className="max-w-[150px] sm:max-w-[200px]">
                          <Link
                            href={`/productos?proveedor_id=${proveedor.proveedor_id}&empresa=${proveedor.empresa}`}
                            className="block truncate font-medium hover:text-blue-600 hover:underline"
                            title={proveedor.proveedor}
                          >
                            {proveedor.proveedor}
                          </Link>
                          <span className="sm:hidden text-xs text-gray-500">{proveedor.empresa}</span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant={proveedor.empresa === 'Cromo' ? 'default' : 'secondary'} className="text-xs">
                            {proveedor.empresa}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell text-sm">
                          {proveedor.total_productos}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(proveedor.facturacion)}
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell text-sm">
                          {formatCurrency(proveedor.gasto_total)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm font-medium ${
                            markupStatus === 'good' ? 'text-green-600' :
                            markupStatus === 'bad' ? 'text-red-600' : ''
                          }`}>
                            {(proveedor.markup_actual || 0).toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm text-gray-600">
                            {(proveedor.markup_min || 0).toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {markupStatus === 'bad' && (
                              <AlertTriangle className="h-3 w-3 text-amber-500 hidden sm:block" />
                            )}
                            <span
                              className={`text-sm font-medium ${proveedor.en_perdida ? 'text-red-600' : 'text-green-600'}`}
                            >
                              {formatCurrency(proveedor.resultado)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                            <Link href={`/productos?proveedor_id=${proveedor.proveedor_id}&empresa=${proveedor.empresa}`}>
                              →
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

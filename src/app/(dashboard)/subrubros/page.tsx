'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ArrowUpDown, FolderTree, TrendingDown, TrendingUp, DollarSign } from 'lucide-react';
import Link from 'next/link';

interface SubrubroData {
  subrubro_id: number;
  subrubro: string;
  empresa: string;
  total_productos: number;
  facturacion: number;
  costo: number;
  margen_bruto: number;
  markup_promedio: number;
  gasto_total: number;
  gasto_sobre_venta_pct: number;
  markup_min: number;
  resultado: number;
  en_perdida: boolean;
  pct_facturacion: number;
  pct_volumen: number;
}

interface ApiResponse {
  periodo: string;
  empresa: string;
  subrubros: SubrubroData[];
  totales: {
    total_facturacion: number;
    total_volumen: number;
    total_stock: number;
    total_margen: number;
    total_subrubros: number;
    subrubros_perdida: number;
  };
  gastos: {
    facturacion: number;
    volumen: number;
    credito: number;
    rentabilidad: number;
    total: number;
  };
}

export default function SubrubrosPage() {
  const [data, setData] = useState<SubrubroData[]>([]);
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

  const fetchSubrubros = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.empresa !== 'todas') params.set('empresa', filters.empresa);

      const response = await fetch(`/api/subrubros?${params}`);
      const result: ApiResponse = await response.json();

      if (result.subrubros) {
        setData(result.subrubros);
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
    fetchSubrubros();
  }, [fetchSubrubros]);

  const filteredData = data
    .filter((s) => {
      if (filters.busqueda) {
        return s.subrubro.toLowerCase().includes(filters.busqueda.toLowerCase());
      }
      return true;
    })
    .sort((a, b) => {
      const mult = filters.orderDir === 'asc' ? 1 : -1;
      if (filters.orderBy === 'resultado') return (a.resultado - b.resultado) * mult;
      if (filters.orderBy === 'facturacion') return (a.facturacion - b.facturacion) * mult;
      if (filters.orderBy === 'gasto_sobre_venta') return (a.gasto_sobre_venta_pct - b.gasto_sobre_venta_pct) * mult;
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

  const subrubrosPerdida = filteredData.filter((s) => s.en_perdida).length;
  const totalResultado = filteredData.reduce((sum, s) => sum + s.resultado, 0);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FolderTree className="h-6 w-6" />
          Análisis por Subrubro
        </h1>
        <p className="text-gray-500">
          Rentabilidad agregada por categoría de producto
          {periodo && ` - Período: ${new Date(periodo).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`}
        </p>
      </div>

      {/* Resumen */}
      {totales && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <FolderTree className="h-4 w-4" />
                Total Subrubros
              </div>
              <div className="mt-1 text-2xl font-bold">{totales.total_subrubros}</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-red-600">
                <TrendingDown className="h-4 w-4" />
                En Pérdida
              </div>
              <div className="mt-1 text-2xl font-bold text-red-600">{subrubrosPerdida}</div>
              <div className="text-sm text-red-500">
                {((subrubrosPerdida / filteredData.length) * 100).toFixed(1)}% del total
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <DollarSign className="h-4 w-4" />
                Gastos Asignados
              </div>
              <div className="mt-1 text-2xl font-bold">{formatCurrency(gastos?.total || 0)}</div>
            </CardContent>
          </Card>
          <Card className={totalResultado >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            <CardContent className="p-4">
              <div className={`flex items-center gap-2 text-sm ${totalResultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalResultado >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                Resultado Total
              </div>
              <div className={`mt-1 text-2xl font-bold ${totalResultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalResultado)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar subrubro..."
                value={filters.busqueda}
                onChange={(e) => setFilters((prev) => ({ ...prev, busqueda: e.target.value }))}
                className="w-64"
              />
            </div>

            <Select
              value={filters.empresa}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, empresa: v }))}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="Cromo">Cromo</SelectItem>
                <SelectItem value="BBA">BBA</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto text-sm text-gray-500">
              Mostrando {filteredData.length} subrubros
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle>Subrubros ({filteredData.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subrubro</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('productos')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Productos
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('facturacion')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Facturación
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('gasto_sobre_venta')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Gasto/Venta %
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('markup_min')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Markup Mín %
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('resultado')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Resultado
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((subrubro, idx) => (
                    <TableRow
                      key={`${subrubro.subrubro}-${subrubro.empresa}-${idx}`}
                      className={subrubro.en_perdida ? 'bg-red-50' : ''}
                    >
                      <TableCell className="max-w-[200px] truncate font-medium" title={subrubro.subrubro}>
                        {subrubro.subrubro}
                      </TableCell>
                      <TableCell>
                        <Badge variant={subrubro.empresa === 'Cromo' ? 'default' : 'secondary'}>
                          {subrubro.empresa}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{subrubro.total_productos}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(subrubro.facturacion)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(subrubro.margen_bruto)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(subrubro.gasto_total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={subrubro.gasto_sobre_venta_pct > 100 ? 'text-red-600 font-medium' : ''}>
                          {subrubro.gasto_sobre_venta_pct.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={subrubro.markup_min > 100 ? 'text-amber-600 font-medium' : ''}>
                          {(subrubro.markup_min || 0).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium ${subrubro.en_perdida ? 'text-red-600' : 'text-green-600'}`}
                        >
                          {formatCurrency(subrubro.resultado)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            href={`/productos?subrubro_id=${subrubro.subrubro_id}&empresa=${subrubro.empresa}`}
                          >
                            Ver productos
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

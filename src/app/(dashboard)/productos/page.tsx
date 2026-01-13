'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  ArrowUpDown,
  Eye,
  Package,
  AlertTriangle,
} from 'lucide-react';

interface ProductoRow {
  id: number;
  producto_id: number;
  codigo: string;
  nombre: string;
  empresa: string;
  subrubro: string;
  subrubro_id: number | null;
  proveedor: string;
  proveedor_id: number | null;
  importe_ventas: number;
  markup_pct: number;
  markup_minimo_pct: number;
  resultado: number;
  en_perdida: boolean;
}

interface PaginatedResponse {
  data: ProductoRow[];
  pagination: {
    total: number;
    page: number;
    pages: number;
    hasMore: boolean;
  };
  periodo: string;
}

function ProductosContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const [filters, setFilters] = useState({
    empresa: 'todas',
    estado: 'todos',
    busqueda: '',
    page: 1,
    orderBy: 'resultado',
    orderDir: 'asc',
    subrubro_id: null as string | null,
    proveedor_id: null as string | null,
  });

  // Initialize filters from URL params after mount
  useEffect(() => {
    const subrubroId = searchParams.get('subrubro_id');
    const proveedorId = searchParams.get('proveedor_id');
    const empresa = searchParams.get('empresa');

    setFilters(prev => ({
      ...prev,
      subrubro_id: subrubroId,
      proveedor_id: proveedorId,
      empresa: empresa || 'todas',
    }));
    setInitialized(true);
  }, [searchParams]);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.empresa !== 'todas') params.set('empresa', filters.empresa);
      if (filters.estado !== 'todos') params.set('estado', filters.estado);
      if (filters.busqueda) params.set('busqueda', filters.busqueda);
      if (filters.subrubro_id) params.set('subrubro_ids', filters.subrubro_id);
      if (filters.proveedor_id) params.set('proveedor_ids', filters.proveedor_id);
      params.set('page', String(filters.page));
      params.set('limit', '50');
      params.set('orderBy', filters.orderBy);
      params.set('orderDir', filters.orderDir);

      const response = await fetch(`/api/productos?${params}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching productos:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (initialized) {
      fetchProductos();
    }
  }, [fetchProductos, initialized]);

  const handleSort = (column: string) => {
    setFilters((prev) => ({
      ...prev,
      orderBy: column,
      orderDir: prev.orderBy === column && prev.orderDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  };

  const clearFilters = () => {
    setFilters({
      empresa: 'todas',
      estado: 'todos',
      busqueda: '',
      page: 1,
      orderBy: 'resultado',
      orderDir: 'asc',
      subrubro_id: null,
      proveedor_id: null,
    });
  };

  const formatCurrency = (num: number) => {
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const hasActiveFilters = filters.subrubro_id || filters.proveedor_id || filters.busqueda || filters.empresa !== 'todas' || filters.estado !== 'todos';

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
            <Package className="h-5 w-5 sm:h-6 sm:w-6" />
            Productos
          </h1>
          <p className="text-sm sm:text-base text-gray-500">
            {data?.pagination.total.toLocaleString() || 0} productos
            {data?.periodo && ` - ${new Date(data.periodo).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })}`}
          </p>
        </div>
        <Button variant="outline" size="sm" className="w-fit">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-4 sm:mb-6">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <Input
                placeholder="Buscar código o nombre..."
                value={filters.busqueda}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, busqueda: e.target.value, page: 1 }))
                }
                className="w-full sm:w-64"
              />
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Select
                value={filters.empresa}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, empresa: v, page: 1 }))}
              >
                <SelectTrigger className="w-24 sm:w-32">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="Cromo">Cromo</SelectItem>
                  <SelectItem value="BBA">BBA</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.estado}
                onValueChange={(v) => setFilters((prev) => ({ ...prev, estado: v, page: 1 }))}
              >
                <SelectTrigger className="w-28 sm:w-36">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="perdida">En Pérdida</SelectItem>
                  <SelectItem value="beneficio">En Beneficio</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs sm:text-sm">
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {/* Active filter badges */}
          {(filters.subrubro_id || filters.proveedor_id) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {filters.subrubro_id && (
                <Badge variant="secondary" className="text-xs">
                  Subrubro filtrado
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, subrubro_id: null, page: 1 }))}
                    className="ml-1 hover:text-red-500"
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filters.proveedor_id && (
                <Badge variant="secondary" className="text-xs">
                  Proveedor filtrado
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, proveedor_id: null, page: 1 }))}
                    className="ml-1 hover:text-red-500"
                  >
                    ×
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Lista de Productos</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Producto</TableHead>
                      <TableHead className="hidden sm:table-cell">Emp.</TableHead>
                      <TableHead className="hidden lg:table-cell">Subrubro</TableHead>
                      <TableHead className="hidden md:table-cell">Proveedor</TableHead>
                      <TableHead
                        className="cursor-pointer text-right"
                        onClick={() => handleSort('ventas')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span className="hidden sm:inline">Ventas</span>
                          <span className="sm:hidden">Vtas</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer text-right"
                        onClick={() => handleSort('markup')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          MU
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Mín</TableHead>
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
                    {data?.data.map((producto) => {
                      const markupOk = producto.markup_pct >= producto.markup_minimo_pct;
                      return (
                        <TableRow
                          key={producto.id}
                          className={producto.en_perdida ? 'bg-red-50' : ''}
                        >
                          <TableCell className="max-w-[120px] sm:max-w-[200px]">
                            <Link
                              href={`/productos/${producto.producto_id}`}
                              className="block hover:text-blue-600"
                            >
                              <div className="font-mono text-xs text-gray-500">{producto.codigo}</div>
                              <div className="truncate text-sm font-medium" title={producto.nombre}>
                                {producto.nombre}
                              </div>
                              <div className="sm:hidden text-xs text-gray-500">{producto.empresa}</div>
                            </Link>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={producto.empresa === 'Cromo' ? 'default' : 'secondary'} className="text-xs">
                              {producto.empresa}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-gray-600 max-w-[150px] truncate">
                            {producto.subrubro}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-gray-600 max-w-[120px] truncate">
                            {producto.proveedor}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(producto.importe_ventas)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`text-sm font-medium ${markupOk ? 'text-green-600' : 'text-red-600'}`}>
                              {producto.markup_pct.toFixed(0)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right hidden sm:table-cell text-sm text-gray-500">
                            {producto.markup_minimo_pct.toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!markupOk && (
                                <AlertTriangle className="h-3 w-3 text-amber-500 hidden sm:block" />
                              )}
                              <span className={`text-sm font-medium ${producto.en_perdida ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(producto.resultado)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center hidden sm:table-cell">
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                              <Link href={`/productos/${producto.producto_id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data && data.pagination.pages > 1 && (
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 pb-4 sm:px-0 sm:pb-0">
                  <p className="text-xs sm:text-sm text-gray-500">
                    {(data.pagination.page - 1) * 50 + 1} - {Math.min(data.pagination.page * 50, data.pagination.total)} de {data.pagination.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                      disabled={data.pagination.page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline ml-1">Anterior</span>
                    </Button>
                    <span className="flex items-center px-2 text-sm text-gray-600">
                      {data.pagination.page} / {data.pagination.pages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                      disabled={!data.pagination.hasMore}
                    >
                      <span className="hidden sm:inline mr-1">Siguiente</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductosLoading() {
  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Card className="mb-4">
        <CardContent className="p-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProductosPage() {
  return (
    <Suspense fallback={<ProductosLoading />}>
      <ProductosContent />
    </Suspense>
  );
}

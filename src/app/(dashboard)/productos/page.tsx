'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

interface ProductoRow {
  id: number;
  producto_id: number;
  codigo: string;
  nombre: string;
  empresa: string;
  subrubro: string;
  proveedor: string;
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

export default function ProductosPage() {
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    empresa: 'todas',
    estado: 'todos',
    busqueda: '',
    page: 1,
    orderBy: 'resultado',
    orderDir: 'asc',
  });

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.empresa !== 'todas') params.set('empresa', filters.empresa);
      if (filters.estado !== 'todos') params.set('estado', filters.estado);
      if (filters.busqueda) params.set('busqueda', filters.busqueda);
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
    fetchProductos();
  }, [fetchProductos]);

  const handleSort = (column: string) => {
    setFilters((prev) => ({
      ...prev,
      orderBy: column,
      orderDir: prev.orderBy === column && prev.orderDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  };

  const formatCurrency = (num: number) => {
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-gray-500">
            {data?.pagination.total.toLocaleString() || 0} productos en el período
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por código o nombre..."
                value={filters.busqueda}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, busqueda: e.target.value, page: 1 }))
                }
                className="w-64"
              />
            </div>

            <Select
              value={filters.empresa}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, empresa: v, page: 1 }))}
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

            <Select
              value={filters.estado}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, estado: v, page: 1 }))}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="perdida">En Pérdida</SelectItem>
                <SelectItem value="beneficio">En Beneficio</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              onClick={() =>
                setFilters({
                  empresa: 'todas',
                  estado: 'todos',
                  busqueda: '',
                  page: 1,
                  orderBy: 'resultado',
                  orderDir: 'asc',
                })
              }
            >
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Productos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="max-w-[200px]">Producto</TableHead>
                    <TableHead>Subrubro</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('ventas')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Ventas
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => handleSort('markup')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Markup
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Mín. Requerido</TableHead>
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
                  {data?.data.map((producto) => (
                    <TableRow
                      key={producto.id}
                      className={producto.en_perdida ? 'bg-red-50' : ''}
                    >
                      <TableCell>
                        <Badge variant={producto.empresa === 'Cromo' ? 'default' : 'secondary'}>
                          {producto.empresa}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{producto.codigo}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={producto.nombre}>
                        {producto.nombre}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{producto.subrubro}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-sm text-gray-600">
                        {producto.proveedor}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(producto.importe_ventas)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            producto.markup_pct >= producto.markup_minimo_pct
                              ? 'text-green-600'
                              : 'text-red-600'
                          }
                        >
                          {producto.markup_pct.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-gray-500">
                        {producto.markup_minimo_pct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium ${producto.en_perdida ? 'text-red-600' : 'text-green-600'}`}
                        >
                          {formatCurrency(producto.resultado)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/productos/${producto.producto_id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.pagination.pages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Mostrando {(data.pagination.page - 1) * 50 + 1} a{' '}
                    {Math.min(data.pagination.page * 50, data.pagination.total)} de{' '}
                    {data.pagination.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                      disabled={data.pagination.page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                      disabled={!data.pagination.hasMore}
                    >
                      Siguiente
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

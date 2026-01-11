'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ArrowUpDown, FolderTree } from 'lucide-react';
import Link from 'next/link';

interface SubrubroData {
  subrubro_id: number;
  subrubro: string;
  empresa: string;
  total_productos: number;
  total_proveedores: number;
  total_ventas: number;
  total_costo: number;
  resultado: number;
  markup_promedio: number;
  productos_perdida: number;
}

export default function SubrubrosPage() {
  const [data, setData] = useState<SubrubroData[]>([]);
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

      const response = await fetch(`/api/dashboard?${params}`);
      const dashboardData = await response.json();

      // Combinar top peores y mejores
      const allSubrubros = [
        ...(dashboardData.top_peores || []),
        ...(dashboardData.top_mejores || []),
      ];

      // Eliminar duplicados
      const uniqueSubrubros = Array.from(
        new Map(
          allSubrubros.map((s: SubrubroData) => [`${s.subrubro}-${s.empresa}`, s])
        ).values()
      );

      setData(uniqueSubrubros as SubrubroData[]);
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
      if (filters.orderBy === 'resultado') {
        return (a.resultado - b.resultado) * mult;
      }
      if (filters.orderBy === 'productos') {
        return (a.total_productos - b.total_productos) * mult;
      }
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FolderTree className="h-6 w-6" />
          Análisis por Subrubro
        </h1>
        <p className="text-gray-500">Rentabilidad agregada por categoría de producto</p>
      </div>

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
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Markup Prom.</TableHead>
                  <TableHead className="text-right">En Pérdida</TableHead>
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
                    className={subrubro.resultado < 0 ? 'bg-red-50' : ''}
                  >
                    <TableCell className="font-medium">{subrubro.subrubro}</TableCell>
                    <TableCell>
                      <Badge variant={subrubro.empresa === 'Cromo' ? 'default' : 'secondary'}>
                        {subrubro.empresa}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{subrubro.total_productos}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(subrubro.total_ventas || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(subrubro.markup_promedio || 0).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-red-600">{subrubro.productos_perdida || 0}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-medium ${subrubro.resultado < 0 ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {formatCurrency(subrubro.resultado)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`/productos?subrubro_ids=${subrubro.subrubro_id}&empresa=${subrubro.empresa}`}
                        >
                          Ver productos
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Search, ArrowUpDown, Truck } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface ProveedorData {
  id: number;
  codigo: string;
  nombre: string;
  total_productos: number;
  total_ventas: number;
  resultado: number;
  markup_promedio: number;
  productos_perdida: number;
}

export default function ProveedoresPage() {
  const [data, setData] = useState<ProveedorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    busqueda: '',
    orderBy: 'resultado',
    orderDir: 'asc' as 'asc' | 'desc',
  });

  const fetchProveedores = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Obtener proveedores con estadísticas agregadas
      const { data: proveedores } = await supabase
        .from('proveedores')
        .select(`
          id,
          codigo,
          nombre,
          productos:productos(count)
        `)
        .eq('activo', true)
        .limit(100);

      // Por ahora mostrar proveedores básicos
      // En producción esto vendría de una vista materializada
      const formattedData: ProveedorData[] = (proveedores || []).map((p) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        total_productos: (p.productos as unknown as { count: number }[])?.[0]?.count || 0,
        total_ventas: 0,
        resultado: 0,
        markup_promedio: 0,
        productos_perdida: 0,
      }));

      setData(formattedData);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const filteredData = data
    .filter((p) => {
      if (filters.busqueda) {
        return (
          p.nombre.toLowerCase().includes(filters.busqueda.toLowerCase()) ||
          p.codigo.toLowerCase().includes(filters.busqueda.toLowerCase())
        );
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
      if (filters.orderBy === 'nombre') {
        return a.nombre.localeCompare(b.nombre) * mult;
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
          <Truck className="h-6 w-6" />
          Análisis por Proveedor
        </h1>
        <p className="text-gray-500">Rentabilidad agregada por proveedor</p>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar proveedor..."
                value={filters.busqueda}
                onChange={(e) => setFilters((prev) => ({ ...prev, busqueda: e.target.value }))}
                className="w-64"
              />
            </div>

            <Select
              value={filters.orderBy}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, orderBy: v }))}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nombre">Nombre</SelectItem>
                <SelectItem value="productos">Productos</SelectItem>
                <SelectItem value="resultado">Resultado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle>Proveedores ({filteredData.length})</CardTitle>
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
                  <TableHead>Código</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('nombre')}
                  >
                    <div className="flex items-center gap-1">
                      Proveedor
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
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
                {filteredData.slice(0, 50).map((proveedor) => (
                  <TableRow
                    key={proveedor.id}
                    className={proveedor.resultado < 0 ? 'bg-red-50' : ''}
                  >
                    <TableCell className="font-mono text-sm">{proveedor.codigo}</TableCell>
                    <TableCell className="max-w-[300px] truncate font-medium" title={proveedor.nombre}>
                      {proveedor.nombre}
                    </TableCell>
                    <TableCell className="text-right">{proveedor.total_productos}</TableCell>
                    <TableCell className="text-right">{formatCurrency(proveedor.total_ventas)}</TableCell>
                    <TableCell className="text-right">{proveedor.markup_promedio.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      {proveedor.productos_perdida > 0 ? (
                        <Badge variant="destructive">{proveedor.productos_perdida}</Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-medium ${proveedor.resultado < 0 ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {formatCurrency(proveedor.resultado)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/productos?proveedor_ids=${proveedor.id}`}>Ver productos</Link>
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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowUpDown,
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  Package,
  DollarSign,
  Boxes,
  CreditCard,
  Truck,
  Receipt,
  Search,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

// Tipos
interface ProductoDetalle {
  id: number;
  codigo: string;
  nombre: string;
  empresa: string;
  proveedor: string;
  proveedor_id: number | null;
  importe_ventas: number;
  importe_costo: number;
  margen_bruto: number;
  markup_pct: number;
  stock_unidades: number;
  stock_costo: number;
  stock_volumen: number;
  unidades_vendidas: number;
  veces_pedido: number;
  gasto_facturacion: number;
  gasto_volumen: number;
  gasto_credito: number;
  gasto_markup: number;
  gasto_movimiento: number;
  gasto_total: number;
  resultado: number;
  en_perdida: boolean;
  markup_minimo_pct: number;
  cumple_objetivo: boolean;
}

interface AccionSugerida {
  tipo: string;
  prioridad: 'alta' | 'media' | 'baja';
  descripcion: string;
  impacto_estimado: number;
  productos_afectados: number;
  detalle: string;
}

interface SubrubroDetailData {
  periodo: string;
  empresa: string;
  subrubro: {
    id: number;
    nombre: string;
  };
  totales: {
    total_productos: number;
    importe_ventas: number;
    importe_costo: number;
    margen_bruto: number;
    stock_costo: number;
    stock_volumen: number;
    unidades_vendidas: number;
    veces_pedido: number;
    gasto_facturacion: number;
    gasto_volumen: number;
    gasto_credito: number;
    gasto_markup: number;
    gasto_movimiento: number;
    gasto_total: number;
    resultado: number;
    productos_perdida: number;
    markup_promedio: number;
    markup_minimo_promedio: number;
    en_perdida: boolean;
  };
  gastos_periodo: {
    facturacion: number;
    ocupacion: number;
    credito: number;
    rentabilidad: number;
    movimiento: number;
    total: number;
  };
  productos: ProductoDetalle[];
  acciones_sugeridas: AccionSugerida[];
}

type SortColumn =
  | 'nombre'
  | 'importe_ventas'
  | 'importe_costo'
  | 'margen_bruto'
  | 'markup_pct'
  | 'stock_costo'
  | 'stock_volumen'
  | 'unidades_vendidas'
  | 'veces_pedido'
  | 'gasto_total'
  | 'resultado';

export default function SubrubroDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const subrubroId = params.id as string;
  const empresaParam = searchParams.get('empresa') || 'todas';

  const [data, setData] = useState<SubrubroDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros y ordenamiento
  const [busqueda, setBusqueda] = useState('');
  const [soloEnPerdida, setSoloEnPerdida] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('resultado');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (empresaParam !== 'todas') params.set('empresa', empresaParam);

      const response = await fetch(`/api/subrubros/${subrubroId}?${params}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error obteniendo datos');
      }
      const result: SubrubroDetailData = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [subrubroId, empresaParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrado y ordenamiento de productos
  const productosFiltrados = data?.productos
    .filter((p) => {
      if (busqueda) {
        const searchLower = busqueda.toLowerCase();
        return (
          p.nombre.toLowerCase().includes(searchLower) ||
          p.codigo.toLowerCase().includes(searchLower) ||
          p.proveedor.toLowerCase().includes(searchLower)
        );
      }
      return true;
    })
    .filter((p) => {
      if (soloEnPerdida) return p.en_perdida;
      return true;
    })
    .sort((a, b) => {
      const mult = sortDirection === 'asc' ? 1 : -1;
      const valA = a[sortColumn];
      const valB = b[sortColumn];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * mult;
      }
      return ((valA as number) - (valB as number)) * mult;
    }) || [];

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'resultado' ? 'asc' : 'desc');
    }
  };

  const formatCurrency = (num: number) => {
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatNumber = (num: number, decimals = 0) => {
    return num.toLocaleString('es-AR', { maximumFractionDigits: decimals });
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 lg:p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600">{error || 'No se encontraron datos'}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/subrubros">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a Subrubros
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { totales, subrubro, acciones_sugeridas } = data;

  // Calcular porcentajes de cada grupo de gastos
  const gastosDesglosados = [
    {
      nombre: 'Facturación',
      icono: Receipt,
      valor: totales.gasto_facturacion,
      pct: totales.gasto_total > 0 ? (totales.gasto_facturacion / totales.gasto_total) * 100 : 0,
      color: 'bg-blue-500',
    },
    {
      nombre: 'Ocupación',
      icono: Boxes,
      valor: totales.gasto_volumen,
      pct: totales.gasto_total > 0 ? (totales.gasto_volumen / totales.gasto_total) * 100 : 0,
      color: 'bg-amber-500',
    },
    {
      nombre: 'Crédito',
      icono: CreditCard,
      valor: totales.gasto_credito,
      pct: totales.gasto_total > 0 ? (totales.gasto_credito / totales.gasto_total) * 100 : 0,
      color: 'bg-purple-500',
    },
    {
      nombre: 'Rentabilidad',
      icono: DollarSign,
      valor: totales.gasto_markup,
      pct: totales.gasto_total > 0 ? (totales.gasto_markup / totales.gasto_total) * 100 : 0,
      color: 'bg-green-500',
    },
    {
      nombre: 'Movimiento',
      icono: Truck,
      valor: totales.gasto_movimiento,
      pct: totales.gasto_total > 0 ? (totales.gasto_movimiento / totales.gasto_total) * 100 : 0,
      color: 'bg-orange-500',
    },
  ];

  const prioridadColor = {
    alta: 'bg-red-100 text-red-800 border-red-200',
    media: 'bg-amber-100 text-amber-800 border-amber-200',
    baja: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const prioridadIcon = {
    alta: <AlertTriangle className="h-4 w-4" />,
    media: <Lightbulb className="h-4 w-4" />,
    baja: <CheckCircle2 className="h-4 w-4" />,
  };

  return (
    <div className="p-3 lg:p-4 space-y-4">
      {/* Header compacto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Link href="/subrubros">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg lg:text-xl font-bold leading-tight">{subrubro.nombre}</h1>
            <p className="text-xs text-gray-500">
              {new Date(data.periodo).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
              {empresaParam !== 'todas' && ` • ${empresaParam}`}
            </p>
          </div>
        </div>
        <Badge variant={totales.en_perdida ? 'destructive' : 'default'} className="text-base px-3 py-1 self-start sm:self-auto">
          {totales.en_perdida ? <TrendingDown className="h-4 w-4 mr-1" /> : <TrendingUp className="h-4 w-4 mr-1" />}
          {formatCurrency(totales.resultado)}
        </Badge>
      </div>

      {/* FILA 1: KPIs principales en horizontal */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
        <Card className="p-3">
          <p className="text-xs text-gray-500 mb-1">Ventas</p>
          <p className="text-lg font-bold">{formatCurrency(totales.importe_ventas)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500 mb-1">Margen Bruto</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(totales.margen_bruto)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500 mb-1">Gastos</p>
          <p className="text-lg font-bold text-red-600">{formatCurrency(totales.gasto_total)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500 mb-1">Resultado</p>
          <p className={`text-lg font-bold ${totales.en_perdida ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(totales.resultado)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500 mb-1">MU Actual</p>
          <p className="text-lg font-bold">{totales.markup_promedio.toFixed(1)}%</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500 mb-1">MU Mínimo</p>
          <p className="text-lg font-bold text-amber-600">{totales.markup_minimo_promedio.toFixed(1)}%</p>
        </Card>
      </div>

      {/* FILA 2: Stock + Gastos | Acciones Sugeridas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Stock y Desglose de Gastos combinados */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Stock */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Stock
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-purple-100">
                        <DollarSign className="h-3 w-3 text-purple-600" />
                      </div>
                      <span className="text-xs text-gray-600">Capital</span>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(totales.stock_costo)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-amber-100">
                        <Boxes className="h-3 w-3 text-amber-600" />
                      </div>
                      <span className="text-xs text-gray-600">Volumen</span>
                    </div>
                    <span className="text-sm font-semibold">{formatNumber(totales.stock_volumen, 2)} m³</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-blue-100">
                        <Truck className="h-3 w-3 text-blue-600" />
                      </div>
                      <span className="text-xs text-gray-600">Movimientos</span>
                    </div>
                    <span className="text-sm font-semibold">{formatNumber(totales.veces_pedido)}</span>
                  </div>
                </div>
              </div>

              {/* Desglose de Gastos */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Desglose Gastos</h3>
                <div className="space-y-2">
                  {gastosDesglosados.map((gasto) => (
                    <div key={gasto.nombre} className="flex items-center gap-2">
                      <gasto.icono className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${gasto.color} transition-all`}
                          style={{ width: `${Math.min(gasto.pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-16 text-right">{formatCurrency(gasto.valor)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t flex items-center justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(totales.gasto_total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Productos resumen */}
            <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Package className="h-4 w-4 text-gray-400" />
                  <strong>{totales.total_productos}</strong> productos
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {totales.productos_perdida} en pérdida
                </span>
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {totales.total_productos - totales.productos_perdida} rentables
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Acciones Sugeridas */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Acciones Sugeridas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {acciones_sugeridas.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No hay acciones sugeridas</p>
            ) : (
              <div className="space-y-2 max-h-[140px] overflow-y-auto">
                {acciones_sugeridas.slice(0, 3).map((accion, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border ${prioridadColor[accion.prioridad]} flex items-start justify-between gap-2`}
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {prioridadIcon[accion.prioridad]}
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{accion.descripcion}</p>
                        <p className="text-xs opacity-75 mt-0.5">{accion.productos_afectados} productos</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-green-700">+{formatCurrency(accion.impacto_estimado)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FILA 3: Tabla de Productos a ancho completo */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Productos ({productosFiltrados.length})
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-8 h-8 w-40 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="solo-perdida"
                  checked={soloEnPerdida}
                  onCheckedChange={setSoloEnPerdida}
                  className="scale-90"
                />
                <Label htmlFor="solo-perdida" className="text-xs cursor-pointer whitespace-nowrap">
                  Solo pérdidas
                </Label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-480px)] min-h-[300px]">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow className="text-xs">
                  <TableHead
                    className="min-w-[200px] cursor-pointer py-2"
                    onClick={() => handleSort('nombre')}
                  >
                    <div className="flex items-center gap-1">
                      Producto
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2"
                    onClick={() => handleSort('importe_ventas')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Ventas
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2"
                    onClick={() => handleSort('stock_costo')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Stock $
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2 hidden md:table-cell"
                    onClick={() => handleSort('stock_volumen')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      m³
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2 hidden lg:table-cell"
                    onClick={() => handleSort('veces_pedido')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Pedidos
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2 hidden lg:table-cell"
                    onClick={() => handleSort('unidades_vendidas')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Uds
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2"
                    onClick={() => handleSort('markup_pct')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      MU%
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2 hidden sm:table-cell"
                    onClick={() => handleSort('gasto_total')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Gasto
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer py-2"
                    onClick={() => handleSort('resultado')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Resultado
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No hay productos que coincidan con los filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  productosFiltrados.map((producto) => (
                    <TableRow
                      key={producto.id}
                      className={producto.en_perdida ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
                    >
                      <TableCell className="py-2">
                        <div className="truncate font-medium text-sm" title={producto.nombre}>
                          {producto.nombre}
                        </div>
                        <div className="text-xs text-gray-500 truncate" title={producto.proveedor}>
                          {producto.codigo} • {producto.proveedor}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm py-2">
                        {formatCurrency(producto.importe_ventas)}
                      </TableCell>
                      <TableCell className="text-right text-sm py-2">
                        {formatCurrency(producto.stock_costo)}
                      </TableCell>
                      <TableCell className="text-right text-sm py-2 hidden md:table-cell">
                        {producto.stock_volumen.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm py-2 hidden lg:table-cell">
                        {producto.veces_pedido}
                      </TableCell>
                      <TableCell className="text-right text-sm py-2 hidden lg:table-cell">
                        {formatNumber(producto.unidades_vendidas)}
                      </TableCell>
                      <TableCell className="text-right py-2">
                        <div className="flex flex-col items-end">
                          <span
                            className={`text-sm font-medium ${
                              producto.markup_pct >= producto.markup_minimo_pct
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {producto.markup_pct.toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-gray-400">
                            min: {producto.markup_minimo_pct.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm py-2 hidden sm:table-cell">
                        {formatCurrency(producto.gasto_total)}
                      </TableCell>
                      <TableCell className="text-right py-2">
                        <span
                          className={`text-sm font-semibold ${
                            producto.en_perdida ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {formatCurrency(producto.resultado)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

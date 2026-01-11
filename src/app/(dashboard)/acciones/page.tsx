'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ClipboardList, Plus, Check, Trash2, Search } from 'lucide-react';

interface Accion {
  id: number;
  producto_id: number | null;
  subrubro_id: number | null;
  proveedor_id: number | null;
  periodo: string;
  tipo_accion: string;
  descripcion: string;
  impacto_estimado: number | null;
  estado: 'pendiente' | 'en_proceso' | 'completada';
  fecha_creacion: string;
  producto?: { codigo: string; nombre: string; empresa: string } | null;
  subrubro?: { nombre: string } | null;
  proveedor?: { nombre: string } | null;
}

export default function AccionesPage() {
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    estado: '',
    busqueda: '',
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccion, setNewAccion] = useState({
    tipo_accion: 'subir_markup',
    descripcion: '',
    impacto_estimado: '',
    periodo: new Date().toISOString().slice(0, 7) + '-01',
  });

  const fetchAcciones = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.estado) params.set('estado', filters.estado);

      const response = await fetch(`/api/acciones?${params}`);
      const data = await response.json();
      setAcciones(data.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.estado]);

  useEffect(() => {
    fetchAcciones();
  }, [fetchAcciones]);

  const handleCreateAccion = async () => {
    try {
      const response = await fetch('/api/acciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newAccion,
          impacto_estimado: newAccion.impacto_estimado
            ? parseFloat(newAccion.impacto_estimado)
            : null,
        }),
      });

      if (response.ok) {
        setIsDialogOpen(false);
        setNewAccion({
          tipo_accion: 'subir_markup',
          descripcion: '',
          impacto_estimado: '',
          periodo: new Date().toISOString().slice(0, 7) + '-01',
        });
        fetchAcciones();
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleUpdateEstado = async (id: number, estado: string) => {
    try {
      await fetch('/api/acciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado }),
      });
      fetchAcciones();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar esta acción?')) return;

    try {
      await fetch(`/api/acciones?id=${id}`, { method: 'DELETE' });
      fetchAcciones();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const formatCurrency = (num: number | null) => {
    if (num === null) return '-';
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    return `$${num.toLocaleString()}`;
  };

  const estadoColors = {
    pendiente: 'bg-amber-100 text-amber-800',
    en_proceso: 'bg-blue-100 text-blue-800',
    completada: 'bg-green-100 text-green-800',
  };

  const tipoLabels: Record<string, string> = {
    subir_markup: 'Subir Mark-up',
    reducir_stock: 'Reducir Stock',
    evaluar_proveedor: 'Evaluar Proveedor',
    otro: 'Otro',
  };

  const filteredAcciones = acciones.filter((a) => {
    if (filters.busqueda) {
      const searchLower = filters.busqueda.toLowerCase();
      return (
        a.descripcion.toLowerCase().includes(searchLower) ||
        a.producto?.nombre?.toLowerCase().includes(searchLower) ||
        a.subrubro?.nombre?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  // Resumen
  const resumen = {
    pendientes: acciones.filter((a) => a.estado === 'pendiente').length,
    en_proceso: acciones.filter((a) => a.estado === 'en_proceso').length,
    completadas: acciones.filter((a) => a.estado === 'completada').length,
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClipboardList className="h-6 w-6" />
            Acciones Correctivas
          </h1>
          <p className="text-gray-500">Seguimiento de acciones para mejorar rentabilidad</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Acción
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nueva Acción</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Tipo de Acción</Label>
                <Select
                  value={newAccion.tipo_accion}
                  onValueChange={(v) => setNewAccion((prev) => ({ ...prev, tipo_accion: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subir_markup">Subir Mark-up</SelectItem>
                    <SelectItem value="reducir_stock">Reducir Stock</SelectItem>
                    <SelectItem value="evaluar_proveedor">Evaluar Proveedor</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descripción</Label>
                <Input
                  value={newAccion.descripcion}
                  onChange={(e) =>
                    setNewAccion((prev) => ({ ...prev, descripcion: e.target.value }))
                  }
                  placeholder="Describir la acción a realizar..."
                />
              </div>
              <div>
                <Label>Impacto Estimado ($)</Label>
                <Input
                  type="number"
                  value={newAccion.impacto_estimado}
                  onChange={(e) =>
                    setNewAccion((prev) => ({ ...prev, impacto_estimado: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <Button onClick={handleCreateAccion} className="w-full">
                Crear Acción
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Resumen */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Pendientes</span>
              <Badge className={estadoColors.pendiente}>{resumen.pendientes}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">En Proceso</span>
              <Badge className={estadoColors.en_proceso}>{resumen.en_proceso}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Completadas</span>
              <Badge className={estadoColors.completada}>{resumen.completadas}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar..."
                value={filters.busqueda}
                onChange={(e) => setFilters((prev) => ({ ...prev, busqueda: e.target.value }))}
                className="w-64"
              />
            </div>

            <Select
              value={filters.estado}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, estado: v }))}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_proceso">En Proceso</SelectItem>
                <SelectItem value="completada">Completada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones ({filteredAcciones.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filteredAcciones.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No hay acciones registradas. Cree una nueva acción o espere a que el sistema genere
              recomendaciones automáticas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Producto/Subrubro</TableHead>
                  <TableHead className="text-right">Impacto Est.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAcciones.map((accion) => (
                  <TableRow key={accion.id}>
                    <TableCell>
                      <Badge variant="outline">{tipoLabels[accion.tipo_accion] || accion.tipo_accion}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate" title={accion.descripcion}>
                        {accion.descripcion}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {accion.producto?.nombre ||
                        accion.subrubro?.nombre ||
                        accion.proveedor?.nombre ||
                        '-'}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatCurrency(accion.impacto_estimado)}
                    </TableCell>
                    <TableCell>
                      <Badge className={estadoColors[accion.estado]}>{accion.estado}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(accion.fecha_creacion).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        {accion.estado !== 'completada' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateEstado(accion.id, 'completada')}
                            title="Marcar como completada"
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(accion.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
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

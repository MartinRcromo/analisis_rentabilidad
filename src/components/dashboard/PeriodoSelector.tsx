'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronDown } from 'lucide-react';

interface PeriodoDisponible {
  anio: number;
  mes: number;
  periodo: string;
}

interface PeriodoSelectorProps {
  periodosDisponibles: PeriodoDisponible[];
  anioSeleccionado: string;
  mesesSeleccionados: number[];
  onAnioChange: (anio: string) => void;
  onMesesChange: (meses: number[]) => void;
}

const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export function PeriodoSelector({
  periodosDisponibles,
  anioSeleccionado,
  mesesSeleccionados,
  onAnioChange,
  onMesesChange,
}: PeriodoSelectorProps) {
  const [open, setOpen] = useState(false);

  // Obtener años únicos
  const aniosDisponibles = [...new Set(periodosDisponibles.map((p) => p.anio))].sort((a, b) => b - a);

  // Obtener meses disponibles para el año seleccionado
  const mesesDisponibles = periodosDisponibles
    .filter((p) => p.anio === parseInt(anioSeleccionado))
    .map((p) => p.mes)
    .sort((a, b) => a - b);

  // Cuando cambia el año, seleccionar el mes más reciente disponible
  useEffect(() => {
    if (mesesDisponibles.length > 0 && mesesSeleccionados.length === 0) {
      const ultimoMes = Math.max(...mesesDisponibles);
      onMesesChange([ultimoMes]);
    }
  }, [anioSeleccionado, mesesDisponibles, mesesSeleccionados.length, onMesesChange]);

  const handleMesToggle = (mes: number) => {
    if (mesesSeleccionados.includes(mes)) {
      // No permitir deseleccionar si es el único mes seleccionado
      if (mesesSeleccionados.length > 1) {
        onMesesChange(mesesSeleccionados.filter((m) => m !== mes));
      }
    } else {
      onMesesChange([...mesesSeleccionados, mes].sort((a, b) => a - b));
    }
  };

  const handleSelectAll = () => {
    onMesesChange([...mesesDisponibles]);
  };

  const handleSelectNone = () => {
    if (mesesDisponibles.length > 0) {
      // Seleccionar solo el mes más reciente
      const ultimoMes = Math.max(...mesesDisponibles);
      onMesesChange([ultimoMes]);
    }
  };

  // Formatear display de meses seleccionados
  const formatMesesDisplay = () => {
    if (mesesSeleccionados.length === 0) return 'Seleccionar meses';
    if (mesesSeleccionados.length === 1) return MESES_NOMBRES[mesesSeleccionados[0] - 1];
    if (mesesSeleccionados.length === mesesDisponibles.length) return 'Todos los meses';
    return mesesSeleccionados.map((m) => MESES_CORTOS[m - 1]).join(', ');
  };

  return (
    <div className="flex items-center gap-2">
      {/* Selector de Año */}
      <Select value={anioSeleccionado} onValueChange={onAnioChange}>
        <SelectTrigger className="w-24">
          <SelectValue placeholder="Año" />
        </SelectTrigger>
        <SelectContent>
          {aniosDisponibles.map((anio) => (
            <SelectItem key={anio} value={anio.toString()}>
              {anio}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Selector de Meses (Multi-select) */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-48 justify-between">
            <div className="flex items-center gap-2 truncate">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{formatMesesDisplay()}</span>
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <button
                type="button"
                onClick={handleSelectAll}
                className="hover:text-blue-600 hover:underline"
              >
                Seleccionar todos
              </button>
              <button
                type="button"
                onClick={handleSelectNone}
                className="hover:text-blue-600 hover:underline"
              >
                Solo último
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
                const disponible = mesesDisponibles.includes(mes);
                const seleccionado = mesesSeleccionados.includes(mes);
                return (
                  <div
                    key={mes}
                    className={`flex items-center space-x-2 p-1.5 rounded ${
                      !disponible ? 'opacity-40' : seleccionado ? 'bg-blue-50' : ''
                    }`}
                  >
                    <Checkbox
                      id={`mes-${mes}`}
                      checked={seleccionado}
                      disabled={!disponible}
                      onCheckedChange={() => disponible && handleMesToggle(mes)}
                    />
                    <Label
                      htmlFor={`mes-${mes}`}
                      className={`text-xs cursor-pointer ${!disponible ? 'cursor-not-allowed' : ''}`}
                    >
                      {MESES_CORTOS[mes - 1]}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

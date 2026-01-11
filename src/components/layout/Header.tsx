'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  periodo?: string;
  empresa?: string;
  periodos?: string[];
  onPeriodoChange?: (periodo: string) => void;
  onEmpresaChange?: (empresa: string) => void;
}

export function Header({
  periodo,
  empresa = 'todas',
  periodos = [],
  onPeriodoChange,
  onEmpresaChange,
}: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center gap-4">
        {/* Selector de período */}
        {periodos.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Período:</span>
            <Select value={periodo} onValueChange={onPeriodoChange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Seleccionar período" />
              </SelectTrigger>
              <SelectContent>
                {periodos.map((p) => (
                  <SelectItem key={p} value={p}>
                    {formatPeriodo(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Selector de empresa */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Empresa:</span>
          <Select value={empresa} onValueChange={onEmpresaChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="Cromo">Cromo</SelectItem>
              <SelectItem value="BBA">BBA</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Notificaciones */}
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>

        {/* Usuario */}
        <Button variant="ghost" size="icon">
          <User className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

function formatPeriodo(periodo: string): string {
  try {
    const date = new Date(periodo);
    return date.toLocaleDateString('es-AR', { year: 'numeric', month: 'long' });
  } catch {
    return periodo;
  }
}

'use client';

import {
  BarChart,
  Bar,
  Line,
  LineChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
} from 'recharts';

// Colores
const COLORS = {
  facturacion: '#3b82f6',
  volumen: '#8b5cf6',
  movimiento: '#ec4899',
  credito: '#f59e0b',
  rentabilidad: '#10b981',
  beneficio: '#22c55e',
  perdida: '#ef4444',
  resultado: '#3b82f6',
};

interface EvolucionData {
  periodo: string;
  beneficio: number;
  perdida: number;
  resultado: number;
}

interface EvolucionResultadoData {
  periodo: string;
  resultado: number;
}

interface DistribucionData {
  facturacion: number;
  volumen: number;
  movimiento: number;
  credito: number;
  rentabilidad: number;
}

// Gráfico de evolución (barras + línea)
export function EvolucionChart({ data }: { data: EvolucionData[] }) {
  const formattedData = data.map((d) => ({
    ...d,
    periodoLabel: formatPeriodoShort(d.periodo),
    beneficioM: d.beneficio / 1e6,
    perdidaM: Math.abs(d.perdida) / 1e6,
    resultadoM: d.resultado / 1e6,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="periodoLabel" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => `${v}M`} />
        <Tooltip
          formatter={(value: number | undefined) => value !== undefined ? [`$${value.toFixed(1)}M`, ''] : ['', '']}
          labelFormatter={(label) => `Período: ${label}`}
        />
        <Legend />
        <Bar dataKey="beneficioM" name="Beneficio" fill={COLORS.beneficio} />
        <Bar dataKey="perdidaM" name="Pérdida" fill={COLORS.perdida} />
        <Line
          type="monotone"
          dataKey="resultadoM"
          name="Resultado"
          stroke={COLORS.resultado}
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Gráfico de distribución de gastos (donut)
export function DistribucionGastosChart({ data }: { data: DistribucionData }) {
  const total = data.facturacion + data.volumen + data.movimiento + data.credito + data.rentabilidad;

  const pieData = [
    { name: 'Facturación', value: data.facturacion, color: COLORS.facturacion },
    { name: 'Volumen', value: data.volumen, color: COLORS.volumen },
    { name: 'Movimiento', value: data.movimiento, color: COLORS.movimiento },
    { name: 'Crédito', value: data.credito, color: COLORS.credito },
    { name: 'Rentabilidad', value: data.rentabilidad, color: COLORS.rentabilidad },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, value }) => `${name}: ${((value / total) * 100).toFixed(1)}%`}
          labelLine={false}
        >
          {pieData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number | undefined) => value !== undefined ? [`$${(value / 1e6).toFixed(1)}M`, ''] : ['', '']}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Gráfico de barras simple
export function SimpleBarChart({
  data,
  dataKey,
  nameKey = 'name',
  color = COLORS.beneficio,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey?: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" fontSize={12} tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} />
        <YAxis type="category" dataKey={nameKey} fontSize={12} width={150} />
        <Tooltip formatter={(value: number | undefined) => value !== undefined ? [`$${(value / 1e6).toFixed(1)}M`, ''] : ['', '']} />
        <Bar dataKey={dataKey} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Gráfico de líneas para evolución de producto
export function ProductoEvolucionChart({
  data,
}: {
  data: Array<{
    periodo: string;
    importe_ventas: number;
    resultado: number;
  }>;
}) {
  const formattedData = data.map((d) => ({
    periodo: formatPeriodoShort(d.periodo),
    ventas: d.importe_ventas / 1e6,
    resultado: d.resultado / 1e6,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="periodo" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => `${v}M`} />
        <Tooltip formatter={(value: number | undefined) => value !== undefined ? [`$${value.toFixed(2)}M`, ''] : ['', '']} />
        <Legend />
        <Bar dataKey="ventas" name="Ventas" fill={COLORS.facturacion} />
        <Line
          type="monotone"
          dataKey="resultado"
          name="Resultado"
          stroke={COLORS.resultado}
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Gráfico de evolución simplificado (solo línea de resultado)
export function EvolucionResultadoChart({ data }: { data: EvolucionResultadoData[] }) {
  const formattedData = data.map((d) => ({
    ...d,
    periodoLabel: formatPeriodoShort(d.periodo),
    resultadoM: d.resultado / 1e6,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="periodoLabel" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => `$${v}M`} />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <Tooltip
          formatter={(value: number | undefined) => value !== undefined ? [`$${value.toFixed(1)}M`, 'Resultado'] : ['', '']}
          labelFormatter={(label) => `Período: ${label}`}
        />
        <Line
          type="monotone"
          dataKey="resultadoM"
          name="Resultado"
          stroke={COLORS.resultado}
          strokeWidth={3}
          dot={{ r: 5, fill: COLORS.resultado }}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function formatPeriodoShort(periodo: string): string {
  try {
    const date = new Date(periodo);
    return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  } catch {
    return periodo;
  }
}

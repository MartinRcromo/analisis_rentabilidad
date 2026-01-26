import * as XLSX from 'xlsx';
import { GastoExcelRow } from '@/types/database';

interface GastosClasificados {
  facturacion: number;
  ocupacion: number; // Antes: volumen (alquiler, servicios, mantenimiento, seguros)
  movimiento: number; // Nuevo (sueldos logística, fletes, embalaje)
  credito: number;
  rentabilidad: number;
  sinClasificar: number;
}

interface ParseGastosResult {
  success: boolean;
  data: GastoExcelRow[];
  errors: string[];
  clasificados: GastosClasificados;
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    totalGastos: number;
    empresas: Record<string, number>;
    sectores: number;
    tiposGasto: number;
  };
}

// Columnas requeridas en el Excel
const REQUIRED_COLUMNS = [
  'gerencia',
  'sector',
  'tipogasto',
  'importe_gasto',
];

// Clasificación maestra por defecto (puede venir de la BD)
const CLASIFICACION_MAESTRA: Record<string, string> = {
  // Logística -> Volumen
  'logística|sueldos': 'Volumen',
  'logística|fletes': 'Volumen',
  'logística|alquileres': 'Volumen',
  'logística|servicios': 'Volumen',
  'logística|mantenimiento': 'Volumen',
  'logística|seguros': 'Volumen',

  // Administración -> Varía
  'administración y finanzas|iibb': 'Facturacion',
  'administración y finanzas|intereses bancarios': 'Credito',
  'administración y finanzas|intereses': 'Credito',
  'administración y finanzas|sueldos': 'Facturacion',
  'administración y finanzas|iigg': 'Rentabilidad',
  'administración y finanzas|impuesto a las ganancias': 'Rentabilidad',
  'administración y finanzas|honorarios': 'Facturacion',
  'administración y finanzas|servicios': 'Facturacion',

  // Comercial -> Facturación
  'comercial|sueldos': 'Facturacion',
  'comercial|comisiones': 'Facturacion',
  'comercial|publicidad': 'Facturacion',
  'comercial|marketing': 'Facturacion',
  'comercial|viáticos': 'Facturacion',

  // Sistemas -> Facturación
  'sistemas|sueldos': 'Facturacion',
  'sistemas|servicios': 'Facturacion',
  'sistemas|licencias': 'Facturacion',
};

export async function parseGastosExcel(
  buffer: ArrayBuffer,
  clasificacionMaestra?: Record<string, string>
): Promise<ParseGastosResult> {
  const errors: string[] = [];
  const data: GastoExcelRow[] = [];
  const clasificacion = clasificacionMaestra || CLASIFICACION_MAESTRA;

  const clasificados: GastosClasificados = {
    facturacion: 0,
    ocupacion: 0,
    movimiento: 0,
    credito: 0,
    rentabilidad: 0,
    sinClasificar: 0,
  };

  try {
    // Leer el Excel
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Usar la primera hoja
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convertir a JSON
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      raw: false,
      defval: '',
    });

    if (jsonData.length === 0) {
      return {
        success: false,
        data: [],
        errors: ['El archivo Excel de gastos está vacío'],
        clasificados,
        summary: {
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          totalGastos: 0,
          empresas: {},
          sectores: 0,
          tiposGasto: 0,
        },
      };
    }

    // Validar columnas
    const firstRow = jsonData[0];
    const existingColumns = Object.keys(firstRow).map((c) => c.toLowerCase());
    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !existingColumns.includes(col.toLowerCase())
    );

    if (missingColumns.length > 0) {
      errors.push(`Columnas faltantes: ${missingColumns.join(', ')}`);
    }

    // Tracking para resumen
    const empresasCount: Record<string, number> = {};
    const sectoresSet = new Set<string>();
    const tiposGastoSet = new Set<string>();
    let totalGastos = 0;
    let invalidRows = 0;

    // Procesar cada fila
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNum = i + 2;

      try {
        // Normalizar nombres de columnas
        const normalizedRow: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          normalizedRow[key.toLowerCase()] = value;
        }

        // Extraer valores
        const gerencia = String(normalizedRow['gerencia'] || '').trim();
        const sector = String(normalizedRow['sector'] || '').trim();
        const tipogasto = String(normalizedRow['tipogasto'] || '').trim();
        const proveedorgasto = String(normalizedRow['proveedorgasto'] || '').trim();
        const comprobante = String(normalizedRow['comprobante'] || '').trim();
        const idcomprobante = String(normalizedRow['idcomprobante'] || '').trim();
        const empresa = String(normalizedRow['empresa'] || '').trim();
        const empresatipo = String(normalizedRow['empresatipo'] || '').trim();
        const importe_gasto = parseNumber(normalizedRow['importe_gasto']);
        const periodo = String(normalizedRow['periodo'] || '').trim();

        // Obtener clasificación del Excel o calcularla
        let clasificacionValue = String(
          normalizedRow['clasificacion'] || normalizedRow['Clasificacion'] || ''
        ).trim();

        // Si no tiene clasificación, buscar en la maestra
        if (!clasificacionValue || clasificacionValue.toLowerCase() === 'sinclasificar') {
          const key = `${sector.toLowerCase()}|${tipogasto.toLowerCase()}`;
          clasificacionValue = clasificacion[key] || 'SinClasificar';
        }

        // Normalizar clasificación
        const clasificacionNormalizada = normalizeClasificacion(clasificacionValue);

        // Validaciones básicas
        if (importe_gasto === 0) {
          // Ignorar filas sin importe
          continue;
        }

        // Agregar a data
        const gastoRow: GastoExcelRow = {
          gerencia,
          sector,
          tipogasto,
          proveedorgasto,
          comprobante,
          idcomprobante,
          empresa,
          empresatipo,
          importe_gasto,
          periodo,
          Clasificacion: clasificacionNormalizada,
          'concatenar sector+tipogasto': `${sector}|${tipogasto}`,
        };

        data.push(gastoRow);

        // Clasificar el gasto (5 grupos)
        switch (clasificacionNormalizada.toLowerCase()) {
          case 'facturacion':
            clasificados.facturacion += importe_gasto;
            break;
          case 'ocupacion':
            clasificados.ocupacion += importe_gasto;
            break;
          case 'movimiento':
            clasificados.movimiento += importe_gasto;
            break;
          case 'credito':
            clasificados.credito += importe_gasto;
            break;
          case 'rentabilidad':
            clasificados.rentabilidad += importe_gasto;
            break;
          // Compatibilidad con clasificación anterior
          case 'volumen':
            // Si viene "Volumen" del sistema viejo, distribuir 50/50 entre ocupación y movimiento
            // O mejor: tratar como ocupación por defecto
            clasificados.ocupacion += importe_gasto;
            break;
          default:
            clasificados.sinClasificar += importe_gasto;
        }

        // Actualizar contadores
        if (empresa) empresasCount[empresa] = (empresasCount[empresa] || 0) + importe_gasto;
        if (sector) sectoresSet.add(sector);
        if (tipogasto) tiposGastoSet.add(tipogasto);
        totalGastos += importe_gasto;
      } catch (err) {
        errors.push(`Fila ${rowNum}: Error procesando - ${err}`);
        invalidRows++;
      }
    }

    return {
      success: errors.length === 0 || data.length > 0,
      data,
      errors,
      clasificados,
      summary: {
        totalRows: jsonData.length,
        validRows: data.length,
        invalidRows,
        totalGastos,
        empresas: empresasCount,
        sectores: sectoresSet.size,
        tiposGasto: tiposGastoSet.size,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: [],
      errors: [`Error leyendo Excel de gastos: ${err}`],
      clasificados,
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        totalGastos: 0,
        empresas: {},
        sectores: 0,
        tiposGasto: 0,
      },
    };
  }
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  const str = String(value).replace(/[,$\s]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function normalizeClasificacion(value: string): string {
  const normalized = value.toLowerCase().trim();

  if (normalized.includes('factur')) return 'Facturacion';
  if (normalized.includes('ocupacion') || normalized.includes('ocupación')) return 'Ocupacion';
  if (normalized.includes('movimiento')) return 'Movimiento';
  if (normalized.includes('credit') || normalized.includes('crédito')) return 'Credito';
  if (normalized.includes('rentab')) return 'Rentabilidad';
  // Compatibilidad: si viene "Volumen" del sistema viejo, tratar como Ocupacion
  if (normalized.includes('volumen')) return 'Ocupacion';

  return 'SinClasificar';
}

// Función para calcular gastos finales con distribución proporcional (5 grupos)
export function calcularGastosFinales(clasificados: GastosClasificados): {
  gastosBase: GastosClasificados;
  gastosFinales: {
    facturacion: number;
    ocupacion: number;
    movimiento: number;
    credito: number;
    rentabilidad: number;
  };
  pesos: {
    facturacion: number;
    ocupacion: number;
    movimiento: number;
    credito: number;
    rentabilidad: number;
  };
  totalClasificado: number;
  totalSinClasificar: number;
  totalGeneral: number;
} {
  // 1. Total clasificado (sin el "sin clasificar")
  const totalClasificado =
    clasificados.facturacion +
    clasificados.ocupacion +
    clasificados.movimiento +
    clasificados.credito +
    clasificados.rentabilidad;

  const totalSinClasificar = clasificados.sinClasificar;
  const totalGeneral = totalClasificado + totalSinClasificar;

  // 2. Calcular pesos de cada categoría
  const pesos = {
    facturacion: totalClasificado > 0 ? clasificados.facturacion / totalClasificado : 0.20,
    ocupacion: totalClasificado > 0 ? clasificados.ocupacion / totalClasificado : 0.20,
    movimiento: totalClasificado > 0 ? clasificados.movimiento / totalClasificado : 0.20,
    credito: totalClasificado > 0 ? clasificados.credito / totalClasificado : 0.20,
    rentabilidad: totalClasificado > 0 ? clasificados.rentabilidad / totalClasificado : 0.20,
  };

  // 3. Distribuir "sin clasificar" proporcionalmente
  const gastosFinales = {
    facturacion: clasificados.facturacion + pesos.facturacion * totalSinClasificar,
    ocupacion: clasificados.ocupacion + pesos.ocupacion * totalSinClasificar,
    movimiento: clasificados.movimiento + pesos.movimiento * totalSinClasificar,
    credito: clasificados.credito + pesos.credito * totalSinClasificar,
    rentabilidad: clasificados.rentabilidad + pesos.rentabilidad * totalSinClasificar,
  };

  return {
    gastosBase: { ...clasificados },
    gastosFinales,
    pesos,
    totalClasificado,
    totalSinClasificar,
    totalGeneral,
  };
}

import * as XLSX from 'xlsx';
import { VentaExcelRow } from '@/types/database';

interface ParseVentasResult {
  success: boolean;
  data: VentaExcelRow[];
  errors: string[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    totalVentas: number;
    totalCosto: number;
    empresas: Record<string, number>;
    subrubros: number;
    proveedores: number;
  };
}

// Columnas requeridas en el Excel
const REQUIRED_COLUMNS = [
  'periodo',
  'empresa',
  'subrubro',
  'idproducto',
  'producto',
  'idproveedor',
  'proveedor',
  'idcomprador',
  'idcategoria',
  'importe_costo',
  'stock_unidades',
  'stock_costo',
  'importe_Ventas',
  'stock_volumen',
];

export async function parseVentasExcel(buffer: ArrayBuffer): Promise<ParseVentasResult> {
  const errors: string[] = [];
  const data: VentaExcelRow[] = [];

  try {
    // Leer el Excel
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Buscar la hoja "Export" o usar la primera
    let sheetName = 'Export';
    if (!workbook.SheetNames.includes('Export')) {
      sheetName = workbook.SheetNames[0];
      console.log(`Hoja "Export" no encontrada, usando: ${sheetName}`);
    }

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
        errors: ['El archivo Excel está vacío'],
        summary: {
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
          totalVentas: 0,
          totalCosto: 0,
          empresas: {},
          subrubros: 0,
          proveedores: 0,
        },
      };
    }

    // Validar columnas
    const firstRow = jsonData[0];
    const existingColumns = Object.keys(firstRow);
    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !existingColumns.some((c) => c.toLowerCase() === col.toLowerCase())
    );

    if (missingColumns.length > 0) {
      errors.push(`Columnas faltantes: ${missingColumns.join(', ')}`);
    }

    // Tracking para resumen
    const empresasCount: Record<string, number> = {};
    const subrubrosSet = new Set<string>();
    const proveedoresSet = new Set<string>();
    let totalVentas = 0;
    let totalCosto = 0;
    let invalidRows = 0;

    // Procesar cada fila
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNum = i + 2; // +2 porque Excel empieza en 1 y tiene header

      try {
        // Normalizar nombres de columnas (case insensitive)
        const normalizedRow: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          normalizedRow[key.toLowerCase()] = value;
        }

        // Extraer valores
        const periodo = parseNumber(normalizedRow['periodo']);
        const empresa = String(normalizedRow['empresa'] || '').trim();
        const subrubro = String(normalizedRow['subrubro'] || '').trim();
        const idproducto = String(normalizedRow['idproducto'] || '').trim();
        const producto = String(normalizedRow['producto'] || '').trim();
        const idproveedor = String(normalizedRow['idproveedor'] || '').trim();
        const proveedor = String(normalizedRow['proveedor'] || '').trim();
        const idcomprador = String(normalizedRow['idcomprador'] || '').trim();
        const idcategoria = String(normalizedRow['idcategoria'] || '').trim();
        const importe_costo = parseNumber(normalizedRow['importe_costo']);
        const stock_unidades = parseNumber(normalizedRow['stock_unidades']);
        const stock_costo = parseNumber(normalizedRow['stock_costo']);
        const importe_Ventas = parseNumber(normalizedRow['importe_ventas']);
        const stock_volumen = parseNumber(normalizedRow['stock_volumen']);

        // Validaciones básicas
        const rowErrors: string[] = [];

        if (!idproducto) {
          rowErrors.push('ID producto vacío');
        }

        if (!empresa || !['Cromo', 'BBA'].includes(empresa)) {
          rowErrors.push(`Empresa inválida: "${empresa}" (debe ser Cromo o BBA)`);
        }

        if (!producto) {
          rowErrors.push('Nombre de producto vacío');
        }

        if (rowErrors.length > 0) {
          errors.push(`Fila ${rowNum}: ${rowErrors.join(', ')}`);
          invalidRows++;
          continue;
        }

        // Agregar a data
        const ventaRow: VentaExcelRow = {
          periodo,
          empresa,
          subrubro,
          idproducto,
          producto,
          idproveedor,
          proveedor,
          idcomprador,
          idcategoria,
          importe_costo,
          stock_unidades,
          stock_costo,
          importe_Ventas,
          stock_volumen,
        };

        data.push(ventaRow);

        // Actualizar contadores
        empresasCount[empresa] = (empresasCount[empresa] || 0) + 1;
        if (subrubro) subrubrosSet.add(subrubro);
        if (idproveedor) proveedoresSet.add(idproveedor);
        totalVentas += importe_Ventas;
        totalCosto += importe_costo;
      } catch (err) {
        errors.push(`Fila ${rowNum}: Error procesando - ${err}`);
        invalidRows++;
      }
    }

    return {
      success: errors.length === 0 || data.length > 0,
      data,
      errors,
      summary: {
        totalRows: jsonData.length,
        validRows: data.length,
        invalidRows,
        totalVentas,
        totalCosto,
        empresas: empresasCount,
        subrubros: subrubrosSet.size,
        proveedores: proveedoresSet.size,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: [],
      errors: [`Error leyendo Excel: ${err}`],
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        totalVentas: 0,
        totalCosto: 0,
        empresas: {},
        subrubros: 0,
        proveedores: 0,
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

// Función para extraer período del nombre del archivo
export function extractPeriodoFromFilename(filename: string): string | null {
  // Buscar patrones como 202512, 2025-12, etc.
  const patterns = [
    /(\d{4})(\d{2})/, // 202512
    /(\d{4})-(\d{2})/, // 2025-12
    /(\d{4})_(\d{2})/, // 2025_12
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const year = match[1];
      const month = match[2];
      if (parseInt(month) >= 1 && parseInt(month) <= 12) {
        return `${year}-${month}-01`;
      }
    }
  }

  return null;
}

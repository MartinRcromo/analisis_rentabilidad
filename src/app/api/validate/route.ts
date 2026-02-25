import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// Columnas requeridas por tipo de archivo
const COLUMNAS_VENTAS = [
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
  'importe_ventas',
  'stock_volumen',
];

const COLUMNAS_GASTOS = [
  'gerencia',
  'sector',
  'tipogasto',
  'importe_gasto',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const tipo = formData.get('tipo') as string | null; // 'ventas' o 'gastos'

    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Info de hojas
    const hojas = workbook.SheetNames;

    // Usar hoja "Export" si existe (para ventas), o la primera
    let sheetName = workbook.SheetNames[0];
    if (tipo === 'ventas' && workbook.SheetNames.includes('Export')) {
      sheetName = 'Export';
    }

    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      raw: false,
      defval: '',
    });

    if (jsonData.length === 0) {
      return NextResponse.json({
        valido: false,
        hojas,
        hoja_usada: sheetName,
        total_filas: 0,
        columnas_encontradas: [],
        columnas_requeridas: tipo === 'ventas' ? COLUMNAS_VENTAS : COLUMNAS_GASTOS,
        columnas_faltantes: tipo === 'ventas' ? COLUMNAS_VENTAS : COLUMNAS_GASTOS,
        columnas_extra: [],
        muestra: [],
        errores: ['El archivo está vacío'],
      });
    }

    // Columnas encontradas (normalizadas a minúscula)
    const primeraFila = jsonData[0];
    const columnasEncontradas = Object.keys(primeraFila);
    const columnasEncontradasLower = columnasEncontradas.map((c) => c.toLowerCase());

    const columnasRequeridas = tipo === 'ventas' ? COLUMNAS_VENTAS : COLUMNAS_GASTOS;

    // Columnas faltantes
    const columnasFaltantes = columnasRequeridas.filter(
      (col) => !columnasEncontradasLower.includes(col.toLowerCase())
    );

    // Columnas extra (no requeridas)
    const columnasExtra = columnasEncontradas.filter(
      (col) => !columnasRequeridas.includes(col.toLowerCase())
    );

    // Validar valores de empresa (solo para ventas)
    const empresasEncontradas: Record<string, number> = {};
    const erroresEmpresa: string[] = [];
    if (tipo === 'ventas') {
      jsonData.slice(0, 100).forEach((row, i) => {
        const normalizado: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) normalizado[k.toLowerCase()] = v;
        const empresa = String(normalizado['empresa'] || '').trim();
        if (empresa) {
          empresasEncontradas[empresa] = (empresasEncontradas[empresa] || 0) + 1;
          if (!['Cromo', 'BBA'].includes(empresa)) {
            if (erroresEmpresa.length < 5) {
              erroresEmpresa.push(`Fila ${i + 2}: empresa="${empresa}" (debe ser "Cromo" o "BBA")`);
            }
          }
        }
      });
    }

    // Muestra de primeras 3 filas (columnas normalizadas)
    const muestra = jsonData.slice(0, 3).map((row) => {
      const norm: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) norm[k.toLowerCase()] = v;
      return norm;
    });

    // Validar período (para ventas)
    let periodoMuestra: string[] = [];
    if (tipo === 'ventas') {
      const periodosSet = new Set<string>();
      jsonData.slice(0, 50).forEach((row) => {
        const norm: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) norm[k.toLowerCase()] = v;
        const periodo = String(norm['periodo'] || '').trim();
        if (periodo) periodosSet.add(periodo);
      });
      periodoMuestra = Array.from(periodosSet).slice(0, 5);
    }

    const errores: string[] = [];
    if (columnasFaltantes.length > 0) {
      errores.push(`Columnas faltantes: ${columnasFaltantes.join(', ')}`);
    }
    if (erroresEmpresa.length > 0) {
      errores.push(...erroresEmpresa);
    }

    return NextResponse.json({
      valido: columnasFaltantes.length === 0 && erroresEmpresa.length === 0,
      hojas,
      hoja_usada: sheetName,
      total_filas: jsonData.length,
      columnas_encontradas: columnasEncontradas,
      columnas_requeridas: columnasRequeridas,
      columnas_faltantes: columnasFaltantes,
      columnas_extra: columnasExtra,
      empresas_encontradas: empresasEncontradas,
      periodos_muestra: periodoMuestra,
      muestra,
      errores,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error leyendo archivo', details: String(error) },
      { status: 500 }
    );
  }
}

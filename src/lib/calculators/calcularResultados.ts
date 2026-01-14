import { VentaExcelRow, TotalesPeriodo, SimulacionResultado } from '@/types/database';

interface ProductoCalculado {
  producto_id: number;
  periodo: string;

  // Métricas básicas
  importe_ventas: number;
  importe_costo: number;
  margen_bruto: number;
  markup_pct: number;
  stock_unidades: number;
  stock_costo: number;
  stock_volumen: number;
  // Nuevos campos para modelo de 5 grupos
  unidades_vendidas: number;
  veces_pedido: number;

  // Porcentajes de asignación (5 grupos)
  porcentaje_facturacion: number;
  porcentaje_ocupacion: number; // Antes: porcentaje_volumen
  porcentaje_movimiento: number; // Nuevo: por veces_pedido
  porcentaje_credito: number;
  porcentaje_markup: number;

  // Gastos asignados (5 grupos)
  gasto_facturacion: number;
  gasto_ocupacion: number; // Antes: gasto_volumen
  gasto_movimiento: number; // Nuevo
  gasto_credito: number;
  gasto_markup: number;
  gasto_total: number;

  // Resultado
  resultado: number;
  en_perdida: boolean;
  markup_minimo_pct: number;
  cumple_objetivo: boolean;
}

interface GastosFinales {
  facturacion: number;
  ocupacion: number; // Antes: volumen (alquiler, servicios, mantenimiento, seguros)
  movimiento: number; // Nuevo (sueldos logística, fletes)
  credito: number;
  rentabilidad: number;
}

// Calcular totales del período a partir de los datos de ventas
export function calcularTotalesPeriodo(
  ventas: VentaExcelRow[],
  gastosFinales: GastosFinales
): TotalesPeriodo {
  let totalFacturacion = 0;
  let totalVolumenM3 = 0;
  let totalStockValorizado = 0;
  let totalMargenBruto = 0;
  let totalVecesPedido = 0;

  for (const venta of ventas) {
    totalFacturacion += venta.importe_Ventas || 0;
    totalVolumenM3 += venta.stock_volumen || 0;
    totalStockValorizado += venta.stock_costo || 0;
    totalVecesPedido += venta.veces_pedido || 0;

    const margen = (venta.importe_Ventas || 0) - (venta.importe_costo || 0);
    totalMargenBruto += margen;
  }

  return {
    total_facturacion: totalFacturacion,
    total_volumen_m3: totalVolumenM3,
    total_stock_valorizado: totalStockValorizado,
    total_margen_bruto: totalMargenBruto,
    total_veces_pedido: totalVecesPedido,
    gastos_facturacion: gastosFinales.facturacion,
    gastos_ocupacion: gastosFinales.ocupacion,
    gastos_movimiento: gastosFinales.movimiento,
    gastos_credito: gastosFinales.credito,
    gastos_rentabilidad: gastosFinales.rentabilidad,
  };
}

// Calcular resultado individual de un producto
export function calcularResultadoProducto(
  venta: VentaExcelRow,
  productoId: number,
  periodo: string,
  totales: TotalesPeriodo
): ProductoCalculado {
  // 1. Métricas básicas
  const importe_ventas = venta.importe_Ventas || 0;
  const importe_costo = venta.importe_costo || 0;
  const margen_bruto = importe_ventas - importe_costo;
  const markup_pct = importe_costo > 0 ? ((importe_ventas / importe_costo) - 1) * 100 : 0;
  const stock_unidades = venta.stock_unidades || 0;
  const stock_costo = venta.stock_costo || 0;
  const stock_volumen = venta.stock_volumen || 0;
  const unidades_vendidas = venta.unidades_vendidas || 0;
  const veces_pedido = venta.veces_pedido || 0;

  // 2. Calcular porcentajes de asignación (5 grupos)
  const porcentaje_facturacion =
    totales.total_facturacion > 0 ? importe_ventas / totales.total_facturacion : 0;

  const porcentaje_ocupacion =
    totales.total_volumen_m3 > 0 ? stock_volumen / totales.total_volumen_m3 : 0;

  const porcentaje_movimiento =
    totales.total_veces_pedido > 0 ? veces_pedido / totales.total_veces_pedido : 0;

  const porcentaje_credito =
    totales.total_stock_valorizado > 0 ? stock_costo / totales.total_stock_valorizado : 0;

  const porcentaje_markup =
    totales.total_margen_bruto > 0 ? margen_bruto / totales.total_margen_bruto : 0;

  // 3. Asignar gastos al producto (5 grupos)
  const gasto_facturacion = porcentaje_facturacion * totales.gastos_facturacion;
  const gasto_ocupacion = porcentaje_ocupacion * totales.gastos_ocupacion;
  const gasto_movimiento = porcentaje_movimiento * totales.gastos_movimiento;
  const gasto_credito = porcentaje_credito * totales.gastos_credito;
  const gasto_markup = porcentaje_markup * totales.gastos_rentabilidad;
  const gasto_total = gasto_facturacion + gasto_ocupacion + gasto_movimiento + gasto_credito + gasto_markup;

  // 4. Resultado final
  const resultado = margen_bruto - gasto_total;
  const en_perdida = resultado < 0;

  // 5. Mark-up mínimo necesario
  const markup_minimo_pct = importe_costo > 0 ? (gasto_total / importe_costo) * 100 : 0;
  const cumple_objetivo = markup_pct >= markup_minimo_pct;

  return {
    producto_id: productoId,
    periodo,
    importe_ventas,
    importe_costo,
    margen_bruto,
    markup_pct,
    stock_unidades,
    stock_costo,
    stock_volumen,
    unidades_vendidas,
    veces_pedido,
    porcentaje_facturacion,
    porcentaje_ocupacion,
    porcentaje_movimiento,
    porcentaje_credito,
    porcentaje_markup,
    gasto_facturacion,
    gasto_ocupacion,
    gasto_movimiento,
    gasto_credito,
    gasto_markup,
    gasto_total,
    resultado,
    en_perdida,
    markup_minimo_pct,
    cumple_objetivo,
  };
}

// Calcular todos los productos de un período
export function calcularTodosLosProductos(
  ventas: VentaExcelRow[],
  productosMap: Map<string, number>, // idproducto -> producto_id
  periodo: string,
  totales: TotalesPeriodo
): ProductoCalculado[] {
  const resultados: ProductoCalculado[] = [];

  for (const venta of ventas) {
    const productoId = productosMap.get(venta.idproducto);
    if (productoId === undefined) continue;

    const resultado = calcularResultadoProducto(venta, productoId, periodo, totales);
    resultados.push(resultado);
  }

  return resultados;
}

// Simular cambios en un producto
export function simularCambiosProducto(
  productoActual: ProductoCalculado,
  totales: TotalesPeriodo,
  cambios: {
    delta_markup_pct?: number;
    reduccion_stock_pct?: number;
  }
): SimulacionResultado {
  // 1. Calcular nuevo markup y ventas
  const nuevo_markup_pct = productoActual.markup_pct + (cambios.delta_markup_pct || 0);

  // Calcular nuevo precio basado en el nuevo markup
  // markup = (ventas/costo - 1) * 100, entonces ventas = costo * (1 + markup/100)
  const nuevas_ventas = productoActual.importe_costo * (1 + nuevo_markup_pct / 100);
  const nuevo_margen = nuevas_ventas - productoActual.importe_costo;
  const nuevo_precio =
    productoActual.stock_unidades > 0 ? nuevas_ventas / productoActual.stock_unidades : 0;

  // 2. Calcular nuevo stock
  const reduccion_pct = cambios.reduccion_stock_pct || 0;
  const nuevo_stock_unidades = productoActual.stock_unidades * (1 - reduccion_pct / 100);
  const nuevo_stock_costo = productoActual.stock_costo * (1 - reduccion_pct / 100);
  const nuevo_stock_volumen = productoActual.stock_volumen * (1 - reduccion_pct / 100);

  // 3. Recalcular porcentajes (asumiendo que totales no cambian mucho)
  const nueva_pct_facturacion =
    totales.total_facturacion > 0 ? nuevas_ventas / totales.total_facturacion : 0;
  const nueva_pct_ocupacion =
    totales.total_volumen_m3 > 0 ? nuevo_stock_volumen / totales.total_volumen_m3 : 0;
  const nueva_pct_credito =
    totales.total_stock_valorizado > 0 ? nuevo_stock_costo / totales.total_stock_valorizado : 0;
  const nueva_pct_markup =
    totales.total_margen_bruto > 0 ? nuevo_margen / totales.total_margen_bruto : 0;
  // Movimiento se mantiene igual (misma cantidad de picks)
  const nueva_pct_movimiento = productoActual.porcentaje_movimiento;

  // 4. Recalcular gastos (5 grupos)
  const nuevo_gasto_facturacion = nueva_pct_facturacion * totales.gastos_facturacion;
  const nuevo_gasto_ocupacion = nueva_pct_ocupacion * totales.gastos_ocupacion;
  const nuevo_gasto_movimiento = nueva_pct_movimiento * totales.gastos_movimiento;
  const nuevo_gasto_credito = nueva_pct_credito * totales.gastos_credito;
  const nuevo_gasto_markup = nueva_pct_markup * totales.gastos_rentabilidad;
  const nuevo_gasto_total =
    nuevo_gasto_facturacion + nuevo_gasto_ocupacion + nuevo_gasto_movimiento + nuevo_gasto_credito + nuevo_gasto_markup;

  // 5. Nuevo resultado
  const nuevo_resultado = nuevo_margen - nuevo_gasto_total;

  // 6. Ahorros
  const ahorro_credito = productoActual.gasto_credito - nuevo_gasto_credito;
  const ahorro_volumen = productoActual.gasto_ocupacion - nuevo_gasto_ocupacion;
  const mejora_resultado = nuevo_resultado - productoActual.resultado;

  return {
    nuevo_markup_pct,
    nuevo_precio,
    nuevas_ventas,
    nuevo_margen,
    nuevo_stock_unidades,
    nuevo_gasto_total,
    nuevo_resultado,
    en_perdida: nuevo_resultado < 0,
    ahorro_credito,
    ahorro_volumen,
    mejora_resultado,
  };
}

// Generar resumen estadístico
export function generarResumenPeriodo(productos: ProductoCalculado[]): {
  total_productos: number;
  productos_perdida: number;
  productos_beneficio: number;
  perdida_total: number;
  beneficio_total: number;
  resultado_neto: number;
  pct_perdida: number;
  markup_promedio: number;
  markup_minimo_promedio: number;
} {
  let productos_perdida = 0;
  let productos_beneficio = 0;
  let perdida_total = 0;
  let beneficio_total = 0;
  let suma_markup = 0;
  let suma_markup_minimo = 0;

  for (const p of productos) {
    if (p.en_perdida) {
      productos_perdida++;
      perdida_total += p.resultado;
    } else {
      productos_beneficio++;
      beneficio_total += p.resultado;
    }
    suma_markup += p.markup_pct;
    suma_markup_minimo += p.markup_minimo_pct;
  }

  const total = productos.length;

  return {
    total_productos: total,
    productos_perdida,
    productos_beneficio,
    perdida_total,
    beneficio_total,
    resultado_neto: beneficio_total + perdida_total, // perdida_total es negativo
    pct_perdida: total > 0 ? (productos_perdida / total) * 100 : 0,
    markup_promedio: total > 0 ? suma_markup / total : 0,
    markup_minimo_promedio: total > 0 ? suma_markup_minimo / total : 0,
  };
}

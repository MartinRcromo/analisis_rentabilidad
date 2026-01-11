# Sistema de Análisis de Rentabilidad por Producto

Aplicación web para analizar la rentabilidad de 31,292 productos (SKUs) de autopartes distribuidos en 378 subrubros.

## Funcionalidades

- **Upload de datos**: Importar ventas y gastos mensuales desde Excel
- **Dashboard**: Vista general con métricas, gráficos y top subrubros
- **Productos**: Tabla con filtros, búsqueda y ordenamiento
- **Detalle de producto**: Análisis completo con recomendaciones automáticas
- **Simulador**: Proyectar cambios de markup y stock
- **Subrubros**: Análisis agregado por categoría
- **Proveedores**: Análisis agregado por proveedor
- **Acciones**: Gestión de acciones correctivas
- **Comparación**: Cromo vs BBA lado a lado

---

## GUÍA PASO A PASO PARA PRINCIPIANTES

### PASO 1: Crear cuenta en Supabase (Gratis)

1. Ve a https://supabase.com
2. Haz clic en "Start your project"
3. Regístrate con tu email o cuenta de GitHub
4. Una vez dentro, haz clic en "New Project"
5. Completa:
   - **Name**: `analisis-rentabilidad`
   - **Database Password**: Elige una contraseña (guárdala)
   - **Region**: Elige la más cercana (ej: South America)
6. Haz clic en "Create new project" y espera ~2 minutos

### PASO 2: Crear las tablas en Supabase

1. En el panel de Supabase, ve a "SQL Editor" (icono de base de datos en la barra izquierda)
2. Haz clic en "New query"
3. Abre el archivo `supabase/schema.sql` de este proyecto
4. Copia TODO el contenido
5. Pégalo en el editor SQL de Supabase
6. Haz clic en "Run" (o Ctrl+Enter)
7. Deberías ver un mensaje de éxito

### PASO 3: Obtener las credenciales de Supabase

1. En Supabase, ve a "Project Settings" (icono de engranaje abajo a la izquierda)
2. Haz clic en "API" en el menú
3. Copia estos valores:
   - **Project URL**: Algo como `https://xxxxx.supabase.co`
   - **anon public**: Una cadena larga que empieza con `eyJ...`
   - **service_role**: Otra cadena larga (¡NO compartas esta!)

### PASO 4: Configurar el proyecto

1. En la carpeta del proyecto, crea un archivo llamado `.env.local`
2. Agrega este contenido (reemplaza con tus valores):

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...tu-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### PASO 5: Instalar dependencias y ejecutar

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
# Instalar dependencias (solo la primera vez)
npm install

# Iniciar la aplicación
npm run dev
```

### PASO 6: Abrir la aplicación

1. Abre tu navegador
2. Ve a http://localhost:3000
3. ¡Listo! Deberías ver el dashboard

---

## Cómo usar la aplicación

### Cargar datos por primera vez

1. Ve a "Cargar Datos" en el menú lateral
2. Selecciona el período (ej: 2025-12)
3. Sube el archivo de ventas (Excel con datos de productos)
4. Sube el archivo de gastos (Excel con gastos estructurales)
5. Haz clic en "Ejecutar Cálculo"
6. ¡Listo! Ve al Dashboard para ver los resultados

### Navegación

- **Dashboard**: Vista general de rentabilidad
- **Productos**: Lista de todos los productos con filtros
- **Subrubros**: Rentabilidad por categoría de producto
- **Proveedores**: Rentabilidad por proveedor
- **Acciones**: Seguimiento de acciones correctivas
- **Comparación**: Cromo vs BBA
- **Cargar Datos**: Importar nuevos períodos

---

## Estructura de archivos Excel requeridos

### Archivo de Ventas (ej: 202512.xlsx)

Debe tener una hoja llamada "Export" con estas columnas:
- periodo, empresa, subrubro, idproducto, producto
- idproveedor, proveedor, idcomprador, idcategoria
- importe_costo, stock_unidades, stock_costo
- importe_Ventas, stock_volumen

### Archivo de Gastos (ej: 202512_Gastos.xlsx)

Debe tener estas columnas:
- gerencia, sector, tipogasto, proveedorgasto
- comprobante, idcomprobante, empresa, empresatipo
- importe_gasto, periodo, Clasificacion

---

## Tecnologías utilizadas

- **Frontend**: Next.js 14, React, TypeScript, TailwindCSS
- **UI**: shadcn/ui, Recharts
- **Backend**: Next.js API Routes
- **Base de datos**: Supabase (PostgreSQL)

---

## Soporte

Si tienes problemas:
1. Verifica que el archivo `.env.local` tenga las credenciales correctas
2. Asegúrate de haber ejecutado el SQL en Supabase
3. Revisa la consola del navegador (F12) para ver errores

-- ============================================================================
-- MIGRATION 003: Fix productos unique constraint
-- ============================================================================
-- Problem: productos table has UNIQUE(codigo) but the same codigo can exist
-- for different companies (Cromo and BBA). This causes products to overwrite
-- each other during staging processing, resulting in missing metrics.
--
-- Solution: Change unique constraint from UNIQUE(codigo) to UNIQUE(codigo, empresa)
-- ============================================================================

-- Step 1: Drop the existing unique constraint on codigo
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_codigo_key;

-- Step 2: Add new composite unique constraint on (codigo, empresa)
ALTER TABLE productos ADD CONSTRAINT productos_codigo_empresa_key UNIQUE(codigo, empresa);

-- Step 3: Add index for efficient lookups by codigo + empresa
CREATE INDEX IF NOT EXISTS idx_productos_codigo_empresa ON productos(codigo, empresa);

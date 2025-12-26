-- Allow null category_id for transfer transactions
-- This migration makes category_id nullable and updates the foreign key constraint

-- First, drop the existing foreign key constraint (if it exists with the default name)
-- PostgreSQL auto-generates constraint names, so we need to find and drop it
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the foreign key constraint name
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'transactions'::regclass
      AND confrelid = 'categories'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'transactions'::regclass AND attname = 'category_id')];
    
    -- Drop the constraint if it exists
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Make category_id nullable
ALTER TABLE transactions 
ALTER COLUMN category_id DROP NOT NULL;

-- Re-add the foreign key constraint with ON DELETE SET NULL to handle category deletions gracefully
ALTER TABLE transactions 
ADD CONSTRAINT transactions_category_id_fkey 
FOREIGN KEY (category_id) 
REFERENCES categories(category_id) 
ON DELETE SET NULL;

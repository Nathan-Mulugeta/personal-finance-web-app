-- Fix settings table primary key to support multi-user
-- The original schema used setting_key as the primary key, which means
-- only one user could have each setting key (e.g., "BaseCurrency")

-- Step 1: Drop the existing primary key constraint
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;

-- Step 2: Drop the unique constraint if it exists
ALTER TABLE settings DROP CONSTRAINT IF EXISTS unique_user_setting;

-- Step 3: Add a new composite primary key on (user_id, setting_key)
ALTER TABLE settings ADD PRIMARY KEY (user_id, setting_key);

-- Step 4: Add index for faster lookups by setting_key
CREATE INDEX IF NOT EXISTS idx_settings_setting_key ON settings(setting_key);










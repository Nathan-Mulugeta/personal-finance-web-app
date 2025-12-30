-- Add sort_order column to accounts table for manual ordering
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Initialize sort_order for existing accounts based on creation order
-- Accounts created first get lower sort_order values
WITH numbered AS (
  SELECT 
    account_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as rn
  FROM accounts
)
UPDATE accounts
SET sort_order = numbered.rn
FROM numbered
WHERE accounts.account_id = numbered.account_id
  AND accounts.sort_order IS NULL;

-- Set default for new accounts to be at the end (will be handled by application logic)
-- We don't set a default here since we want new accounts to get max(sort_order) + 1 per user


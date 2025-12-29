-- Migration: Fix current_balance not being set on account creation
-- The previous trigger only fired on UPDATE, not INSERT
-- This causes new accounts to have current_balance = 0 until the first transaction

-- Modified trigger function to handle both INSERT and UPDATE
CREATE OR REPLACE FUNCTION trigger_update_balance_on_account_change()
RETURNS TRIGGER AS $$
BEGIN
    -- For INSERT: set current_balance = opening_balance (no transactions yet)
    IF TG_OP = 'INSERT' THEN
        UPDATE accounts
        SET current_balance = NEW.opening_balance
        WHERE account_id = NEW.account_id AND user_id = NEW.user_id;
        RETURN NEW;
    END IF;
    
    -- For UPDATE: recalculate if opening_balance changed
    IF TG_OP = 'UPDATE' THEN
        IF OLD.opening_balance IS DISTINCT FROM NEW.opening_balance THEN
            PERFORM update_account_current_balance(NEW.account_id, NEW.user_id);
        END IF;
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger to fire on INSERT as well
DROP TRIGGER IF EXISTS trg_update_balance_on_opening_change ON accounts;
CREATE TRIGGER trg_update_balance_on_opening_change
AFTER INSERT OR UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION trigger_update_balance_on_account_change();

-- Fix any existing accounts that have current_balance = 0 but opening_balance > 0
-- (These were created before this fix)
DO $$
DECLARE
    acc RECORD;
BEGIN
    FOR acc IN 
        SELECT account_id, user_id 
        FROM accounts 
        WHERE current_balance = 0 AND opening_balance != 0
    LOOP
        PERFORM update_account_current_balance(acc.account_id, acc.user_id);
    END LOOP;
END $$;


-- Migration: Add current_balance column and triggers for automatic balance updates
-- This eliminates the need for client-side balance recalculation

-- Step 1: Add current_balance column to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0;

-- Step 2: Create function to recalculate and update account balance
CREATE OR REPLACE FUNCTION update_account_current_balance(p_account_id TEXT, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_opening_balance NUMERIC;
    v_income_total NUMERIC;
    v_expense_total NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Get opening balance
    SELECT opening_balance INTO v_opening_balance
    FROM accounts
    WHERE account_id = p_account_id AND user_id = p_user_id;

    IF v_opening_balance IS NULL THEN
        RETURN;
    END IF;

    -- Calculate income (Income and Transfer In)
    SELECT COALESCE(SUM(amount), 0) INTO v_income_total
    FROM transactions
    WHERE account_id = p_account_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND type IN ('Income', 'Transfer In')
    AND status != 'Cancelled';

    -- Calculate expenses (Expense and Transfer Out)
    SELECT COALESCE(SUM(amount), 0) INTO v_expense_total
    FROM transactions
    WHERE account_id = p_account_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND type IN ('Expense', 'Transfer Out')
    AND status != 'Cancelled';

    -- Calculate new balance
    v_new_balance := v_opening_balance + v_income_total - v_expense_total;

    -- Update the account's current_balance
    UPDATE accounts
    SET current_balance = v_new_balance
    WHERE account_id = p_account_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create trigger function for transaction changes
CREATE OR REPLACE FUNCTION trigger_update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        PERFORM update_account_current_balance(NEW.account_id, NEW.user_id);
        RETURN NEW;
    END IF;

    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- If account changed, update both old and new accounts
        IF OLD.account_id != NEW.account_id THEN
            PERFORM update_account_current_balance(OLD.account_id, OLD.user_id);
        END IF;
        PERFORM update_account_current_balance(NEW.account_id, NEW.user_id);
        RETURN NEW;
    END IF;

    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        PERFORM update_account_current_balance(OLD.account_id, OLD.user_id);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger on transactions table
DROP TRIGGER IF EXISTS trg_update_account_balance ON transactions;
CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION trigger_update_account_balance();

-- Step 5: Create trigger function for account opening_balance changes
CREATE OR REPLACE FUNCTION trigger_update_balance_on_account_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If opening_balance changed, recalculate current_balance
    IF OLD.opening_balance IS DISTINCT FROM NEW.opening_balance THEN
        PERFORM update_account_current_balance(NEW.account_id, NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create trigger on accounts table for opening_balance changes
DROP TRIGGER IF EXISTS trg_update_balance_on_opening_change ON accounts;
CREATE TRIGGER trg_update_balance_on_opening_change
AFTER UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION trigger_update_balance_on_account_change();

-- Step 7: Initialize current_balance for all existing accounts
DO $$
DECLARE
    acc RECORD;
BEGIN
    FOR acc IN SELECT account_id, user_id FROM accounts LOOP
        PERFORM update_account_current_balance(acc.account_id, acc.user_id);
    END LOOP;
END $$;

-- Step 8: Add index for faster balance queries
CREATE INDEX IF NOT EXISTS idx_accounts_current_balance ON accounts(current_balance);


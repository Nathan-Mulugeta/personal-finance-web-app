-- Migration: Add entity_name to transactions
--
-- The counterparty of a borrowing/lending transaction (who you lent to, who you
-- borrowed from) previously had to be encoded in the description as "@Name" and
-- was parsed client-side. That convention doesn't survive natural-language
-- entry, where the AI writes the description. Give it a real column instead;
-- the "@Name" form stays supported as a fallback (see migration 016).

ALTER TABLE IF EXISTS transactions
ADD COLUMN IF NOT EXISTS entity_name TEXT;

-- The single-transaction path goes through this RPC rather than a plain insert,
-- so it needs to carry the new field. Drop the previous signature first: adding
-- a defaulted parameter creates a new overload, and PostgREST cannot choose
-- between two candidates.
DROP FUNCTION IF EXISTS create_transaction_validated(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_transaction_validated(
    p_transaction_id TEXT,
    p_user_id UUID,
    p_account_id TEXT,
    p_category_id TEXT,
    p_date TIMESTAMPTZ,
    p_amount NUMERIC,
    p_currency TEXT,
    p_description TEXT DEFAULT '',
    p_type TEXT DEFAULT 'Expense',
    p_status TEXT DEFAULT 'Cleared',
    p_transfer_id TEXT DEFAULT NULL,
    p_linked_transaction_id TEXT DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL
)
RETURNS transactions AS $$
DECLARE
    v_account accounts%ROWTYPE;
    v_category categories%ROWTYPE;
    v_is_transfer_type BOOLEAN;
    v_result transactions%ROWTYPE;
BEGIN
    -- Check if this is a transfer type transaction
    v_is_transfer_type := p_type IN ('Transfer Out', 'Transfer In');

    -- Validate account exists and is active
    SELECT * INTO v_account
    FROM accounts
    WHERE account_id = p_account_id
    AND user_id = p_user_id
    AND status = 'Active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found or is not active: %', p_account_id;
    END IF;

    -- Validate currency matches account
    IF UPPER(p_currency) != v_account.currency THEN
        RAISE EXCEPTION 'Currency must match account currency: %', v_account.currency;
    END IF;

    -- Validate category exists and is active (skip for transfer types with null category)
    IF p_category_id IS NOT NULL AND NOT v_is_transfer_type THEN
        SELECT * INTO v_category
        FROM categories
        WHERE category_id = p_category_id
        AND user_id = p_user_id
        AND status = 'Active';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Category not found or is not active: %', p_category_id;
        END IF;
    END IF;

    -- Validate transaction type
    IF p_type NOT IN ('Income', 'Expense', 'Transfer', 'Transfer Out', 'Transfer In') THEN
        RAISE EXCEPTION 'Invalid transaction type: %', p_type;
    END IF;

    -- Validate transaction status
    IF p_status NOT IN ('Pending', 'Cleared', 'Reconciled', 'Cancelled') THEN
        RAISE EXCEPTION 'Invalid transaction status: %', p_status;
    END IF;

    -- Insert the transaction
    INSERT INTO transactions (
        transaction_id,
        user_id,
        account_id,
        category_id,
        date,
        amount,
        currency,
        description,
        type,
        status,
        transfer_id,
        linked_transaction_id,
        entity_name,
        created_at
    ) VALUES (
        p_transaction_id,
        p_user_id,
        p_account_id,
        p_category_id,
        p_date,
        p_amount,
        UPPER(p_currency),
        COALESCE(p_description, ''),
        p_type,
        p_status,
        p_transfer_id,
        p_linked_transaction_id,
        NULLIF(BTRIM(COALESCE(p_entity_name, '')), ''),
        NOW()
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (specify full signature)
GRANT EXECUTE ON FUNCTION create_transaction_validated(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

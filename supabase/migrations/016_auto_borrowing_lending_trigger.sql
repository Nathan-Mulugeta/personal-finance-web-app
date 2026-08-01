-- Migration: Create borrowing/lending records in the database
--
-- This used to happen in the web client, after the insert returned. Anything
-- that wrote a transaction another way — the quick-expense edge function that
-- Tasker calls, a future importer — produced a transaction with no matching
-- borrowings_lendings row. Moving it into a trigger makes it hold for every
-- path, and borrowings_lendings.original_transaction_id being UNIQUE keeps it
-- idempotent, so the old client-side code can't create duplicates during
-- rollout.

-- Trim and collapse internal whitespace; empty becomes NULL.
CREATE OR REPLACE FUNCTION normalize_entity_name(p_name TEXT)
RETURNS TEXT AS $$
    SELECT NULLIF(REGEXP_REPLACE(BTRIM(COALESCE(p_name, '')), '\s+', ' ', 'g'), '');
$$ LANGUAGE sql IMMUTABLE;

-- The legacy convention: "@Name" anywhere in the description, up to the next
-- space. Mirrors src/utils/borrowingLendingParser.js.
CREATE OR REPLACE FUNCTION parse_entity_name_from_description(p_description TEXT)
RETURNS TEXT AS $$
    SELECT normalize_entity_name((REGEXP_MATCH(COALESCE(p_description, ''), '@(\S+)'))[1]);
$$ LANGUAGE sql IMMUTABLE;

-- Is p_category_id the given category, or any descendant of it? Transactions
-- post to leaf categories, so a "Lending > Friends" subcategory has to count as
-- lending. The depth cap is belt-and-braces against a cyclic parent chain.
CREATE OR REPLACE FUNCTION category_is_within(p_category_id TEXT, p_ancestor_id TEXT)
RETURNS BOOLEAN AS $$
    WITH RECURSIVE chain AS (
        SELECT category_id, parent_category_id, 1 AS depth
        FROM categories
        WHERE category_id = p_category_id
        UNION ALL
        SELECT c.category_id, c.parent_category_id, ch.depth + 1
        FROM categories c
        JOIN chain ch ON c.category_id = ch.parent_category_id
        WHERE ch.depth < 20
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE category_id = p_ancestor_id);
$$ LANGUAGE sql STABLE;

-- The shared implementation, called by the trigger below and by the backfill in
-- migration 017. SECURITY DEFINER so it can read settings and write the record
-- whatever the calling role is — the edge function runs as service_role with no
-- auth.uid(), which the RLS policies on those tables would otherwise block.
CREATE OR REPLACE FUNCTION create_borrowing_lending_for_transaction(p_txn transactions)
RETURNS VOID AS $$
DECLARE
    v_borrowing_root TEXT;
    v_lending_root TEXT;
    v_record_type TEXT;
    v_entity TEXT;
    v_existing_entity TEXT;
    v_notes TEXT;
BEGIN
    IF p_txn.category_id IS NULL
       OR p_txn.deleted_at IS NOT NULL
       OR p_txn.status = 'Cancelled' THEN
        RETURN;
    END IF;

    SELECT NULLIF(BTRIM(setting_value), '') INTO v_borrowing_root
    FROM settings
    WHERE user_id = p_txn.user_id AND setting_key = 'BorrowingCategoryID';

    SELECT NULLIF(BTRIM(setting_value), '') INTO v_lending_root
    FROM settings
    WHERE user_id = p_txn.user_id AND setting_key = 'LendingCategoryID';

    IF v_borrowing_root IS NULL AND v_lending_root IS NULL THEN
        RETURN;
    END IF;

    IF v_borrowing_root IS NOT NULL
       AND category_is_within(p_txn.category_id, v_borrowing_root) THEN
        v_record_type := 'Borrowing';
    ELSIF v_lending_root IS NOT NULL
       AND category_is_within(p_txn.category_id, v_lending_root) THEN
        v_record_type := 'Lending';
    ELSE
        RETURN;
    END IF;

    -- Entity: the explicit field first, then the legacy "@Name" in the
    -- description (whose marker is then stripped out of the notes).
    v_entity := normalize_entity_name(p_txn.entity_name);
    IF v_entity IS NULL THEN
        v_entity := parse_entity_name_from_description(p_txn.description);
        v_notes := BTRIM(REGEXP_REPLACE(COALESCE(p_txn.description, ''), '@\S+', '', 'g'));
    ELSE
        v_notes := BTRIM(COALESCE(p_txn.description, ''));
    END IF;

    -- Reuse a spelling this user already has, so "abebe" joins Abebe's ledger
    -- instead of starting a parallel one.
    IF v_entity IS NOT NULL THEN
        SELECT bl.entity_name INTO v_existing_entity
        FROM borrowings_lendings bl
        WHERE bl.user_id = p_txn.user_id
          AND LOWER(bl.entity_name) = LOWER(v_entity)
        ORDER BY bl.created_at
        LIMIT 1;

        IF v_existing_entity IS NOT NULL THEN
            v_entity := v_existing_entity;
        END IF;
    END IF;

    -- entity_name is NOT NULL on the table, and a missing name is no reason to
    -- lose the record — it can be renamed on the Borrowings & Lendings page.
    v_entity := COALESCE(v_entity, 'Unknown');

    INSERT INTO borrowings_lendings (
        record_id,
        user_id,
        type,
        original_transaction_id,
        entity_name,
        original_amount,
        currency,
        paid_amount,
        remaining_amount,
        status,
        notes
    ) VALUES (
        -- Same prefix_timestamp_suffix shape as generateId() in the client
        'BL_' || (EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) * 1000)::BIGINT || '_' ||
            SUBSTR(REPLACE(GEN_RANDOM_UUID()::TEXT, '-', ''), 1, 12),
        p_txn.user_id,
        v_record_type,
        p_txn.transaction_id,
        v_entity,
        ABS(p_txn.amount),
        UPPER(p_txn.currency),
        0,
        ABS(p_txn.amount),
        'Active',
        COALESCE(v_notes, '')
    )
    ON CONFLICT (original_transaction_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION auto_create_borrowing_lending()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_borrowing_lending_for_transaction(NEW);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS auto_create_borrowing_lending_on_insert ON transactions;
CREATE TRIGGER auto_create_borrowing_lending_on_insert
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_borrowing_lending();

-- Renaming the counterparty on the transaction should follow through to its
-- record. Re-categorising a transaction deliberately does NOT create one — that
-- matches the behaviour this replaces.
CREATE OR REPLACE FUNCTION sync_borrowing_lending_entity_name()
RETURNS TRIGGER AS $$
DECLARE
    v_entity TEXT;
BEGIN
    v_entity := normalize_entity_name(NEW.entity_name);
    IF v_entity IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE borrowings_lendings
    SET entity_name = v_entity
    WHERE original_transaction_id = NEW.transaction_id
      AND entity_name IS DISTINCT FROM v_entity;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS sync_borrowing_lending_entity_name_on_update ON transactions;
CREATE TRIGGER sync_borrowing_lending_entity_name_on_update
    AFTER UPDATE OF entity_name ON transactions
    FOR EACH ROW
    WHEN (NEW.entity_name IS DISTINCT FROM OLD.entity_name)
    EXECUTE FUNCTION sync_borrowing_lending_entity_name();

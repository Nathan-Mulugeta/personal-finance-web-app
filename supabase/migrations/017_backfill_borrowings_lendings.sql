-- Migration: Backfill borrowing/lending records
--
-- Transactions written outside the web client (the quick-expense edge function
-- Tasker calls) never got a borrowings_lendings row. Now that migration 016
-- owns the creation, replay it over the existing rows.
--
-- Safe to re-run: create_borrowing_lending_for_transaction skips anything that
-- already has a record (ON CONFLICT on the UNIQUE original_transaction_id), and
-- the pre-filter below only looks at transactions with none.
--
-- Oldest first, so when two spellings of the same name exist the earliest one
-- wins and later ones fold into it.

DO $$
DECLARE
    v_txn transactions%ROWTYPE;
BEGIN
    FOR v_txn IN
        SELECT t.*
        FROM transactions t
        WHERE t.category_id IS NOT NULL
          AND t.deleted_at IS NULL
          AND t.status <> 'Cancelled'
          AND NOT EXISTS (
              SELECT 1
              FROM borrowings_lendings bl
              WHERE bl.original_transaction_id = t.transaction_id
          )
        ORDER BY t.date
    LOOP
        PERFORM create_borrowing_lending_for_transaction(v_txn);
    END LOOP;
END $$;

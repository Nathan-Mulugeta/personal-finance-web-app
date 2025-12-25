-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for accounts
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for categories
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for transactions
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for budgets
CREATE TRIGGER update_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for borrowings_lendings
CREATE TRIGGER update_borrowings_lendings_updated_at
    BEFORE UPDATE ON borrowings_lendings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for settings
CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to prevent circular category references
CREATE OR REPLACE FUNCTION check_category_circular_reference()
RETURNS TRIGGER AS $$
DECLARE
    parent_path TEXT[];
    current_category_id TEXT;
BEGIN
    -- If no parent, no circular reference possible
    IF NEW.parent_category_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Prevent self-reference
    IF NEW.parent_category_id = NEW.category_id THEN
        RAISE EXCEPTION 'Category cannot be its own parent';
    END IF;

    -- Check if the new parent is a descendant of this category
    current_category_id := NEW.category_id;
    parent_path := ARRAY[current_category_id];

    WHILE EXISTS (
        SELECT 1 FROM categories
        WHERE category_id = NEW.parent_category_id
        AND parent_category_id = ANY(parent_path)
    ) LOOP
        RAISE EXCEPTION 'Circular reference detected: category cannot be parent of its descendants';
    END LOOP;

    -- Check if any descendant would create a cycle
    WITH RECURSIVE descendants AS (
        SELECT category_id, parent_category_id
        FROM categories
        WHERE parent_category_id = NEW.category_id
        UNION ALL
        SELECT c.category_id, c.parent_category_id
        FROM categories c
        INNER JOIN descendants d ON c.parent_category_id = d.category_id
    )
    SELECT category_id INTO current_category_id
    FROM descendants
    WHERE category_id = NEW.parent_category_id
    LIMIT 1;

    IF current_category_id IS NOT NULL THEN
        RAISE EXCEPTION 'Circular reference detected: cannot set parent that is a descendant';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to prevent circular category references
CREATE TRIGGER prevent_category_circular_reference
    BEFORE INSERT OR UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION check_category_circular_reference();

-- Function to auto-update remaining_amount in borrowings_lendings
CREATE OR REPLACE FUNCTION update_borrowing_lending_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_amount = NEW.original_amount - NEW.paid_amount;
    
    -- Auto-update status if fully paid
    IF NEW.remaining_amount <= 0 AND NEW.status = 'Active' THEN
        NEW.status = 'FullyPaid';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update remaining_amount
CREATE TRIGGER update_borrowing_lending_remaining
    BEFORE INSERT OR UPDATE ON borrowings_lendings
    FOR EACH ROW
    EXECUTE FUNCTION update_borrowing_lending_remaining_amount();

-- Function to validate transaction currency matches account currency
CREATE OR REPLACE FUNCTION validate_transaction_currency()
RETURNS TRIGGER AS $$
DECLARE
    account_currency TEXT;
BEGIN
    SELECT currency INTO account_currency
    FROM accounts
    WHERE account_id = NEW.account_id;
    
    IF account_currency IS NULL THEN
        RAISE EXCEPTION 'Account not found: %', NEW.account_id;
    END IF;
    
    IF NEW.currency != account_currency THEN
        RAISE EXCEPTION 'Transaction currency (%) does not match account currency (%)', NEW.currency, account_currency;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate transaction currency matches account currency
CREATE TRIGGER validate_transaction_currency_trigger
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_transaction_currency();


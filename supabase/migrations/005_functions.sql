-- Function to calculate account balance
CREATE OR REPLACE FUNCTION calculate_account_balance(p_account_id TEXT, p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_opening_balance NUMERIC;
    v_income_total NUMERIC;
    v_expense_total NUMERIC;
    v_balance NUMERIC;
BEGIN
    -- Get opening balance
    SELECT opening_balance INTO v_opening_balance
    FROM accounts
    WHERE account_id = p_account_id AND user_id = p_user_id;

    IF v_opening_balance IS NULL THEN
        RETURN NULL;
    END IF;

    -- Calculate income (positive amounts for Income type transactions)
    SELECT COALESCE(SUM(amount), 0) INTO v_income_total
    FROM transactions
    WHERE account_id = p_account_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND type IN ('Income', 'Transfer In')
    AND status != 'Cancelled';

    -- Calculate expenses (negative amounts for Expense type transactions)
    SELECT COALESCE(SUM(amount), 0) INTO v_expense_total
    FROM transactions
    WHERE account_id = p_account_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND type IN ('Expense', 'Transfer Out')
    AND status != 'Cancelled';

    -- Calculate balance: opening + income - expenses
    v_balance := v_opening_balance + v_income_total - v_expense_total;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate category hierarchy (no circular references)
CREATE OR REPLACE FUNCTION validate_category_hierarchy(
    p_category_id TEXT,
    p_parent_category_id TEXT,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_parent TEXT;
    v_visited_categories TEXT[];
BEGIN
    -- If no parent, valid
    IF p_parent_category_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Cannot be parent of itself
    IF p_category_id = p_parent_category_id THEN
        RETURN FALSE;
    END IF;

    -- Check if parent is a descendant (would create cycle)
    v_current_parent := p_parent_category_id;
    v_visited_categories := ARRAY[p_category_id];

    WHILE v_current_parent IS NOT NULL LOOP
        -- If we've visited this category, it's a cycle
        IF v_current_parent = ANY(v_visited_categories) THEN
            RETURN FALSE;
        END IF;

        -- Add to visited
        v_visited_categories := array_append(v_visited_categories, v_current_parent);

        -- If we reached the category we're trying to set as parent, it's a cycle
        IF v_current_parent = p_category_id THEN
            RETURN FALSE;
        END IF;

        -- Get next parent
        SELECT parent_category_id INTO v_current_parent
        FROM categories
        WHERE category_id = v_current_parent
        AND user_id = p_user_id;
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get category spending for a month
CREATE OR REPLACE FUNCTION get_category_spending(
    p_category_id TEXT,
    p_month DATE,
    p_user_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
    v_spending NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        CASE
            WHEN t.type = 'Expense' THEN t.amount
            WHEN t.type = 'Income' THEN -t.amount
            ELSE 0
        END
    ), 0) INTO v_spending
    FROM transactions t
    WHERE t.category_id = p_category_id
    AND t.user_id = p_user_id
    AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', p_month)
    AND t.deleted_at IS NULL
    AND t.status != 'Cancelled';

    RETURN v_spending;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get effective budget for a category and month
CREATE OR REPLACE FUNCTION get_effective_budget(
    p_category_id TEXT,
    p_month DATE,
    p_user_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
    v_own_budget NUMERIC;
    v_children_budget NUMERIC;
    v_effective_budget NUMERIC;
BEGIN
    -- Get own budget (non-recurring for this month or recurring that applies)
    SELECT COALESCE(SUM(amount), 0) INTO v_own_budget
    FROM budgets
    WHERE category_id = p_category_id
    AND user_id = p_user_id
    AND status = 'Active'
    AND (
        (recurring = FALSE AND DATE_TRUNC('month', month) = DATE_TRUNC('month', p_month))
        OR
        (recurring = TRUE 
         AND DATE_TRUNC('month', start_month) <= DATE_TRUNC('month', p_month)
         AND (end_month IS NULL OR DATE_TRUNC('month', end_month) >= DATE_TRUNC('month', p_month)))
    );

    -- Get sum of children budgets
    WITH RECURSIVE category_children AS (
        SELECT category_id
        FROM categories
        WHERE parent_category_id = p_category_id
        AND user_id = p_user_id
        AND status = 'Active'
        UNION ALL
        SELECT c.category_id
        FROM categories c
        INNER JOIN category_children cc ON c.parent_category_id = cc.category_id
        WHERE c.user_id = p_user_id
        AND c.status = 'Active'
    )
    SELECT COALESCE(SUM(b.amount), 0) INTO v_children_budget
    FROM budgets b
    INNER JOIN category_children cc ON b.category_id = cc.category_id
    WHERE b.user_id = p_user_id
    AND b.status = 'Active'
    AND (
        (b.recurring = FALSE AND DATE_TRUNC('month', b.month) = DATE_TRUNC('month', p_month))
        OR
        (b.recurring = TRUE 
         AND DATE_TRUNC('month', b.start_month) <= DATE_TRUNC('month', p_month)
         AND (b.end_month IS NULL OR DATE_TRUNC('month', b.end_month) >= DATE_TRUNC('month', p_month)))
    );

    -- Effective budget: max of own budget or sum of children, or own if both exist
    IF v_own_budget > 0 AND v_children_budget > 0 THEN
        v_effective_budget := GREATEST(v_own_budget, v_children_budget);
    ELSIF v_own_budget > 0 THEN
        v_effective_budget := v_own_budget;
    ELSE
        v_effective_budget := v_children_budget;
    END IF;

    RETURN COALESCE(v_effective_budget, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


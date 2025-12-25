-- Enable Row Level Security on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowings_lendings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Accounts Policies
CREATE POLICY "Users can view their own accounts"
    ON accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own accounts"
    ON accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own accounts"
    ON accounts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own accounts"
    ON accounts FOR DELETE
    USING (auth.uid() = user_id);

-- Categories Policies
CREATE POLICY "Users can view their own categories"
    ON categories FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own categories"
    ON categories FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories"
    ON categories FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories"
    ON categories FOR DELETE
    USING (auth.uid() = user_id);

-- Transactions Policies
CREATE POLICY "Users can view their own transactions"
    ON transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
    ON transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
    ON transactions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions"
    ON transactions FOR DELETE
    USING (auth.uid() = user_id);

-- Budgets Policies
CREATE POLICY "Users can view their own budgets"
    ON budgets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budgets"
    ON budgets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budgets"
    ON budgets FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budgets"
    ON budgets FOR DELETE
    USING (auth.uid() = user_id);

-- Exchange Rates Policies
CREATE POLICY "Users can view their own exchange rates"
    ON exchange_rates FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exchange rates"
    ON exchange_rates FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exchange rates"
    ON exchange_rates FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exchange rates"
    ON exchange_rates FOR DELETE
    USING (auth.uid() = user_id);

-- Borrowings Lendings Policies
CREATE POLICY "Users can view their own borrowings_lendings"
    ON borrowings_lendings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own borrowings_lendings"
    ON borrowings_lendings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own borrowings_lendings"
    ON borrowings_lendings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own borrowings_lendings"
    ON borrowings_lendings FOR DELETE
    USING (auth.uid() = user_id);

-- Settings Policies
CREATE POLICY "Users can view their own settings"
    ON settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
    ON settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
    ON settings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings"
    ON settings FOR DELETE
    USING (auth.uid() = user_id);


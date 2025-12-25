-- Accounts indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_category_id ON categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
CREATE INDEX IF NOT EXISTS idx_categories_status ON categories(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_user_category_name ON categories(user_id, LOWER(TRIM(name)));

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_id ON transactions(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_linked_transaction_id ON transactions(linked_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at) WHERE deleted_at IS NULL;

-- Budgets indexes
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
CREATE INDEX IF NOT EXISTS idx_budgets_start_month ON budgets(start_month);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(status);
CREATE INDEX IF NOT EXISTS idx_budgets_recurring ON budgets(recurring);

-- Exchange Rates indexes
CREATE INDEX IF NOT EXISTS idx_exchange_rates_user_id ON exchange_rates(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_transfer_id ON exchange_rates(transfer_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_from_currency ON exchange_rates(from_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_to_currency ON exchange_rates(to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_pair ON exchange_rates(from_currency, to_currency, date DESC);

-- Borrowings Lendings indexes
CREATE INDEX IF NOT EXISTS idx_borrowings_lendings_user_id ON borrowings_lendings(user_id);
CREATE INDEX IF NOT EXISTS idx_borrowings_lendings_original_transaction_id ON borrowings_lendings(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_borrowings_lendings_type ON borrowings_lendings(type);
CREATE INDEX IF NOT EXISTS idx_borrowings_lendings_status ON borrowings_lendings(status);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);


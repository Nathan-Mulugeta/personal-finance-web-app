-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Checking', 'Savings', 'Credit', 'Investment', 'Cash', 'Bank')),
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Closed', 'Suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    category_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
    parent_category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    category_id TEXT NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(15, 2) NOT NULL,
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    description TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'Expense' CHECK (type IN ('Income', 'Expense', 'Transfer', 'Transfer Out', 'Transfer In')),
    status TEXT NOT NULL DEFAULT 'Cleared' CHECK (status IN ('Pending', 'Cleared', 'Reconciled', 'Cancelled')),
    transfer_id TEXT,
    linked_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Budgets Table
CREATE TABLE IF NOT EXISTS budgets (
    budget_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    month DATE,
    amount NUMERIC(15, 2) NOT NULL,
    recurring BOOLEAN NOT NULL DEFAULT FALSE,
    start_month DATE,
    end_month DATE,
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT budget_recurring_check CHECK (
        (recurring = FALSE AND month IS NOT NULL) OR
        (recurring = TRUE AND start_month IS NOT NULL)
    )
);

-- Exchange Rates Table
CREATE TABLE IF NOT EXISTS exchange_rates (
    exchange_rate_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transfer_id TEXT,
    from_currency TEXT NOT NULL CHECK (LENGTH(from_currency) = 3),
    to_currency TEXT NOT NULL CHECK (LENGTH(to_currency) = 3),
    rate NUMERIC(15, 6) NOT NULL,
    from_amount NUMERIC(15, 2) NOT NULL,
    to_amount NUMERIC(15, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Borrowings Lendings Table
CREATE TABLE IF NOT EXISTS borrowings_lendings (
    record_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('Borrowing', 'Lending')),
    original_transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    entity_name TEXT NOT NULL,
    original_amount NUMERIC(15, 2) NOT NULL,
    currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
    paid_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    remaining_amount NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'FullyPaid', 'Cancelled')),
    payment_transaction_ids TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT remaining_amount_check CHECK (remaining_amount = original_amount - paid_amount)
);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    setting_key TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_setting UNIQUE (user_id, setting_key)
);


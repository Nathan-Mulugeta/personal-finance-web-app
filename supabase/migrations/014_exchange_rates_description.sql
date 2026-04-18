-- Add optional description field for transfer context shown on Exchange Rates page
ALTER TABLE IF EXISTS exchange_rates
ADD COLUMN IF NOT EXISTS description TEXT;

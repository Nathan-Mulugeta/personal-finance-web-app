-- This migration is optional and can be run to set up default settings
-- Note: Settings are user-specific, so we'll create a function to initialize defaults for a user

-- Function to initialize default settings for a user
CREATE OR REPLACE FUNCTION initialize_user_settings(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert default settings if they don't exist
    INSERT INTO settings (setting_key, user_id, setting_value)
    VALUES ('BaseCurrency', p_user_id, 'ETB')
    ON CONFLICT (user_id, setting_key) DO NOTHING;

    INSERT INTO settings (setting_key, user_id, setting_value)
    VALUES ('BorrowingCategoryID', p_user_id, '')
    ON CONFLICT (user_id, setting_key) DO NOTHING;

    INSERT INTO settings (setting_key, user_id, setting_value)
    VALUES ('LendingCategoryID', p_user_id, '')
    ON CONFLICT (user_id, setting_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-initialize settings when a user signs up
-- Note: This requires a trigger on auth.users which may not be possible in Supabase
-- Alternative: Initialize settings in the application code when user first logs in


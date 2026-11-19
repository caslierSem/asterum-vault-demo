/*
# Require owner allowlist membership for card and tag changes

The write policies on cards, tags and card-tag links allowed any signed-in account.
They now require the caller to be on the owner allowlist.

1. Security changes
  - `cards`, `tags`, `card_tags`: INSERT, UPDATE and DELETE policies now test
    `is_app_owner()` instead of being unconditionally true.
  - Reading is unchanged, so guest browsing keeps working.

2. Important notes
  1. No data is touched. A stranger who registers an account can no longer write.
*/

-- cards
DROP POLICY IF EXISTS "owner_insert_cards" ON cards;
DROP POLICY IF EXISTS "owner_update_cards" ON cards;
DROP POLICY IF EXISTS "owner_delete_cards" ON cards;

CREATE POLICY "owner_insert_cards" ON cards FOR INSERT
  TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_cards" ON cards FOR UPDATE
  TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_cards" ON cards FOR DELETE
  TO authenticated USING (is_app_owner());

-- tags
DROP POLICY IF EXISTS "owner_insert_tags" ON tags;
DROP POLICY IF EXISTS "owner_update_tags" ON tags;
DROP POLICY IF EXISTS "owner_delete_tags" ON tags;

CREATE POLICY "owner_insert_tags" ON tags FOR INSERT
  TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_tags" ON tags FOR UPDATE
  TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_tags" ON tags FOR DELETE
  TO authenticated USING (is_app_owner());

-- card_tags
DROP POLICY IF EXISTS "owner_insert_card_tags" ON card_tags;
DROP POLICY IF EXISTS "owner_delete_card_tags" ON card_tags;

CREATE POLICY "owner_insert_card_tags" ON card_tags FOR INSERT
  TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_card_tags" ON card_tags FOR DELETE
  TO authenticated USING (is_app_owner());

/*
# Restrict all write access to a signed-in owner

The app now has two kinds of visitor: the owner, who maintains the collection, and
guests, who may only look at it. Until now the database accepted inserts, updates and
deletes from the anonymous role, which means from anyone holding the publishable API
key that ships inside the browser bundle. This migration moves every write behind a
real signed-in session while leaving reading open, so guest viewing keeps working.

1. Security changes
  - `cards`, `tags`, `card_tags`, `orders`, `order_lines`:
    - SELECT stays available to `anon` and `authenticated` (public read is intended).
    - INSERT, UPDATE and DELETE policies are recreated `TO authenticated` only.
    - Write privileges are revoked from `anon`; `authenticated` keeps full CRUD.
  - Order and tag functions (`create_order`, `complete_order`, `cancel_order`,
    `set_card_tags`) all write, so EXECUTE is revoked from `anon` and kept for
    `authenticated`.

2. Important notes
  1. No data is read, moved or removed by this migration. Only permissions change.
  2. Guests keep full read access, so the inventory list, filters and search are
     unaffected for visitors who are not signed in.
  3. Writes now require a Supabase session. The application's administrator login is
     switched to a real email/password sign-in in the same change.
*/

-- cards -----------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_insert_cards" ON cards;
DROP POLICY IF EXISTS "anon_update_cards" ON cards;
DROP POLICY IF EXISTS "anon_delete_cards" ON cards;

CREATE POLICY "owner_insert_cards" ON cards FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "owner_update_cards" ON cards FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "owner_delete_cards" ON cards FOR DELETE
  TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON cards FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON cards TO authenticated;

-- tags ------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_insert_tags" ON tags;
DROP POLICY IF EXISTS "anon_update_tags" ON tags;
DROP POLICY IF EXISTS "anon_delete_tags" ON tags;

CREATE POLICY "owner_insert_tags" ON tags FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "owner_update_tags" ON tags FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "owner_delete_tags" ON tags FOR DELETE
  TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON tags FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO authenticated;

-- card_tags -------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_insert_card_tags" ON card_tags;
DROP POLICY IF EXISTS "anon_update_card_tags" ON card_tags;
DROP POLICY IF EXISTS "anon_delete_card_tags" ON card_tags;

CREATE POLICY "owner_insert_card_tags" ON card_tags FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "owner_delete_card_tags" ON card_tags FOR DELETE
  TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON card_tags FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON card_tags TO authenticated;

-- orders ----------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;

CREATE POLICY "owner_insert_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "owner_update_orders" ON orders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "owner_delete_orders" ON orders FOR DELETE
  TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON orders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO authenticated;

-- order_lines -----------------------------------------------------------------
DROP POLICY IF EXISTS "anon_insert_order_lines" ON order_lines;
DROP POLICY IF EXISTS "anon_update_order_lines" ON order_lines;
DROP POLICY IF EXISTS "anon_delete_order_lines" ON order_lines;

CREATE POLICY "owner_insert_order_lines" ON order_lines FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "owner_update_order_lines" ON order_lines FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "owner_delete_order_lines" ON order_lines FOR DELETE
  TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON order_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_lines TO authenticated;

-- writing functions -----------------------------------------------------------
REVOKE EXECUTE ON FUNCTION create_order(text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION complete_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION cancel_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION set_card_tags(uuid, uuid[]) FROM anon;

GRANT EXECUTE ON FUNCTION create_order(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_card_tags(uuid, uuid[]) TO authenticated;

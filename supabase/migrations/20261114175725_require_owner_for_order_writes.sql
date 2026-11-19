/*
# Require owner allowlist membership for trade order changes

Creating, completing and cancelling orders was possible for any signed-in account,
including one a stranger had just registered. Completing an order permanently changes
stock quantities, so this is the most damaging of those capabilities.

1. Security changes
  - `orders`, `order_lines`: INSERT, UPDATE and DELETE policies now test
    `is_app_owner()`.
  - The order functions (`create_order`, `complete_order`, `cancel_order`) run with the
    caller's own rights, so they now fail for anyone not on the allowlist. Their EXECUTE
    grant to `authenticated` is left in place so the owner's app keeps working.
  - Reading order status and lines stays available, because the inventory list computes
    reserved and incoming quantities from them.

2. Important notes
  1. No order data is modified by this migration.
*/

-- orders
DROP POLICY IF EXISTS "owner_insert_orders" ON orders;
DROP POLICY IF EXISTS "owner_update_orders" ON orders;
DROP POLICY IF EXISTS "owner_delete_orders" ON orders;

CREATE POLICY "owner_insert_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_orders" ON orders FOR UPDATE
  TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_orders" ON orders FOR DELETE
  TO authenticated USING (is_app_owner());

-- order_lines
DROP POLICY IF EXISTS "owner_insert_order_lines" ON order_lines;
DROP POLICY IF EXISTS "owner_update_order_lines" ON order_lines;
DROP POLICY IF EXISTS "owner_delete_order_lines" ON order_lines;

CREATE POLICY "owner_insert_order_lines" ON order_lines FOR INSERT
  TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_order_lines" ON order_lines FOR UPDATE
  TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_order_lines" ON order_lines FOR DELETE
  TO authenticated USING (is_app_owner());

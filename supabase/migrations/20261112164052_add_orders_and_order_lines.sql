/*
# Add orders and order lines, and make the old card status optional

1. New Tables
- `orders`
  - `id` (uuid, primary key)
  - `counterparty` (text, default empty) - name or ID of the other person in the trade
  - `note` (text, default empty)
  - `status` (text, required) - one of 约换中 / 已完成 / 已取消, default 约换中
  - `created_at` (timestamp)
  - `completed_at` (timestamp, optional) - set when the order is completed
- `order_lines`
  - `id` (uuid, primary key)
  - `order_id` (uuid, references orders, cascades on delete)
  - `card_id` (uuid, references cards, set to null if the card is deleted so the order history stays)
  - `card_name` (text, required) - copy of the card name, kept for history
  - `direction` (text, required) - 流出 (sent out) or 流入 (received), one of the two
  - `quantity` (integer, required, must be 1 or more)
  - A card can appear only once per order, so it cannot be both sent out and received in the same order.

2. Modified Tables
- `cards`
  - The old `status` column (在库 / 可交换 / 已出) is kept in the database but gets a default of 在库, so new cards can be saved without it. No data is removed.

3. Security
- No sign-in is used, so the anon and authenticated roles can read and write, matching the other tables.
- RLS is enabled on both new tables with separate select, insert, update and delete policies.

4. Notes
- Order status and line direction are enforced by check constraints.
- Deleting an order removes its lines. Deleting a card keeps the order lines with the card name copy.
*/

ALTER TABLE cards ALTER COLUMN status SET DEFAULT '在库';

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '约换中' CHECK (status IN ('约换中', '已完成', '已取消')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
  card_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('流出', '流入')),
  quantity integer NOT NULL CHECK (quantity >= 1),
  UNIQUE (order_id, card_id)
);

CREATE INDEX IF NOT EXISTS order_lines_order_id_idx ON order_lines (order_id);
CREATE INDEX IF NOT EXISTS order_lines_card_id_idx ON order_lines (card_id);

ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON order_lines TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_order_lines" ON order_lines;
CREATE POLICY "anon_select_order_lines" ON order_lines FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_order_lines" ON order_lines;
CREATE POLICY "anon_insert_order_lines" ON order_lines FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_order_lines" ON order_lines;
CREATE POLICY "anon_update_order_lines" ON order_lines FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_order_lines" ON order_lines;
CREATE POLICY "anon_delete_order_lines" ON order_lines FOR DELETE
  TO anon, authenticated USING (true);

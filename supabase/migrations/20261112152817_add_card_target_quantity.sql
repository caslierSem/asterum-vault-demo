/*
# Add target quantity to cards

1. Modified Tables
- `cards`
  - New column `target_quantity` (integer, required, default 1, must be 0 or more). It is the number of copies the owner wants to keep for each card. Existing rows get 1.

2. Security
- No change. The table already has read, insert, update and delete access for anon and authenticated roles, which covers the new column.

3. Notes
- Surplus is quantity above target; missing is quantity below target. These are calculated in the app, not stored.
*/

ALTER TABLE cards ADD COLUMN IF NOT EXISTS target_quantity integer NOT NULL DEFAULT 1
  CHECK (target_quantity >= 0);

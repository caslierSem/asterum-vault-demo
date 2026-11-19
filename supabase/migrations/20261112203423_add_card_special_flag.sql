/*
# Add special edition flag to cards

1. Modified Tables
- `cards`
  - `is_special` (boolean, not null, default false): marks a card as a special edition (特典卡).

2. Security
- No grants or policies change: the new column inherits the table-level grants and policies already on `cards`.

3. Important notes
- The [特典] label is display-only. The stored `name` is never modified.
- Existing rows default to not special.
*/

ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_special boolean NOT NULL DEFAULT false;

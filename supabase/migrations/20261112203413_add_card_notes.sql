/*
# Add notes column to cards

1. Modified Tables
- `cards`
  - `notes` (text, not null, default empty string): free-form note for each card.

2. Security
- No grants or policies change: the new column inherits the table-level grants and policies already on `cards`.

3. Important notes
- Existing rows receive an empty note; no data is removed or rewritten.
- The `location` column is kept untouched; it is only hidden from the entry form.
*/

ALTER TABLE cards ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

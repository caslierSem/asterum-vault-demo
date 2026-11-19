/*
# Add defect flag to cards

1. Modified Tables
- `cards`
  - New column `is_defective` (boolean, required, default false). Marks a card as a defective copy (瑕卡).
  - Existing cards whose old condition is 瑕疵 are flagged as defective, so no information is lost.
  - `condition` gets a default of 好 so new cards no longer need to send it. The column itself is kept, not dropped.

2. Notes
- The old `collection_status` column is kept untouched; the app now derives completion status from the numbers instead.
- No grants or policies change: the new column inherits the table-level grants and policies already on `cards`.
*/

ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_defective boolean NOT NULL DEFAULT false;

UPDATE cards SET is_defective = true WHERE condition = '瑕疵' AND is_defective = false;

ALTER TABLE cards ALTER COLUMN condition SET DEFAULT '好';

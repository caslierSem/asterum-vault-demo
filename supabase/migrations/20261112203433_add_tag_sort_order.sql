/*
# Add manual sort order to tags

1. Modified Tables
- `tags`
  - `sort_order` (integer, not null, default 0): position among sibling tags. Only tags sharing the same parent path are compared.

2. Security
- No grants or policies change: the new column inherits the table-level grants and policies already on `tags`.

3. Important notes
- All existing tags start at 0, so until someone reorders them they fall back to creation order.
- Hierarchy is still defined by "/" in the tag name; sort_order never moves a tag under a different parent.
*/

ALTER TABLE tags ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

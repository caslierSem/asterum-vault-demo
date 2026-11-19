/*
# Keep private card notes out of public reads

The note button is hidden from guests in the interface, but the note text itself was
readable by anyone, and was even downloaded into every guest's browser. Notes can
mention people, prices paid and trade arrangements, so they are made owner-only.

1. Security changes
  - `cards`: table-wide SELECT is revoked from `anon` and re-granted column by column
    for every column except `notes`.
  - `authenticated` reads are unchanged, so the owner still sees notes.

2. Important notes
  1. The application is updated in the same change to request only the permitted
     columns when nobody is signed in, so the inventory list keeps working for guests.
  2. Legacy columns (`condition`, `status`, `collection_status`) are included in the
     public grant to preserve the previous behaviour of reading the whole row.
*/

REVOKE SELECT ON cards FROM anon;
GRANT SELECT (
  id,
  name,
  image_path,
  quantity,
  location,
  condition,
  price,
  status,
  created_at,
  collection_status,
  target_quantity,
  is_defective,
  is_special
) ON cards TO anon;

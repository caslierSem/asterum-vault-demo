/*
# Add atomic tag assignment function

1. New Functions
- `set_card_tags(p_card_id, p_tag_ids)` replaces all tags of one card in a single transaction: it removes the old links and inserts the new ones, so a failure never leaves a card without its tags.

2. Security
- Runs with the caller's permissions (SECURITY INVOKER), so the table policies still apply.
- Executable only by the anon and authenticated roles, since the app has no sign-in.

3. Notes
- The 3-tag limit is still enforced by the database trigger on the link table, so the function cannot exceed it.
*/

CREATE OR REPLACE FUNCTION set_card_tags(p_card_id uuid, p_tag_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM card_tags WHERE card_id = p_card_id;
  INSERT INTO card_tags (card_id, tag_id)
  SELECT p_card_id, unnest(p_tag_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION set_card_tags(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_card_tags(uuid, uuid[]) TO anon, authenticated;

/*
# Add collection status, tags and card-tag links

1. Modified Tables
- `cards`
  - New column `collection_status` (text, required, default 未齐). Allowed values: 未齐 / 凑齐. Existing rows get 未齐.

2. New Tables
- `tags`
  - `id` (uuid, primary key)
  - `name` (text, required, unique, without the leading #)
  - `created_at` (timestamp)
- `card_tags`
  - `card_id` (uuid, references cards, cascades on delete)
  - `tag_id` (uuid, references tags, cascades on delete)
  - Composite primary key so a tag can be attached to a card only once.

3. Rules
- A card can have at most 3 tags. A database trigger rejects a 4th tag link.

4. Security
- No sign-in is used, so anon and authenticated roles can read and write.
- RLS is enabled on `tags` and `card_tags` with separate select, insert, update and delete policies (card_tags has no update).
- The trigger helper function is not callable by public roles.

5. Notes
- Deleting a tag removes its links from cards but keeps the cards.
*/

ALTER TABLE cards ADD COLUMN IF NOT EXISTS collection_status text NOT NULL DEFAULT '未齐'
  CHECK (collection_status IN ('未齐', '凑齐'));

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_tags" ON tags;
CREATE POLICY "anon_select_tags" ON tags FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_tags" ON tags;
CREATE POLICY "anon_insert_tags" ON tags FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_tags" ON tags;
CREATE POLICY "anon_update_tags" ON tags FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_tags" ON tags;
CREATE POLICY "anon_delete_tags" ON tags FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS card_tags (
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

CREATE INDEX IF NOT EXISTS card_tags_tag_id_idx ON card_tags (tag_id);

ALTER TABLE card_tags ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON card_tags TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_card_tags" ON card_tags;
CREATE POLICY "anon_select_card_tags" ON card_tags FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_card_tags" ON card_tags;
CREATE POLICY "anon_insert_card_tags" ON card_tags FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_card_tags" ON card_tags;
CREATE POLICY "anon_delete_card_tags" ON card_tags FOR DELETE
  TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION enforce_max_tags_per_card()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM card_tags WHERE card_id = NEW.card_id) >= 3 THEN
    RAISE EXCEPTION '每件物品最多设置 3 个主题';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION enforce_max_tags_per_card() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS card_tags_max_three ON card_tags;
CREATE TRIGGER card_tags_max_three
  BEFORE INSERT ON card_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_max_tags_per_card();

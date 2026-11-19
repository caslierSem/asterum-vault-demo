/*
# Create card inventory table and card image storage

1. New Tables
- `cards`
  - `id` (uuid, primary key)
  - `name` (text, required) - card name
  - `image_path` (text, optional) - path of the card face image in the `card-images` storage bucket
  - `quantity` (integer, default 1, must be 0 or more) - how many copies
  - `location` (text, optional) - where the card is stored
  - `condition` (text, required) - one of 好 / 一般 / 瑕疵
  - `price` (numeric, default 0, must be 0 or more)
  - `status` (text, required) - one of 在库 / 可交换 / 已出
  - `created_at` (timestamp)

2. Storage
- New public bucket `card-images` for card face pictures.

3. Security
- No sign-in is used by this app, so the anon and authenticated roles can read and write.
- RLS is enabled on `cards` with separate select, insert, update and delete policies.
- Storage policies allow reading, uploading and deleting objects only inside the `card-images` bucket.

4. Notes
- Condition and status values are enforced by check constraints.
*/

CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_path text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  location text NOT NULL DEFAULT '',
  condition text NOT NULL CHECK (condition IN ('好', '一般', '瑕疵')),
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  status text NOT NULL CHECK (status IN ('在库', '可交换', '已出')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON cards TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_cards" ON cards;
CREATE POLICY "anon_select_cards" ON cards FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cards" ON cards;
CREATE POLICY "anon_insert_cards" ON cards FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cards" ON cards;
CREATE POLICY "anon_update_cards" ON cards FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cards" ON cards;
CREATE POLICY "anon_delete_cards" ON cards FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_select_card_images" ON storage.objects;
CREATE POLICY "anon_select_card_images" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'card-images');

DROP POLICY IF EXISTS "anon_insert_card_images" ON storage.objects;
CREATE POLICY "anon_insert_card_images" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'card-images');

DROP POLICY IF EXISTS "anon_delete_card_images" ON storage.objects;
CREATE POLICY "anon_delete_card_images" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'card-images');

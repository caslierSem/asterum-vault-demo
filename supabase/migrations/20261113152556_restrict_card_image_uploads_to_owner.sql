/*
# Restrict photo uploads to the owner and limit what can be stored

Photo files were uploadable and deletable by the anonymous role, so anyone with the
browser key could fill the storage bucket or erase the collection's images. The bucket
also accepted any file type at any size.

1. Security changes
  - `storage.objects` for the `card-images` bucket:
    - Public read stays (images are displayed to guests).
    - Insert, update and delete policies are recreated `TO authenticated` only.
  - The `card-images` bucket now accepts only common image types and files up to 20 MB,
    matching the limit the upload form already applies in the browser.

2. Important notes
  1. Existing files are untouched; only new uploads are validated.
  2. Guests can still see every card image.
*/

DROP POLICY IF EXISTS "anon_insert_card_images" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_card_images" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_card_images" ON storage.objects;

CREATE POLICY "owner_insert_card_images" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'card-images');

CREATE POLICY "owner_update_card_images" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'card-images') WITH CHECK (bucket_id = 'card-images');

CREATE POLICY "owner_delete_card_images" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'card-images');

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
    file_size_limit = 20971520
WHERE id = 'card-images';

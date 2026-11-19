/*
# Require owner allowlist membership for card photo changes

Uploading, replacing and deleting card photos was possible for any signed-in account,
so a stranger who registered could blank every card face in the collection.

1. Security changes
  - `storage.objects` for the `card-images` bucket: insert, update and delete now
    additionally require `is_app_owner()`.
  - The public read policy is left untouched, so guests still see every card image.

2. Important notes
  1. No stored files are modified by this migration.
*/

DROP POLICY IF EXISTS "owner_insert_card_images" ON storage.objects;
DROP POLICY IF EXISTS "owner_update_card_images" ON storage.objects;
DROP POLICY IF EXISTS "owner_delete_card_images" ON storage.objects;

CREATE POLICY "owner_insert_card_images" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'card-images' AND public.is_app_owner());

CREATE POLICY "owner_update_card_images" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'card-images' AND public.is_app_owner())
  WITH CHECK (bucket_id = 'card-images' AND public.is_app_owner());

CREATE POLICY "owner_delete_card_images" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'card-images' AND public.is_app_owner());

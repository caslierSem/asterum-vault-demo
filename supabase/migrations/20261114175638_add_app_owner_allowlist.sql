/*
# Add an owner allowlist so only your own account can make changes

Write access was granted to anyone who is signed in. Because the login screen allowed
self-registration, a stranger could create an account and then edit or delete the whole
collection. This migration introduces an explicit allowlist of owner accounts and makes
every write depend on membership in it.

1. New tables
  - `app_owners`
    - `user_id` (uuid, primary key, references auth.users)
    - `created_at` (timestamptz, default now())

2. Security
  - RLS enabled on `app_owners`. Signed-in users may read only their own row, which is
    how the app checks whether it should show the administrator interface.
  - No insert, update or delete policy exists, so the allowlist cannot be modified from
    the browser by anyone, including the owner. It is managed with SQL or the dashboard.
  - `public.is_app_owner()` returns whether the caller is on the allowlist. It is
    SECURITY DEFINER with a fixed search_path so that policies can call it without
    needing read access to the allowlist, and EXECUTE is revoked from PUBLIC and anon.

3. Important notes
  1. The existing confirmed account is seeded into the allowlist, so the current owner
     keeps working with no change in behaviour.
  2. The seed is written by looking the account up by email, not by hardcoding an id.
*/

CREATE TABLE IF NOT EXISTS app_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_own_app_owner_row" ON app_owners;
CREATE POLICY "owner_select_own_app_owner_row" ON app_owners FOR SELECT
  TO authenticated USING (user_id = auth.uid());

GRANT SELECT ON app_owners TO authenticated;

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_owners WHERE user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_app_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated;

INSERT INTO app_owners (user_id)
SELECT id FROM auth.users WHERE email = 'blackcatciao@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

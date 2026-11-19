/*
# Make the owner check run with the caller's own rights

The owner check was created as a SECURITY DEFINER function. It is only ever asked
"is the current caller an owner", and the allowlist already lets a signed-in user read
their own row, so elevated rights are unnecessary. Switching it to invoker rights keeps
the behaviour identical while removing the elevated-privilege surface.

1. Security changes
  - `public.is_app_owner()` becomes SECURITY INVOKER. It still returns only a boolean
    about the caller, EXECUTE stays revoked from PUBLIC and anon, and `authenticated`
    keeps EXECUTE because the app uses it to decide whether to show the owner screens.

2. Important notes
  1. Row level security on `app_owners` plus the own-row read policy means a signed-in
     user can confirm their own membership and nothing else.
*/

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_owners WHERE user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_app_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated;

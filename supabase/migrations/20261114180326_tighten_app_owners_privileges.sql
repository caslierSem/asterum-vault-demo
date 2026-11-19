/*
# Remove unused privileges on the owner allowlist

The allowlist table inherited the project's blanket privileges, which gave the anonymous
and signed-in roles insert, update and delete privileges on it. Row level security
already denied those operations because no write policy exists, but the privileges serve
no purpose and are removed so the allowlist cannot be targeted at all.

1. Security changes
  - `app_owners`: all privileges revoked from `anon`; only SELECT kept for
    `authenticated`, which the own-row read policy restricts to the caller's own row.

2. Important notes
  1. The allowlist continues to be managed with SQL or the dashboard, never from the
     browser.
*/

REVOKE ALL ON app_owners FROM anon;
REVOKE INSERT, UPDATE, DELETE ON app_owners FROM authenticated;
GRANT SELECT ON app_owners TO authenticated;

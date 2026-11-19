/*
# Remove privileges that bypass row level security

Every table in the public schema inherited TRUNCATE, TRIGGER and REFERENCES privileges
for the anonymous and signed-in roles from the project's default grants. TRUNCATE in
particular is not filtered by row level security, so it is removed as a precaution even
though the Data API does not expose it. The application never uses any of the three.

1. Security changes
  - TRUNCATE, TRIGGER and REFERENCES revoked from `anon` and `authenticated` on
    `cards`, `tags`, `card_tags`, `orders`, `order_lines` and `app_owners`.
  - SELECT, INSERT, UPDATE and DELETE privileges are left exactly as they are, so no
    application behaviour changes.
*/

REVOKE TRUNCATE, TRIGGER, REFERENCES ON cards FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON tags FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON card_tags FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON orders FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON order_lines FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON app_owners FROM anon, authenticated;

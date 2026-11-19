/*
# Keep trade partner names and order notes out of public reads

The inventory list shows reserved and incoming quantities, which are computed from open
orders, so visitors need to read order status and lines. They do not need the trading
partner's name or the owner's private note, both of which were readable by anyone.

1. Security changes
  - `orders`: table-wide SELECT is revoked from `anon` and re-granted column by column
    for `id`, `status`, `created_at` and `completed_at` only. `counterparty` and `note`
    are no longer readable without a session.
  - `order_lines` is unchanged; it holds only card names, direction and quantity.
  - `authenticated` reads are unchanged.

2. Important notes
  1. The application is updated in the same change to request only the permitted
     columns when nobody is signed in, so guest browsing keeps working.
*/

REVOKE SELECT ON orders FROM anon;
GRANT SELECT (id, status, created_at, completed_at) ON orders TO anon;

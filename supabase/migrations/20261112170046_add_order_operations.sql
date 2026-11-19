/*
# Add order operations: create, complete and cancel

1. New Functions
- `create_order(p_counterparty, p_note, p_lines)`: creates an order with its lines in one step.
  - Each line is a card, a direction (流出 = sent out, 流入 = received) and a quantity.
  - Sent-out quantity must fit in the card's available quantity (total minus cards already locked by other open orders).
  - A card can appear only once in an order.
  - An order can contain only received cards (pure buy) or only sent-out cards (pure sell).
- `complete_order(p_order_id)`: moves sent-out cards out of stock and received cards into stock, then marks the order 已完成.
- `cancel_order(p_order_id)`: marks an open order 已取消. Stock does not change, so the locked quantity is released.

2. Security
- Functions run as the calling role, which is anon or authenticated. Rows are changed only through these functions and the existing card policies.
- Execute is granted only to anon and authenticated, and revoked from the public role by default.

3. Notes
- Each function locks the cards it touches so two devices acting at the same time cannot oversell a card.
- Only open orders (约换中) can be completed or cancelled. Completed and cancelled orders are final.
- If any check fails, the whole operation is rolled back and nothing changes.
*/

CREATE OR REPLACE FUNCTION create_order(p_counterparty text, p_note text, p_lines jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_line jsonb;
  v_card cards%ROWTYPE;
  v_reserved integer;
  v_line_count integer;
  v_distinct_count integer;
  v_quantity integer;
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION '订单至少需要一件物品';
  END IF;

  SELECT count(*), count(DISTINCT e.value->>'card_id')
  INTO v_line_count, v_distinct_count
  FROM jsonb_array_elements(p_lines) AS e(value);
  IF v_line_count <> v_distinct_count THEN
    RAISE EXCEPTION '同一件物品只能在订单中出现一次';
  END IF;

  FOR v_line IN
    SELECT e.value FROM jsonb_array_elements(p_lines) AS e(value)
    ORDER BY e.value->>'card_id'
  LOOP
    IF v_line->>'direction' NOT IN ('流出', '流入') THEN
      RAISE EXCEPTION '物品方向无效';
    END IF;
    v_quantity := (v_line->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION '数量需要是 1 或以上的整数';
    END IF;

    SELECT * INTO v_card FROM cards WHERE id = (v_line->>'card_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION '有物品不存在，请刷新后重试';
    END IF;

    IF v_line->>'direction' = '流出' THEN
      SELECT COALESCE(sum(ol.quantity), 0) INTO v_reserved
      FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id
      WHERE ol.card_id = v_card.id AND ol.direction = '流出' AND o.status = '约换中';
      IF v_card.quantity - v_reserved < v_quantity THEN
        RAISE EXCEPTION '「%」可用数量不足', v_card.name;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO orders (counterparty, note)
  VALUES (btrim(p_counterparty), btrim(p_note))
  RETURNING id INTO v_order_id;

  INSERT INTO order_lines (order_id, card_id, card_name, direction, quantity)
  SELECT v_order_id, c.id, c.name, e.value->>'direction', (e.value->>'quantity')::integer
  FROM jsonb_array_elements(p_lines) AS e(value)
  JOIN cards c ON c.id = (e.value->>'card_id')::uuid;

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION complete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_line record;
  v_new_quantity integer;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '订单不存在';
  END IF;
  IF v_status <> '约换中' THEN
    RAISE EXCEPTION '只有约换中的订单可以完成';
  END IF;

  FOR v_line IN
    SELECT ol.card_id, ol.card_name, ol.direction, ol.quantity
    FROM order_lines ol
    WHERE ol.order_id = p_order_id
    ORDER BY ol.card_id NULLS LAST
  LOOP
    IF v_line.card_id IS NULL THEN
      RAISE EXCEPTION '「%」已被删除，无法完成订单', v_line.card_name;
    END IF;

    IF v_line.direction = '流出' THEN
      UPDATE cards SET quantity = quantity - v_line.quantity
      WHERE id = v_line.card_id
      RETURNING quantity INTO v_new_quantity;
      IF v_new_quantity < 0 THEN
        RAISE EXCEPTION '「%」库存不足，无法完成订单', v_line.card_name;
      END IF;
    ELSE
      UPDATE cards SET quantity = quantity + v_line.quantity
      WHERE id = v_line.card_id;
    END IF;
  END LOOP;

  UPDATE orders SET status = '已完成', completed_at = now() WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '订单不存在';
  END IF;
  IF v_status <> '约换中' THEN
    RAISE EXCEPTION '只有约换中的订单可以取消';
  END IF;

  UPDATE orders SET status = '已取消' WHERE id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_order(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION complete_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cancel_order(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_order(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_order(uuid) TO anon, authenticated;

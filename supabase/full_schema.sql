-- ============================================================================
-- Asterum Vault 完整数据库初始化脚本 (full_schema.sql)
-- 适用环境：全新空白 Supabase 项目（在 SQL Editor 中全选粘贴运行即可）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 第一部分：创建全部 7 张核心数据表
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_owners (
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_path text,
  quantity int4 NOT NULL DEFAULT 1,
  location text NOT NULL DEFAULT ''::text,
  condition text NOT NULL DEFAULT '好'::text,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT '在库'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  collection_status text NOT NULL DEFAULT '未齐'::text,
  target_quantity int4 NOT NULL DEFAULT 1,
  is_defective bool NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT ''::text,
  is_special bool NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sort_order int4 NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.card_tags (
  card_id uuid NOT NULL,
  tag_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  counterparty text NOT NULL DEFAULT ''::text,
  note text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT '约换中'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.order_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  card_id uuid,
  card_name text NOT NULL,
  direction text NOT NULL,
  quantity int4 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  id int4 NOT NULL DEFAULT 1,
  guest_passcode text NOT NULL DEFAULT ''::text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 第二部分：添加全部主键、外键、唯一约束与业务检查约束
-- ----------------------------------------------------------------------------

ALTER TABLE public.app_owners ADD CONSTRAINT app_owners_pkey PRIMARY KEY (user_id);
ALTER TABLE public.app_owners ADD CONSTRAINT app_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.cards ADD CONSTRAINT cards_pkey PRIMARY KEY (id);
ALTER TABLE public.cards ADD CONSTRAINT cards_target_quantity_check CHECK ((target_quantity >= 0));
ALTER TABLE public.cards ADD CONSTRAINT cards_collection_status_check CHECK ((collection_status = ANY (ARRAY['未齐'::text, '凑齐'::text])));
ALTER TABLE public.cards ADD CONSTRAINT cards_condition_check CHECK ((condition = ANY (ARRAY['好'::text, '一般'::text, '瑕疵'::text])));
ALTER TABLE public.cards ADD CONSTRAINT cards_price_check CHECK ((price >= (0)::numeric));
ALTER TABLE public.cards ADD CONSTRAINT cards_quantity_check CHECK ((quantity >= 0));
ALTER TABLE public.cards ADD CONSTRAINT cards_status_check CHECK ((status = ANY (ARRAY['在库'::text, '可交换'::text, '已出'::text])));

ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);
ALTER TABLE public.tags ADD CONSTRAINT tags_name_key UNIQUE (name);
ALTER TABLE public.tags ADD CONSTRAINT tags_name_check CHECK ((length(btrim(name)) > 0));

ALTER TABLE public.card_tags ADD CONSTRAINT card_tags_pkey PRIMARY KEY (card_id, tag_id);
ALTER TABLE public.card_tags ADD CONSTRAINT card_tags_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;
ALTER TABLE public.card_tags ADD CONSTRAINT card_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['约换中'::text, '已完成'::text, '已取消'::text])));

ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_order_id_card_id_key UNIQUE (order_id, card_id);
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE SET NULL;
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_quantity_check CHECK ((quantity >= 1));
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_direction_check CHECK ((direction = ANY (ARRAY['流出'::text, '流入'::text])));

ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_id_check CHECK ((id = 1));

INSERT INTO public.site_settings (id, guest_passcode)
VALUES (1, 'plave2026')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 第三部分：创建全部业务 RPC 与权限校验函数
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM app_owners WHERE user_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.enforce_max_tags_per_card()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT count(*) FROM card_tags WHERE card_id = NEW.card_id) >= 3 THEN
    RAISE EXCEPTION '每张卡片最多设置 3 个主题';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_card_tags(p_card_id uuid, p_tag_ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM card_tags WHERE card_id = p_card_id;
  INSERT INTO card_tags (card_id, tag_id)
  SELECT p_card_id, unnest(p_tag_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order(p_counterparty text, p_note text, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION '订单至少需要一张卡片';
  END IF;
  SELECT count(*), count(DISTINCT e.value->>'card_id') INTO v_line_count, v_distinct_count
  FROM jsonb_array_elements(p_lines) AS e(value);
  IF v_line_count <> v_distinct_count THEN
    RAISE EXCEPTION '同一张卡片只能在订单中出现一次';
  END IF;
  FOR v_line IN SELECT e.value FROM jsonb_array_elements(p_lines) AS e(value) ORDER BY e.value->>'card_id' LOOP
    IF v_line->>'direction' NOT IN ('流出', '流入') THEN RAISE EXCEPTION '卡片方向无效'; END IF;
    v_quantity := (v_line->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION '数量需要是 1 或以上的整数'; END IF;
    SELECT * INTO v_card FROM cards WHERE id = (v_line->>'card_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '有卡片不存在，请刷新后重试'; END IF;
    IF v_line->>'direction' = '流出' THEN
      SELECT COALESCE(sum(ol.quantity), 0) INTO v_reserved FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id WHERE ol.card_id = v_card.id AND ol.direction = '流出' AND o.status = '约换中';
      IF v_card.quantity - v_reserved < v_quantity THEN RAISE EXCEPTION '「%」可用数量不足', v_card.name; END IF;
    END IF;
  END LOOP;
  INSERT INTO orders (counterparty, note) VALUES (btrim(p_counterparty), btrim(p_note)) RETURNING id INTO v_order_id;
  INSERT INTO order_lines (order_id, card_id, card_name, direction, quantity)
  SELECT v_order_id, c.id, c.name, e.value->>'direction', (e.value->>'quantity')::integer
  FROM jsonb_array_elements(p_lines) AS e(value) JOIN cards c ON c.id = (e.value->>'card_id')::uuid;
  RETURN v_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_line record;
  v_new_quantity integer;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '订单不存在'; END IF;
  IF v_status <> '约换中' THEN RAISE EXCEPTION '只有约换中的订单可以完成'; END IF;
  FOR v_line IN SELECT ol.card_id, ol.card_name, ol.direction, ol.quantity FROM order_lines ol WHERE ol.order_id = p_order_id ORDER BY ol.card_id NULLS LAST LOOP
    IF v_line.card_id IS NULL THEN RAISE EXCEPTION '「%」已被删除，无法完成订单', v_line.card_name; END IF;
    IF v_line.direction = '流出' THEN
      UPDATE cards SET quantity = quantity - v_line.quantity WHERE id = v_line.card_id RETURNING quantity INTO v_new_quantity;
      IF v_new_quantity < 0 THEN RAISE EXCEPTION '「%」库存不足，无法完成订单', v_line.card_name; END IF;
    ELSE
      UPDATE cards SET quantity = quantity + v_line.quantity WHERE id = v_line.card_id;
    END IF;
  END LOOP;
  UPDATE orders SET status = '已完成', completed_at = now() WHERE id = p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '订单不存在'; END IF;
  IF v_status <> '约换中' THEN RAISE EXCEPTION '只有约换中的订单可以取消'; END IF;
  UPDATE orders SET status = '已取消' WHERE id = p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_valid_guest_passcode()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE expected_code text; client_info text;
BEGIN
  SELECT guest_passcode INTO expected_code FROM public.site_settings WHERE id = 1;
  IF expected_code IS NULL OR expected_code = '' THEN RETURN true; END IF;
  BEGIN client_info := current_setting('request.headers', true)::jsonb->>'x-client-info'; EXCEPTION WHEN OTHERS THEN client_info := ''; END;
  RETURN COALESCE(client_info, '') LIKE ('%pass:' || expected_code || '%');
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_guest_passcode(input_code text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE expected_code text;
BEGIN
  SELECT guest_passcode INTO expected_code FROM public.site_settings WHERE id = 1;
  IF expected_code IS NULL OR expected_code = '' THEN RETURN true; END IF;
  RETURN COALESCE(input_code, '') = expected_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_guest_passcode(new_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_app_owner() THEN RAISE EXCEPTION '无权限修改访客口令'; END IF;
  UPDATE public.site_settings SET guest_passcode = COALESCE(TRIM(new_code), ''), updated_at = now() WHERE id = 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.has_valid_guest_passcode() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_guest_passcode(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_guest_passcode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_card_tags(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;

CREATE TRIGGER card_tags_max_three
  BEFORE INSERT ON public.card_tags
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_tags_per_card();
-- ----------------------------------------------------------------------------
-- 第五部分：开启全部 7 张表的行级安全保护 (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.app_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 第六部分：配置全部行级安全策略 (RLS Policies)
-- ----------------------------------------------------------------------------

CREATE POLICY "owner_select_own_app_owner_row" ON public.app_owners FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "guest_select_cards_with_passcode" ON public.cards FOR SELECT TO anon USING (has_valid_guest_passcode());
CREATE POLICY "owner_select_cards" ON public.cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_insert_cards" ON public.cards FOR INSERT TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_cards" ON public.cards FOR UPDATE TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_cards" ON public.cards FOR DELETE TO authenticated USING (is_app_owner());

CREATE POLICY "guest_select_tags_with_passcode" ON public.tags FOR SELECT TO anon USING (has_valid_guest_passcode());
CREATE POLICY "owner_select_tags" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_insert_tags" ON public.tags FOR INSERT TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_tags" ON public.tags FOR UPDATE TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_tags" ON public.tags FOR DELETE TO authenticated USING (is_app_owner());

CREATE POLICY "guest_select_card_tags_with_passcode" ON public.card_tags FOR SELECT TO anon USING (has_valid_guest_passcode());
CREATE POLICY "owner_select_card_tags" ON public.card_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_insert_card_tags" ON public.card_tags FOR INSERT TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_card_tags" ON public.card_tags FOR DELETE TO authenticated USING (is_app_owner());

CREATE POLICY "guest_select_orders_with_passcode" ON public.orders FOR SELECT TO anon USING (has_valid_guest_passcode());
CREATE POLICY "owner_select_orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_insert_orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_orders" ON public.orders FOR UPDATE TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_orders" ON public.orders FOR DELETE TO authenticated USING (is_app_owner());

CREATE POLICY "guest_select_order_lines_with_passcode" ON public.order_lines FOR SELECT TO anon USING (has_valid_guest_passcode());
CREATE POLICY "owner_select_order_lines" ON public.order_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_insert_order_lines" ON public.order_lines FOR INSERT TO authenticated WITH CHECK (is_app_owner());
CREATE POLICY "owner_update_order_lines" ON public.order_lines FOR UPDATE TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());
CREATE POLICY "owner_delete_order_lines" ON public.order_lines FOR DELETE TO authenticated USING (is_app_owner());

CREATE POLICY "owner_manage_site_settings" ON public.site_settings FOR ALL TO authenticated USING (is_app_owner()) WITH CHECK (is_app_owner());

-- ----------------------------------------------------------------------------
-- 第七部分：配置列级隐私权限 (屏蔽访客查看 notes 与 counterparty)
-- ----------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT (id, name, image_path, quantity, location, condition, price, status, created_at, collection_status, target_quantity, is_defective, is_special) ON public.cards TO anon;
GRANT SELECT (id, name, sort_order, created_at) ON public.tags TO anon;
GRANT SELECT (card_id, tag_id) ON public.card_tags TO anon;
GRANT SELECT (id, status, created_at, completed_at) ON public.orders TO anon;
GRANT SELECT (id, order_id, card_id, card_name, direction, quantity) ON public.order_lines TO anon;

GRANT ALL ON public.app_owners TO authenticated;
GRANT ALL ON public.cards TO authenticated;
GRANT ALL ON public.tags TO authenticated;
GRANT ALL ON public.card_tags TO authenticated;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.order_lines TO authenticated;
GRANT SELECT, UPDATE ON public.site_settings TO authenticated;

-- ----------------------------------------------------------------------------
-- 第八部分：创建 card-images 图片存储桶及访问策略
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anon_select_card_images" ON storage.objects FOR SELECT TO anon, authenticated USING ((bucket_id = 'card-images'::text));
CREATE POLICY "owner_insert_card_images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'card-images'::text) AND is_app_owner()));
CREATE POLICY "owner_update_card_images" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'card-images'::text) AND is_app_owner())) WITH CHECK (((bucket_id = 'card-images'::text) AND is_app_owner()));
CREATE POLICY "owner_delete_card_images" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'card-images'::text) AND is_app_owner()));

-- ----------------------------------------------------------------------------
-- 第九部分：新部署初始化管理员指引（建库后手动执行）
-- ----------------------------------------------------------------------------
-- 步骤 1：在 Supabase 后台 Authentication -> Users 中创建一个管理员账号（邮箱+密码）。
-- 步骤 2：将下方的示例邮箱替换为你的管理员邮箱，取消注释并执行，即可授予管理员权限：
--
-- INSERT INTO public.app_owners (user_id)
-- SELECT id FROM auth.users WHERE email = '你的管理员邮箱@example.com';

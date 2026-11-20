# Asterum Vault（PLAVE 小卡收藏管理）技术架构文档

> 面向开发者的全中文技术说明。技术栈为 Vite 7 + React 18 + TypeScript + Tailwind CSS 3，
> 后端采用 Supabase（PostgreSQL + Auth + Storage）。所有数据库结构以
> `supabase/full_schema.sql` 为唯一权威来源，本文中的描述与该脚本逐行核对过。

---

## 一、技术栈与目录结构

### 1.1 技术栈总览

| 层 | 技术 | 说明 |
|---|---|---|
| 构建工具 | Vite 7 | 开发与生产构建，路径别名 `@/` → `src/` |
| 前端框架 | React 18 | 函数组件 + Hooks，`ErrorBoundary` 为唯一的 Class 组件 |
| 样式 | Tailwind CSS 3 | 无任何第三方 UI 组件库 |
| 图标 | lucide-react 0.446 | 全站唯一图标来源 |
| 后端 | Supabase JS v2 | 浏览器直连数据库，无自建服务器，无 Edge Functions |
| 图片导出 | html-to-image / html2canvas | 换卡海报的客户端高清截图 |

### 1.2 目录结构与职责

```
src/
├── main.tsx                    # 应用入口，挂载 <App/>
├── App.tsx                     # 顶层壳：角色解析、导航栏、视图路由（useState 切换，非路由库）
├── index.css                   # Tailwind 入口
├── lib/                        # 数据层与纯逻辑层（不含 JSX）
│   ├── supabase.ts             # Supabase 客户端单例；自定义 fetch 拦截器向每个请求注入 x-client-info 口令头
│   ├── session.ts              # 角色（owner/guest）状态：sessionStorage 键 plave-guest、管理员登入、is_app_owner 服务端复核
│   ├── guestAccess.ts          # 访客口令：localStorage 缓存（asterum_guest_passcode）、URL ?code= 免密链接、RPC 验证与修改
│   ├── cards.ts                # 卡片 CRUD、图片上传/删除（Storage 桶 card-images）、显示名/特典瑕疵标签、富余与缺少计算
│   ├── tags.ts                 # 主题（标签）树：名称归一化、斜杠层级、兄弟排序（sort_order）、每卡上限 3 个
│   ├── orders.ts               # 订单读写：按登录态切换 SELECT 列集（隐私隔离）、create/complete/cancel 三个 RPC 封装
│   ├── dbError.ts              # toUserError：数据库错误统一转用户话术，仅放行 P0001 业务异常
│   ├── useInventory.ts         # 核心库存 Hook：并行拉取卡片 + 活跃订单，computeCardStocks 计算可用/在途/待入库
│   ├── useTags.ts              # 主题列表 Hook（供筛选器等轻量场景）
│   ├── useOrderDraft.ts        # 订单表单草稿 Hook：localStorage 键 plave_order_draft 的读写、失效物品校验与提示
│   ├── useBoardExport.ts       # 换卡海报导出 Hook：图片跨域预加载 → 离屏 1400px 容器 → toJpeg 生成并写入隐形元数据
│   ├── posterMetadata.ts       # 换卡海报 JPEG 注释段（COM 0xFFFE）隐形元数据二进制写入与解析，支持原图导入秒级无损还原
│   ├── cardFields.ts           # 表单字段类型（CardFieldValues）、解析与校验（parseFieldValues）
│   ├── cardFilters.ts          # 列表筛选器纯函数：名称搜索、主题、收藏状态、属性（特典/瑕疵）、库存状态
│   ├── cardStatus.ts           # 完备度状态机：short/complete/surplus 徽标文案与配色，含“已凑齐 + 在途”的 * 号规则
│   ├── cardDetection.ts        # 截图录入识别引擎：两阶段背景检测、动态分辨率下限、标签剥离与一维投影谷底切分
│   ├── imageCompression.ts     # 上传前图片压缩（Canvas 重绘为 JPEG）
│   └── formStyles.ts           # 全站复用的输入框/按钮/下拉样式类常量
└── components/
    ├── BrandLogo.tsx           # 品牌标识
    ├── ErrorBoundary.tsx       # 全局错误兜底（Class 组件），捕获渲染异常并显示“刷新页面”
    ├── RoleGate.tsx            # 登录闸门：管理员邮箱密码登录 / 访客口令进入（两步式弹窗）
    ├── GuestPasscodeModal.tsx  # 管理员专用：查看/修改访客口令、生成免密分享链接
    ├── CardList.tsx            # 列表页：统计栏、筛选器、分页（每页 48）、/ 键聚焦搜索
    ├── CardListItem.tsx        # 单张卡片：图片骨架屏、库存快调 +/-、状态徽标、快捷操作
    ├── CardThumbnail.tsx       # 卡图缩略图
    ├── CardForm.tsx            # 录入页：单卡录入 + 批量截图导入 + 拖拽上传
    ├── CardDetailFields.tsx    # 卡片表单字段区（录入/编辑共用）
    ├── CardEditDialog.tsx      # 编辑弹窗：保存/删除/复制并新建
    ├── CardNoteDialog.tsx      # 备注查看弹窗
    ├── CardFilterBar.tsx       # 筛选条件条
    ├── CardPicker.tsx          # 卡片选择器（订单行选择物品）
    ├── TagManager.tsx          # 主题管理页：层级树、兄弟排序、增删改
    ├── TagPicker.tsx           # 主题多选（含上限 3 的提示）
    ├── TagFilterInput.tsx      # 按主题筛选的输入区
│   ├── ScreenshotImport.tsx    # 截图与海报上传入口：优先解析海报原图元数据无损还原，缺失时降级走图像识别切图
│   ├── ImportReview.tsx        # 截图识别结果复核（支持根据是否已还原元数据智能控制批量默认值弹窗）
    ├── OrdersPage.tsx          # 订单页：搜索、状态筛选、订单列表
    ├── OrderForm.tsx           # 新建订单表单
    ├── OrderLineSection.tsx    # 订单行区块（流出/流入两组），导出 DraftLineState 类型
    ├── OrderCard.tsx           # 单笔订单展示
    ├── OrderEditMetaDialog.tsx # 订单基础信息编辑弹窗（仅交易对象与备注）
    ├── CancelOrderDialog.tsx   # 取消交易弹窗（直接取消 / 取消并复制新建）
    ├── ConfirmDialog.tsx       # 通用确认弹窗
    ├── BatchEditWizard.tsx     # 批量管理向导：步骤状态机与选卡搜索（第一步）
    ├── BatchEditFormStep.tsx   # 批量管理向导：属性设置步骤（从 Wizard 拆出）
    ├── BatchDefaultsDialog.tsx # 批量录入默认值弹窗
    └── SwapBoardView.tsx       # 换卡海报页：HAVE/WANT 双栏、纯净截图模式、高清导出
```

**职责分工原则**：`src/lib/` 只做数据访问、类型定义与纯函数计算，不渲染 JSX；
`src/components/` 只做展示与交互，跨组件状态通过 Props 回调向上传递。
长业务流程拆分为独立 Hook（`useOrderDraft`、`useBoardExport`）或子步骤组件
（`BatchEditFormStep`），保证单文件可读性。

---

## 二、数据库设计与安全隔离机制

### 2.1 表结构与字段含义（共 7 张表）

**app_owners — 管理员名单**

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | uuid PK | 关联 `auth.users(id)`，ON DELETE CASCADE |
| created_at | timestamptz | 加入名单时间 |

该表是唯一的管理员凭据来源：浏览器无任何 INSERT/UPDATE/DELETE 策略，
新增管理员只能由项目所有者在 Supabase 后台手动执行 SQL（见 full_schema.sql 第九部分注释）。

**cards — 卡片库存主表**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | text NOT NULL | 存储名（永不加前后缀；特典/瑕疵标签仅在渲染层拼接） |
| image_path | text nullable | Storage 桶内对象路径，NULL 表示无图 |
| quantity | int4 ≥ 0，默认 1 | 实卡库存数量 |
| location | text，默认 '' | 收纳位置（如“册子A第3页”） |
| condition | text CHECK ∈ {好, 一般, 瑕疵}，默认 '好' | 品相 |
| price | numeric ≥ 0，默认 0 | 参考价格（元） |
| status | text CHECK ∈ {在库, 可交换, 已出}，默认 '在库' | 流通状态 |
| created_at | timestamptz | 创建时间 |
| collection_status | text CHECK ∈ {未齐, 凑齐}，默认 '未齐' | 收藏目标状态 |
| target_quantity | int4 ≥ 0，默认 1 | 目标持有数量（完备度计算基准） |
| is_defective | bool，默认 false | 瑕疵标记（渲染为 [瑕疵] 前缀与“瑕”角标） |
| notes | text，默认 '' | 私有备注（**列级隐私字段，访客不可读**） |
| is_special | bool，默认 false | 特典标记（渲染为 [特典] 前缀与“特”角标） |

**tags — 主题（标签）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| name | text UNIQUE，btrim 后非空 | 支持斜杠层级（如 `出道专/小卡`） |
| created_at | timestamptz | |
| sort_order | int4，默认 0 | 兄弟节点手动排序权重 |

**card_tags — 卡片↔主题关联（多对多）**

| 字段 | 类型 | 说明 |
|---|---|---|
| card_id | uuid，复合 PK，FK→cards ON DELETE CASCADE | |
| tag_id | uuid，复合 PK，FK→tags ON DELETE CASCADE | |

**orders — 交易订单**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| counterparty | text，默认 '' | 交易对象（**列级隐私字段，访客不可读**） |
| note | text，默认 '' | 订单备注（**列级隐私字段，访客不可读**） |
| status | text CHECK ∈ {约换中, 已完成, 已取消}，默认 '约换中' | 状态机（见第三章） |
| created_at | timestamptz | |
| completed_at | timestamptz nullable | 完成时间，取消时保持 NULL |

**order_lines — 订单明细**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK→orders ON DELETE CASCADE | |
| card_id | uuid nullable，FK→cards ON DELETE SET NULL | 卡片删除后保留快照名，置 NULL |
| card_name | text NOT NULL | 下单时刻的卡片名快照 |
| direction | text CHECK ∈ {流出, 流入} | 方向 |
| quantity | int4 ≥ 1 | 数量 |
| 约束 | UNIQUE(order_id, card_id) | 同一订单中每张卡只能出现一行 |

**site_settings — 站点设置（单行表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int4 PK，CHECK (id = 1) | 恒为 1 的单行 |
| guest_passcode | text，默认 '' | 访客口令；空字符串 = 关闭口令（全公开） |
| updated_at | timestamptz | |

### 2.2 触发器：单卡最多 3 个主题

`card_tags_max_three` 触发器挂载于 `card_tags` 的 BEFORE INSERT，调用
`enforce_max_tags_per_card()`：若该卡已有 ≥ 3 条关联则抛出
`每张卡片最多设置 3 个主题`。前端 `tags.ts` 导出常量 `MAX_TAGS_PER_CARD = 3`
与之呼应，但数据库约束是最终防线。

### 2.3 RLS 行级权限策略

所有 7 张表均已 `ENABLE ROW LEVEL SECURITY`。策略分三种角色维度：

1. **管理员（authenticated + `is_app_owner()` 为真）**：对 cards/tags/card_tags/
   orders/order_lines 拥有全部 CRUD 策略（USING 与 WITH CHECK 均为 `is_app_owner()`）；
   对 site_settings 有一条 `FOR ALL` 的 `owner_manage_site_settings`。
   即**全库只有名单内账号可写**。
2. **普通登录用户（authenticated 且不在名单）**：`is_app_owner()` 返回 false，
   所有写策略谓词为假——更新匹配 0 行、插入/删除被拒；只能读（读策略为
   `USING (true)`，与管理员一致）。新增管理员无任何自助途径。
3. **匿名访客（anon）**：对所有业务表只有 SELECT 策略
   `guest_select_*_with_passcode`，谓词为 `has_valid_guest_passcode()`——
   即必须携带正确口令（见 3.6 节）才能读到行；site_settings 对 anon 无任何策略
   （口令本身不可读）。

`is_app_owner()` 是 STABLE SQL 函数（非 SECURITY DEFINER，search_path 固定为 public），
仅 EXECUTE 授予 authenticated。 `app_owners` 表自身只授权 authenticated SELECT，
且 SELECT 策略限定 `user_id = auth.uid()`（用户只能看到自己那一行，名单大小不外泄）。

### 2.4 列级权限：隔离 notes 与 counterparty 隐私字段

RLS 控制“能不能看到行”，列级 GRANT 控制“这一行里能给哪些列”。脚本先
`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` 清零，再按列白名单授予：

| 表 | anon 可 SELECT 的列 | anon 不可读的隐私列 |
|---|---|---|
| cards | id, name, image_path, quantity, location, condition, price, status, created_at, collection_status, target_quantity, is_defective, is_special | **notes** |
| orders | id, status, created_at, completed_at | **counterparty、note** |
| tags | id, name, sort_order, created_at | — |
| card_tags | card_id, tag_id | — |
| order_lines | id, order_id, card_id, card_name, direction, quantity | — |

前端配合：`cards.ts` 与 `orders.ts` 均在请求前检查登录态，未登录时使用不含隐私列的
SELECT 列集（`CARD_SELECT_PUBLIC` / `ORDER_SELECT_PUBLIC`），登录时使用 `*`。
即使攻击者绕过前端直接用 anon key 查询隐私列，也会得到权限拒绝。
authenticated 角色则为 `GRANT ALL`（写权限仍受 RLS 的 `is_app_owner()` 约束）。

### 2.5 存储桶（Storage）

- 桶 `card-images`：public 读（访客与游客可看图）。
- `storage.objects` 策略：SELECT 对 anon+authenticated 开放（`bucket_id = 'card-images'`）；
  INSERT/UPDATE/DELETE 仅 authenticated 且 `is_app_owner()`。
- 桶配置：`file_size_limit` 20MB，`allowed_mime_types` 限定
  jpeg/png/webp/gif/heic/heif——服务端兜底，前端压缩仅为体验优化。

### 2.6 业务 RPC 函数（一律 SET search_path，SECURITY INVOKER）

| 函数 | 作用 | 执行权限 |
|---|---|---|
| `is_app_owner()` | 名单判定 | authenticated |
| `set_card_tags(card_id, tag_ids)` | 整组替换卡片主题（DELETE 后 INSERT） | authenticated（受 RLS + 触发器约束） |
| `create_order(counterparty, note, lines jsonb)` | 建单（服务端校验见 3.4 节） | authenticated |
| `complete_order(order_id)` | 完成订单并落库存 | authenticated |
| `cancel_order(order_id)` | 取消订单 | authenticated |
| `has_valid_guest_passcode()` | RLS 谓词：校验请求头中的口令 | anon, authenticated |
| `verify_guest_passcode(input_code)` | 登录页口令校验 | anon, authenticated |
| `update_guest_passcode(new_code)` | 管理员改口令（内部显式调 `is_app_owner()` 拒绝越权） | authenticated |

---

## 三、核心计算公式与业务状态机

### 3.1 库存三元组（useInventory.ts / computeCardStocks）

对每张卡片，扫描所有 **约换中** 订单的明细行：

```
reserved  (在途/被占用) = Σ 流出行.quantity     （已被约换中的订单承诺给对方）
pendingIn (待入库)      = Σ 流入行.quantity     （正在路上的补充）
available (可用)        = quantity − reserved   （实际还能动用的数量）
openOrders               = 涉及该卡的约换中订单行数
```

- 库存快调（列表页 +/-）下限为 `reserved`：数量不能减到低于已被订单占用的部分；
  录入页编辑同样校验 `quantity < reserved` 时报错。
- 涉及流出行的建单校验也在服务端重复该公式：`quantity − reserved(新) < 本次流出量`
  则拒绝。
- 订单页只拉取 `status = '约换中'` 的活跃订单（`listActiveOrders`）参与计算，
  避免历史订单拖累性能。

### 3.2 总资产与完备度（cardStatus.ts / cards.ts）

```
总资产 totalAsset = available + pendingIn
完备度判定：
  totalAsset >  target_quantity  → surplus（富余，蓝底徽标）
  totalAsset == target_quantity  → complete（已凑齐，绿底徽标）
  totalAsset <  target_quantity  → short（未齐，红底徽标）
```

- short 时徽标显示具体数字 `缺 N`（N = target − totalAsset）；
- surplus 时显示 `多 N`（N = totalAsset − target）；
- complete 且 `pendingIn > 0 或 reserved > 0`（即仍有交易在途、结果尚未落地）时，
  徽标显示 **`已凑齐*`**——星号是“账面已齐但存在未落地变动”的警示标记；
  完全落定（无任何在途行）则显示不带星号的 `已凑齐`。

### 3.3 标签斜杠层级与排序权重（tags.ts）

- 名称归一化 `normalizeTagName`：去首尾空白与多余 `#`，按 `/` 切分、逐段 trim、
  滤空后以单斜杠重组——因此 `出道专/小卡` 与 `出道专 / 小卡` 等价。
- 层级判定 `isTagUnder`：`a === parent || a.startsWith(parent + '/')`。
- 树形排序 `sortTagsForTree`：同路径逐段比较，**同一父节点下的兄弟按
  `sort_order` 升序，其次 created_at，再次名称（zh-CN, numeric）**；路径不同段
  则回退到名称字典序。层级关系完全由名称中的斜杠派生，不存储父子外键。
- `buildTagRank` 将该排序结果转成 `Map<tagId, 名次>`，列表页据此让卡片按
  主题分组权重排序（`compareCardsForList` 先比最小 tag 名次，再比名称、瑕疵/特典）。
- 手动上移/下移 `moveTag`：仅交换兄弟位次后，把 **sort_order 实际变化的兄弟**
  逐个 UPDATE（幂等且流量最小）。

### 3.4 订单状态机：约换中 → 已完成 / 已取消

```
            create_order                 complete_order               cancel_order
  [无] ────────────────▶ 约换中 ────────▶ 已完成 (completed_at=now)
                            │  │
                            │  └────────────▶ 已取消 (completed_at 保持 NULL)
                            └─（约换中状态可被管理员编辑 counterparty/note）
```

三个 RPC 都是**服务端原子操作**，前端不直接拼装库存变更：

- **create_order**：校验 lines 为非空数组；同一 card_id 不得重复出现；
  direction 必须为 流出/流入；quantity ≥ 1；对每张卡 `SELECT ... FOR UPDATE`
  行锁后重算约换中已占用（reserved），流出量超出 `quantity − reserved` 即抛
  `可用数量不足`。全部通过后插入订单与明细。
- **complete_order**：`FOR UPDATE` 锁单并确认状态仍为 约换中（防止并发双完成）；
  逐行落库存——流出减、流入加；任何行 card_id 已被删除（SET NULL）则整单拒绝；
  流出导致负库存也整单拒绝；成功后置 已完成 并写 completed_at。
- **cancel_order**：锁单确认 约换中 后仅改状态，不触碰库存（占用自动释放，
  因为 computeCardStocks 只统计约换中订单）。
- 订单行的 `card_name` 是下单时刻的快照，卡片后续改名不影响历史订单。

### 3.5 localStorage 订单草稿（useOrderDraft.ts）

- 存储键 `plave_order_draft`，内容为 `{ counterparty, note, outLines[], inLines[] }`。
- **写入**：表单任一变化且非保存中状态时自动保存；仅当存在实际内容
  （交易对象/备注非空或至少一行选了物品）才落盘，纯空表单主动删除缓存。
- **读取与失效校验**：挂载时若带预填（快速交易、取消并复制新建）则以传入数据
  为准并清除旧草稿；否则读取缓存，并逐行校验——卡片已被删除或流出物品
  可用数为 0 的行被剔除，同时生成形如
  `【流出】部分物品库存不足或已删除：…` 的警示文案展示在表单顶部。
  卡片列表尚未加载完（cards 为空）时跳过校验以免误删。
- `isDirty` 供离开确认使用；保存成功或取消后调用 `clearDraft` 清缓存。

### 3.6 访客口令与 x-client-info 请求头验证流程

口令存于 `site_settings.guest_passcode`（单行表），空字符串 = 关闭口令全公开。
匿名访客的每一条数据库请求都由服务端 RLS 谓词 `has_valid_guest_passcode()` 把关：

1. **请求头注入**（supabase.ts）：自定义 fetch 包装器读取
   `localStorage['asterum_guest_passcode']`，非空则把它以
   `pass:<口令>` 形式追加到 `x-client-info` 请求头
   （形如 `supabase-js pass:plave2026`）。
2. **服务端校验**：`has_valid_guest_passcode()` 从 `request.headers` 取出
   `x-client-info`，判断是否 `LIKE '%pass:<口令>%'`；口令为空时直接放行。
   该函数同时是 cards/tags/card_tags/orders/order_lines 五张表 anon SELECT
   策略的谓词——**没有正确口令的访客连一行都读不到**，与列级 GRANT 形成双重隔离。
3. **登录页验证**（guestAccess.ts + App.tsx）：访客输入口令后调用
   `verify_guest_passcode` RPC 明确比对（错误即提示），通过后 `storeGuestPasscode`
   写入 localStorage 并 `storeGuest` 写入 sessionStorage（键 `plave-guest`）。
4. **免密链接**：管理员弹窗可生成 `?code=<口令>` 的分享链接；访客打开时
   `consumeUrlPasscode` 提取参数并立即用 `history.replaceState` 从地址栏抹除
   （防截图泄露），校验通过则静默缓存口令进入访客态；口令已更换则提示链接过期。
   每次会话恢复（sessionStorage 中有访客标记）都会重新 RPC 复核缓存的口令，
   管理员改口令后旧访客会被顶回登录页。
5. **管理员侧**：`fetchCurrentGuestPasscode` 直读 site_settings（authenticated +
   owner 才有 SELECT 权限），`update_guest_passcode` RPC 内部再次显式校验
   `is_app_owner()`；更新后旧口令与旧链接即刻失效。

角色模型总览：`owner`（Supabase Auth 登录 + `is_app_owner()` 服务端复核，唯一可写）
/ `guest`（sessionStorage 标记 + 口令通过，只读列表视图）/ 未通过任一验证则停在
登录闸门 `RoleGate`。

---

## 四、本地开发与独立部署指引

### 4.1 本地运行

1. **依赖**：Node.js ≥ 18，包管理器 npm。

2. **环境变量**：项目根目录创建 `.env`（已列入 .gitignore，切勿提交）：

   ```bash
   VITE_SUPABASE_URL=https://<你的项目ID>.supabase.co
   VITE_SUPABASE_ANON_KEY=<项目的 anon/publishable 密钥>
   ```

   两者均可从 Supabase 控制台 → Project Settings → API 获取。anon key 是
   公开密钥（受 RLS 保护，可随前端分发），**不要**把 service_role key 放进
   任何 VITE_ 变量。

3. **启动**：

   ```bash
   npm install
   npm run dev        # 开发服务器
   npm run typecheck  # 类型检查（tsc --noEmit）
   npm run lint       # ESLint
   npm run build      # 产物输出到 dist/
   ```

### 4.2 用 full_schema.sql 搭建独立测试库

`supabase/full_schema.sql` 是**幂等的全量初始化脚本**，专为全新空白 Supabase
项目准备（所有建表带 `IF NOT EXISTS`，桶插入带 `ON CONFLICT DO NOTHING`）：

1. 在 Supabase 控制台新建一个空项目。
2. 打开 SQL Editor，将 `full_schema.sql` 全文粘贴运行一次。它会依次完成：
   建 7 张表与全部约束 → 业务 RPC 与权限函数 → `card_tags_max_three` 触发器
   → 开启 RLS → 建全部行级策略 → 列级 GRANT/REVOKE → 建 card-images 公共桶
   与存储策略，并写入默认访客口令 `plave2026`（建库后请尽快修改）。
3. **初始化管理员**（脚本不会自动做，需手动两步）：
   - Authentication → Users → Add user，用邮箱+密码创建账号；
   - SQL Editor 执行（把邮箱换成上一步的）：
     ```sql
     INSERT INTO public.app_owners (user_id)
     SELECT id FROM auth.users WHERE email = '你的管理员邮箱@example.com';
     ```
4. 建议同时在 Authentication → Sign In / Providers 中**关闭
   "Allow new users to sign up"**，杜绝陌生人自助注册。
5. 将本地 `.env` 指向新项目的 URL 与 anon key 即可联调。

### 4.3 部署到 Vercel

项目为纯静态 SPA（无服务端代码），部署步骤：

1. 将仓库推送到 GitHub（确认 `.env` 已被 .gitignore 排除）。
2. Vercel → Add New Project → 导入该仓库，框架预设选 **Vite**：
   - Build Command：`npm run build`
   - Output Directory：`dist`
3. 在 Vercel 的 **Environment Variables** 中配置生产环境的两个变量：
   `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`（值与 4.1 相同）。
4. 部署完成后，到 Supabase 控制台 → Authentication → URL Configuration，
   将 Site URL 更新为 Vercel 域名，使认证跳转与免密链接基于正确域名生成。
5. 仓库根目录的 `_redirects`（dist 内随构建复制）可配合托管商将所有路由
   回退到 `index.html`（SPA 单页回退）。

---

*文档基于 2026-11-20 的代码库与 supabase/full_schema.sql 编写；若后续新增迁移，
请以迁移文件与 full_schema.sql 的更新为准。*

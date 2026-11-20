---
name: Bug 反馈 / 部署报错
about: 报告功能异常，或个人部署过程中遇到的错误
title: ''
labels: ''
assignees: ''

---

### 1. 问题描述
请简要描述你遇到了什么问题（或哪一步操作报错了）：

### 2. 你的使用方式
- [ ] 个人独立部署（请勾选平台：Cloudflare Pages / Vercel / 本地运行）
- [ ] 访问公开 Demo 站

### 3. 自查清单（部署类问题必填）
- [ ] 已在 Supabase SQL Editor 完整运行 `supabase/full_schema.sql` 且显示 Success
- [ ] 已将自己创建的管理员邮箱写入 `public.app_owners` 表
- [ ] `VITE_SUPABASE_URL` 末尾没有多余的 `/rest/v1`，且 `VITE_SUPABASE_ANON_KEY` 复制的是 `eyJ` 开头的 legacy key

### 4. 报错截图或控制台信息
（如有红色报错提示，请直接把截图粘贴到这里，方便快速定位）

import { supabase } from '@/lib/supabase';

export type Role = 'owner' | 'guest';

const GUEST_STORAGE_KEY = 'plave-guest';

export function isGuestStored(): boolean {
  return window.sessionStorage.getItem(GUEST_STORAGE_KEY) === '1';
}

export function storeGuest(): void {
  window.sessionStorage.setItem(GUEST_STORAGE_KEY, '1');
}

export function clearGuest(): void {
  window.sessionStorage.removeItem(GUEST_STORAGE_KEY);
}

export async function hasOwnerSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

// 服务器端校验：当前登入的账号是否在管理员名单中。
export async function isOwnerAccount(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_app_owner');
  if (error) return false;
  return data === true;
}

export async function signInOwner(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error('邮箱或密码不正确，请重试。');
  }
  if (!(await isOwnerAccount())) {
    await supabase.auth.signOut();
    throw new Error('此账号没有管理员权限。');
  }
}

export async function signOutOwner(): Promise<void> {
  clearGuest();
  await supabase.auth.signOut();
}

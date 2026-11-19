import { supabase } from '@/lib/supabase';

const GUEST_PASSCODE_KEY = 'asterum_guest_passcode';

/**
 * 读取本地缓存的访客口令
 */
export function getStoredGuestPasscode(): string {
  try {
    return localStorage.getItem(GUEST_PASSCODE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * 保存访客口令到本地缓存
 */
export function storeGuestPasscode(code: string): void {
  try {
    localStorage.setItem(GUEST_PASSCODE_KEY, code.trim());
  } catch {
    // 忽略无痕模式下的存储限制
  }
}

/**
 * 清除本地缓存的访客口令
 */
export function clearGuestPasscode(): void {
  try {
    localStorage.removeItem(GUEST_PASSCODE_KEY);
  } catch {
    // 忽略存储异常
  }
}

/**
 * 从当前浏览器地址栏提取 ?code=xxx 参数，并立即从地址栏抹除该参数（防截图泄露）
 */
export function consumeUrlPasscode(): string | null {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code !== null) {
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.toString());
      return code.trim();
    }
  } catch {
    // 忽略 URL 解析异常
  }
  return null;
}

/**
 * 调用后端 RPC 验证访客口令是否正确（若管理员未开启口令，后端会直接返回 true）
 */
export async function verifyGuestPasscode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_guest_passcode', {
    input_code: code.trim(),
  });
  if (error) {
    throw new Error(error.message || '口令验证失败');
  }
  return Boolean(data);
}

/**
 * 管理员专用：读取当前生效的访客口令
 */
export async function fetchCurrentGuestPasscode(): Promise<string> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('guest_passcode')
    .eq('id', 1)
    .single();
  if (error) {
    throw new Error(error.message || '读取访客口令失败');
  }
  return data?.guest_passcode ?? '';
}

/**
 * 管理员专用：更新或清空访客口令（传入空字符串视为关闭口令限制）
 */
export async function updateGuestPasscode(newCode: string): Promise<void> {
  const { error } = await supabase.rpc('update_guest_passcode', {
    new_code: newCode.trim(),
  });
  if (error) {
    throw new Error(error.message || '更新访客口令失败');
  }
}

/**
 * 生成带有免密暗号的访客专属分享链接
 */
export function buildGuestShareLink(passcode: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  if (passcode.trim()) {
    url.searchParams.set('code', passcode.trim());
  }
  return url.toString();
}

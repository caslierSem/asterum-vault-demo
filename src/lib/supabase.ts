import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GUEST_PASSCODE_KEY = 'asterum_guest_passcode';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init = {}) => {
      const headers = new Headers(
        input instanceof Request ? input.headers : undefined,
      );
      if (init.headers) {
        new Headers(init.headers).forEach((value, key) => {
          headers.set(key, value);
        });
      }

      try {
        const passcode = localStorage.getItem(GUEST_PASSCODE_KEY);
        if (passcode) {
          const existingInfo = headers.get('x-client-info') ?? 'supabase-js';
          headers.set('x-client-info', `${existingInfo} pass:${passcode}`);
        }
      } catch {
        // 忽略本地存储读取异常
      }

      return fetch(input, { ...init, headers });
    },
  },
});

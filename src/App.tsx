import { useEffect, useState } from 'react';
import { KeyRound, LayoutGrid, LogOut, PlusCircle, ReceiptText, Tags, ArrowUp, type LucideIcon } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import ErrorBoundary from '@/components/ErrorBoundary';
import CardForm from '@/components/CardForm';
import CardList from '@/components/CardList';
import EntryModeSelector from '@/components/EntryModeSelector';
import GuestPasscodeModal from '@/components/GuestPasscodeModal';
import OrdersPage from '@/components/OrdersPage';
import ScreenshotImport from '@/components/ScreenshotImport';
import RoleGate from '@/components/RoleGate';
import TagManager from '@/components/TagManager';
import type { CardPrefill } from '@/lib/cardFields';
import {
  clearGuestPasscode,
  consumeUrlPasscode,
  getStoredGuestPasscode,
  storeGuestPasscode,
  verifyGuestPasscode,
} from '@/lib/guestAccess';
import type { OrderDraftRequest } from '@/lib/orders';
import { clearGuest, isGuestStored, isOwnerAccount, signOutOwner, storeGuest, type Role } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type View = 'entry-select' | 'entry' | 'import' | 'list' | 'tags' | 'orders';

const ENTRY_VIEWS: View[] = ['entry-select', 'entry', 'import'];

const NAV_ITEMS: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'entry', label: '录入', icon: PlusCircle },
  { view: 'list', label: '列表', icon: LayoutGrid },
  { view: 'tags', label: '主题', icon: Tags },
  { view: 'orders', label: '订单', icon: ReceiptText },
];

function App() {
  const [view, setView] = useState<View>('list');
  const [orderRequest, setOrderRequest] = useState<OrderDraftRequest | null>(null);
  const [entryPrefill, setEntryPrefill] = useState<CardPrefill | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    let active = true;

    // 校验并初始化访客访问权限（优先检查 URL 专属链接 ?code=，其次复核本地缓存口令）
    const resolveGuestAccess = async () => {
      const urlCode = consumeUrlPasscode();
      if (urlCode !== null) {
        try {
          const valid = await verifyGuestPasscode(urlCode);
          if (!active) return;
          if (valid) {
            storeGuestPasscode(urlCode);
            storeGuest();
            setRole('guest');
          } else {
            clearGuestPasscode();
            clearGuest();
            setGateError('该专属分享链接已过期或无效，请输入最新访客口令。');
            setRole(null);
          }
        } catch {
          if (!active) return;
          setRole(null);
        }
        setRoleReady(true);
        return;
      }

      if (isGuestStored()) {
        try {
          const valid = await verifyGuestPasscode(getStoredGuestPasscode());
          if (!active) return;
          if (valid) {
            setRole('guest');
          } else {
            clearGuestPasscode();
            clearGuest();
            setGateError('访客口令已更新，请重新输入新口令。');
            setRole(null);
          }
        } catch {
          if (!active) return;
          setRole(null);
        }
        setRoleReady(true);
        return;
      }

      setRole(null);
      setRoleReady(true);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        void isOwnerAccount().then((owner) => {
          if (!active) return;
          if (owner) {
            setRole('owner');
            setRoleReady(true);
          } else {
            void signOutOwner();
            void resolveGuestAccess();
          }
        });
        return;
      }
      void resolveGuestAccess();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        void (async () => {
          const owner = await isOwnerAccount();
          if (!active) return;
          if (owner) {
            clearGuest();
            setGateError(null);
            setRole('owner');
          }
          setRoleReady(true);
        })();
      }
    });

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const navigate = (target: View) => {
    setOrderRequest(null);
    setEntryPrefill(null);
    setView(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startOrder = (request: OrderDraftRequest) => {
    setOrderRequest(request);
    setView('orders');
  };

  const duplicateCard = (prefill: CardPrefill) => {
    setOrderRequest(null);
    setEntryPrefill(prefill);
    setView('entry');
  };

  const selectRole = (next: Role) => {
    if (next === 'guest') {
      storeGuest();
    } else {
      clearGuest();
    }
    setGateError(null);
    setRole(next);
  };

  const logout = () => {
    clearGuestPasscode();
    clearGuest();
    void signOutOwner().finally(() => {
      window.location.reload();
    });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const visibleNavItems =
    role === 'guest' ? NAV_ITEMS.filter(({ view: target }) => target === 'list') : NAV_ITEMS;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 relative">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:gap-4 sm:px-6 sm:py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo />
            <span className="hidden sm:block whitespace-nowrap text-base font-semibold tracking-tight truncate max-w-[120px] sm:max-w-none">Asterum Vault</span>
          </div>

          <div className="flex items-center gap-2">
            <nav className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {visibleNavItems.map(({ view: target, label, icon: Icon }) => {
                const isEntry = target === 'entry';
                const active = isEntry ? ENTRY_VIEWS.includes(view) : view === target;
                return (
                  <button
                    key={target}
                    onClick={() => navigate(isEntry ? 'entry-select' : target)}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition md:px-3 ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className={active ? undefined : 'hidden md:inline'}>{label}</span>
                  </button>
                );
              })}
            </nav>

            {role === 'owner' && (
              <button
                onClick={() => setShowPasscodeModal(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-50"
                title="管理访客口令与分享链接"
              >
                <KeyRound className="h-4 w-4" />
                <span className="hidden sm:inline">口令</span>
              </button>
            )}

            {role !== null && (
              <button
                onClick={logout}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">登出</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {role !== null && (
        <main className="px-4 pt-20 pb-8 sm:px-6 sm:pb-10">
          <ErrorBoundary>
            {view === 'entry-select' && (
              <EntryModeSelector
                onSelectSingle={() => navigate('entry')}
                onSelectCollage={() => navigate('import')}
              />
            )}
            {view === 'entry' && (
              <CardForm prefill={entryPrefill} onSwitchMode={() => navigate('entry-select')} />
            )}
            {view === 'import' && <ScreenshotImport onSwitchMode={() => navigate('entry-select')} />}
            {view === 'list' && (
              <CardList onStartOrder={startOrder} onDuplicate={duplicateCard} readOnly={role === 'guest'} />
            )}
            {view === 'tags' && <TagManager />}
            {view === 'orders' && <OrdersPage initialRequest={orderRequest} />}
          </ErrorBoundary>
        </main>
      )}


      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800/50 backdrop-blur-md text-white shadow-sm transition-all hover:bg-slate-800/80 active:scale-95"
          aria-label="回到顶部"
        >
          <ArrowUp className="h-6 w-6" />
        </button>
      )}

      {roleReady && role === null && <RoleGate onSelect={selectRole} initialError={gateError} />}
      {showPasscodeModal && <GuestPasscodeModal onClose={() => setShowPasscodeModal(false)} />}
    </div>
  );
}

export default App;

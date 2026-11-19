import { useState, useMemo, useRef, useEffect } from 'react';
import { AlertCircle, Check, Loader2, Search, X } from 'lucide-react';
import { type Card, type Tag, getCardImageUrl, getDisplayName, updateCard, setCardTags } from '@/lib/cards';
import { searchShellClass, searchInputClass, primaryButtonClass, secondaryButtonClass, dropdownMenuClass } from '@/lib/formStyles';
import { matchesSearchQuery } from '@/lib/cardFilters';
import BatchEditFormStep, { type BatchEditFormState } from '@/components/BatchEditFormStep';

interface BatchEditWizardProps {
  cards: Card[];
  tags: Tag[];
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'select' | 'edit' | 'confirm' | 'result';

const INITIAL_FORM_STATE: BatchEditFormState = {
  updatePrice: false,
  price: '',
  updateTarget: false,
  targetQuantity: '',
  updateSpecial: false,
  specialValue: true,
  updateDefective: false,
  defectiveValue: true,
  updateTags: false,
  newTagIds: [],
};

export default function BatchEditWizard({ cards, tags, onClose, onSuccess }: BatchEditWizardProps) {
  const [step, setStep] = useState<Step>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<BatchEditFormState>(INITIAL_FORM_STATE);
  const [saving, setSaving] = useState(false);
  const [failedItems, setFailedItems] = useState<{ name: string; reason: string }[]>([]);

  const patchForm = (patch: Partial<BatchEditFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return cards.filter((card) =>
      matchesSearchQuery(
        getDisplayName(card),
        card.tags.map((tag) => tag.name),
        searchQuery,
      ),
    );
  }, [cards, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const removeSelected = (id: string) => setSelectedIds((prev) => prev.filter((x) => x !== id));

  const selectedCards = useMemo(
    () => selectedIds.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c),
    [selectedIds, cards],
  );

  const selectedTagNames = useMemo(
    () => form.newTagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean).join(', '),
    [form.newTagIds, tags],
  );

  const handleSave = async () => {
    setSaving(true);
    const changes: Partial<Pick<Card, 'price' | 'target_quantity' | 'is_special' | 'is_defective'>> = {};
    if (form.updatePrice) changes.price = Number(form.price) || 0;
    if (form.updateTarget) changes.target_quantity = Number(form.targetQuantity) || 0;
    if (form.updateSpecial) changes.is_special = form.specialValue;
    if (form.updateDefective) changes.is_defective = form.defectiveValue;

    const failed: { name: string; reason: string }[] = [];

    const promises = selectedIds.map(async (id) => {
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      try {
        if (Object.keys(changes).length > 0) await updateCard(id, changes);
        if (form.updateTags) await setCardTags(id, form.newTagIds);
      } catch (err) {
        failed.push({
          name: getDisplayName(card),
          reason: err instanceof Error ? err.message : '网络或权限异常',
        });
      }
    });

    await Promise.allSettled(promises);
    setSaving(false);

    if (failed.length > 0) {
      setFailedItems(failed);
      setStep('result');
      const failedNames = failed.map((f) => f.name);
      setSelectedIds(
        selectedIds.filter((id) => {
          const c = cards.find((x) => x.id === id);
          return c && failedNames.includes(getDisplayName(c));
        }),
      );
    } else {
      onSuccess();
      onClose();
    }
  };

  const hasAnyUpdate =
    form.updatePrice || form.updateTarget || form.updateSpecial || form.updateDefective || form.updateTags;
  return (
    <div className="flex h-[calc(100vh-8rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-[85vh]">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {step === 'select' && '批量管理：选择物品'}
          {step === 'edit' && '批量管理：设置属性'}
          {step === 'confirm' && '预览确认'}
          {step === 'result' && '部分失败'}
        </h2>
        <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col min-h-0">
        {step === 'select' && (
          <div className="flex flex-col h-full">
            <div className="relative mb-6 z-20" ref={searchWrapperRef}>
              <div className={`${searchShellClass} flex h-[2.75rem] items-center px-3`}>
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  type="text"
                  placeholder="输入物品名或 #主题 搜索并添加..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  className={`${searchInputClass} ml-2`}
                />
              </div>
              {showResults && searchQuery.trim() !== '' && (
                <ul className={`${dropdownMenuClass} max-h-[300px]`}>
                  {filteredCards.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-slate-500 text-center">未找到相关物品</li>
                  ) : (
                    filteredCards.map((card) => {
                      const isSelected = selectedIds.includes(card.id);
                      return (
                        <li key={card.id}>
                          <button
                            onMouseDown={(e) => { e.preventDefault(); toggleSelect(card.id); }}
                            className="flex w-full items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors text-left"
                          >
                            <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-100 border border-slate-200">
                              {card.image_path && <img src={getCardImageUrl(card.image_path)} className="h-full w-full object-cover" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800">{getDisplayName(card)}</p>
                              <p className="truncate text-[11px] text-emerald-600">
                                {card.tags.length > 0 ? card.tags.map((t) => `#${t.name}`).join(' ') : '无主题'}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="shrink-0 text-teal-600">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>

            <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-teal-100 bg-teal-50/30 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-teal-800">
                <Check className="h-4 w-4" /> 已选中 ({selectedCards.length})
              </h3>
              {selectedCards.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                  请在上方搜索并选择物品
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {selectedCards.map((card) => (
                      <div key={card.id} className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                        {card.image_path ? (
                          <img src={getCardImageUrl(card.image_path)} className="h-full w-full object-cover object-top" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-400">无图</div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-4">
                          <p className="truncate text-[10px] font-medium leading-tight text-white">{getDisplayName(card)}</p>
                          <p className="truncate text-[9px] leading-tight text-emerald-300 mt-0.5">
                            {card.tags.length > 0 ? card.tags.map((t) => `#${t.name}`).join(' ') : '无主题'}
                          </p>
                        </div>
                        <button
                          onClick={() => removeSelected(card.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-rose-500 backdrop-blur-sm opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'edit' && (
          <BatchEditFormStep
            selectedCount={selectedIds.length}
            allTags={tags}
            form={form}
            onChange={patchForm}
          />
        )}

        {step === 'confirm' && (
          <div className="space-y-5 max-w-lg mx-auto w-full">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold mb-3 text-amber-800">
                <AlertCircle className="h-5 w-5" /> 请确认批量修改内容
              </h3>
              <p className="text-sm mb-4">
                即将覆盖选中的 <strong className="text-lg text-amber-700">{selectedIds.length}</strong> 件物品：
              </p>
              <ul className="space-y-2 text-sm bg-white/60 rounded-lg p-3 border border-amber-100">
                {form.updatePrice && <li className="flex justify-between border-b border-amber-100/50 pb-1"><span>修改价格：</span> <span className="font-semibold">¥ {form.price || 0}</span></li>}
                {form.updateTarget && <li className="flex justify-between border-b border-amber-100/50 pb-1"><span>修改目标数量：</span> <span className="font-semibold">{form.targetQuantity || 0}</span></li>}
                {form.updateSpecial && <li className="flex justify-between border-b border-amber-100/50 pb-1"><span>特典状态：</span> <span className="font-semibold">{form.specialValue ? '设为特典' : '取消特典'}</span></li>}
                {form.updateDefective && <li className="flex justify-between border-b border-amber-100/50 pb-1"><span>瑕疵状态：</span> <span className="font-semibold">{form.defectiveValue ? '设为瑕疵' : '取消瑕疵'}</span></li>}
                {form.updateTags && <li className="flex flex-col gap-1"><span>覆盖主题为：</span> <span className="font-semibold text-emerald-700">{selectedTagNames || '空'}</span></li>}
              </ul>
              <p className="mt-4 text-xs font-medium text-amber-700/80">此操作将直接生效且不可撤销，请再次确认。</p>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="space-y-5 max-w-lg mx-auto w-full">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
              <h3 className="flex items-center gap-2 font-semibold mb-2">
                <AlertCircle className="h-5 w-5" /> 部分修改失败
              </h3>
              <p className="text-sm">成功修改其他物品，但有 {failedItems.length} 件失败了：</p>
              <ul className="mt-3 max-h-60 overflow-y-auto list-disc pl-5 text-sm space-y-1">
                {failedItems.map((f, i) => (
                  <li key={i}><strong>{f.name}</strong>：{f.reason}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs font-medium">已为您自动保留了这些失败物品的选中状态，你可以返回重试。</p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-5 py-4 flex justify-between items-center">
        <div className="text-sm font-medium text-slate-600">
          {step === 'select' && `已选 ${selectedIds.length} 件`}
        </div>
        <div className="flex gap-3">
          {step === 'select' && (
            <>
              <button onClick={onClose} className={secondaryButtonClass}>取消</button>
              <button disabled={selectedIds.length === 0} onClick={() => setStep('edit')} className={primaryButtonClass}>下一步</button>
            </>
          )}
          {step === 'edit' && (
            <>
              <button onClick={() => setStep('select')} className={secondaryButtonClass}>上一步</button>
              <button disabled={!hasAnyUpdate} onClick={() => setStep('confirm')} className={primaryButtonClass}>预览修改</button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button disabled={saving} onClick={() => setStep('edit')} className={secondaryButtonClass}>返回修改</button>
              <button disabled={saving} onClick={handleSave} className={primaryButtonClass}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? '正在处理…' : '确认覆盖'}
              </button>
            </>
          )}
          {step === 'result' && (
            <button onClick={() => setStep('edit')} className={primaryButtonClass}>去重试</button>
          )}
        </div>
      </div>
    </div>
  );
}

import {
  ALL_ATTRIBUTE_KEYS,
  ALL_COLLECTION_KEYS,
  type AttributeKey,
  type CardFilters,
  type CollectionKey,
} from '@/lib/cardFilters';
import type { ReactNode } from 'react';

const COLLECTION_LABELS: Record<CollectionKey, string> = {
  missing: '未齐',
  complete: '已齐',
  surplus: '复数',
};

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  special: '特典',
  defective: '瑕疵',
  normal: '普通',
};

interface CardFilterBarProps {
  filters: CardFilters;
  onToggleCollection: (key: CollectionKey) => void;
  onToggleAttribute: (key: AttributeKey) => void;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-xl border px-3 py-1.5 text-sm font-medium backdrop-blur-md transition-all active:scale-[0.97] sm:flex-none ${
        active
          ? 'border-teal-600/30 bg-teal-600/10 text-teal-800 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_8px_rgba(13,148,136,0.15)]'
          : 'border-slate-200/80 bg-slate-50 text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export default function CardFilterBar({ filters, onToggleCollection, onToggleAttribute }: CardFilterBarProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
      <FilterGroup label="收集状态">
        {ALL_COLLECTION_KEYS.map((key) => (
          <FilterChip
            key={key}
            active={filters.collections.has(key)}
            onClick={() => onToggleCollection(key)}
          >
            {COLLECTION_LABELS[key]}
          </FilterChip>
        ))}
      </FilterGroup>
      <FilterGroup label="物品属性">
        {ALL_ATTRIBUTE_KEYS.map((key) => (
          <FilterChip
            key={key}
            active={filters.attributes.has(key)}
            onClick={() => onToggleAttribute(key)}
          >
            {ATTRIBUTE_LABELS[key]}
          </FilterChip>
        ))}
      </FilterGroup>
    </div>
  );
}
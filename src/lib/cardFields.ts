import { stripCardLabelPrefixes, type Card, type CardFields } from '@/lib/cards';

export interface CardFieldValues {
  name: string;
  quantity: string;
  target_quantity: string;
  location: string;
  price: string;
  is_defective: boolean;
  is_special: boolean;
  notes: string;
}

export const DEFAULT_FIELD_VALUES: CardFieldValues = {
  name: '',
  quantity: '1',
  target_quantity: '1',
  location: '',
  price: '0',
  is_defective: false,
  is_special: false,
  notes: '',
};

export function fieldValuesFromCard(card: Card): CardFieldValues {
  return {
    name: stripCardLabelPrefixes(card.name),
    quantity: String(card.quantity),
    target_quantity: String(card.target_quantity),
    location: card.location,
    price: String(card.price),
    is_defective: card.is_defective,
    is_special: card.is_special,
    notes: card.notes,
  };
}

export interface CardPrefill {
  values: CardFieldValues;
  tagIds: string[];
  imageUrl: string | null;
}

export type ParsedFields = { ok: true; fields: CardFields } | { ok: false; error: string };

export function parseFieldValues(values: CardFieldValues): ParsedFields {
  const name = values.name.trim();
  if (!name) return { ok: false, error: '请填写物品名称' };

  const quantity = Number(values.quantity);
  if (values.quantity.trim() === '' || !Number.isInteger(quantity) || quantity < 0) {
    return { ok: false, error: '数量需要是 0 或以上的整数' };
  }

  const targetQuantity = Number(values.target_quantity);
  if (
    values.target_quantity.trim() === '' ||
    !Number.isInteger(targetQuantity) ||
    targetQuantity < 0
  ) {
    return { ok: false, error: '目标数量需要是 0 或以上的整数' };
  }

  const price = Number(values.price);
  if (values.price.trim() === '' || !Number.isFinite(price) || price < 0) {
    return { ok: false, error: '价格需要是 0 或以上的数字' };
  }

  return {
    ok: true,
    fields: {
      name,
      quantity,
      target_quantity: targetQuantity,
      location: values.location.trim(),
      price,
      is_defective: values.is_defective,
      is_special: values.is_special,
      notes: values.notes.trim(),
    },
  };
}

const RAISED_EXCEPTION_CODE = 'P0001';

interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Turns a database error into something safe to show in the interface.
 * Messages the app itself raises (business rules) are passed through;
 * anything else is replaced by a generic notice and logged for the developer.
 */
export function toUserError(error: DbErrorLike, fallback = '操作失败，请稍后重试。'): Error {
  console.error('[db]', error);
  if (error.code === RAISED_EXCEPTION_CODE && error.message) {
    return new Error(error.message);
  }
  return new Error(fallback);
}

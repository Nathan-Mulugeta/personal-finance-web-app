import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box } from '@mui/material';
import { updateTransaction } from '../../store/slices/transactionsSlice';
import { flattenCategoryTree } from '../../utils/categoryHierarchy';
import { splitMoney } from '../../utils/currencyConversion';
import CategoryAutocomplete from './CategoryAutocomplete';
import { editableTextSx } from './inlineEditStyles';

/**
 * Tracks which single field, on which transaction, is currently being edited
 * in place across a list. `start(field, txn)` returns a click handler (it stops
 * row propagation so the field-tap doesn't also open the full editor).
 */
export function useInlineEdit() {
  const [editing, setEditing] = useState(null); // { id, field }
  const start = useCallback(
    (field, transaction) => (event) => {
      event.stopPropagation();
      setEditing({ id: transaction.transaction_id, field });
    },
    []
  );
  const stop = useCallback(() => setEditing(null), []);
  const isEditing = useCallback(
    (field, transaction) =>
      editing?.id === transaction.transaction_id && editing.field === field,
    [editing]
  );
  return { start, stop, isEditing };
}

// Swallow the click that follows an outside press, so dismissing an editor
// never also activates whatever was underneath (a row, the budget cue, a
// link…). One-shot and self-removing; the timeout drops it if no click follows
// (e.g. the press was the start of a scroll).
function swallowNextClick() {
  const swallow = (event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  document.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(
    () => document.removeEventListener('click', swallow, { capture: true }),
    500
  );
}

/**
 * While mounted, a press anywhere outside `containerRef` (and outside the
 * category dropdown, which is portalled to body) dismisses the editor via
 * `onDismiss` AND swallows that press's click. Capture-phase on document, so it
 * runs before any app handler can react.
 */
function useDismissOutside(containerRef, onDismiss) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const onPointerDown = (event) => {
      const root = containerRef.current;
      if (!root || root.contains(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('.MuiAutocomplete-popper')
      ) {
        return; // picking an option is part of the editor
      }
      swallowNextClick();
      dismissRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [containerRef]);
}

/**
 * The exact text span, made editable in place. It's a contentEditable — not a
 * form input — so it keeps the surrounding font size (dodging the touch 16px
 * rule and iOS auto-zoom) and stays inline, so neighbouring text (currency,
 * account prefix) doesn't move. Focuses with the caret at the end. Pressing
 * outside commits and swallows that press.
 *
 * `onCommit`/`onCancel` may fire more than once (Enter → trailing blur, outside
 * press → trailing blur); the parent's save/resolve guard makes them one-shot.
 */
function InlineTextEdit({ initialText, numeric, placeholder, textSx, onCommit, onCancel }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = initialText;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // caret at the end
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => onCommit(ref.current ? ref.current.textContent : '');

  useDismissOutside(ref, commit);

  return (
    <Box
      component="span"
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      inputMode={numeric ? 'decimal' : 'text'}
      data-placeholder={placeholder || ''}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
      sx={[
        {
          outline: 'none',
          whiteSpace: 'pre',
          display: 'inline-block',
          lineHeight: 'inherit',
          minWidth: '0.5ch',
          '&:empty::before': {
            content: 'attr(data-placeholder)',
            opacity: 0.6,
          },
        },
        textSx,
        editableTextSx,
        { cursor: 'text' },
      ]}
    />
  );
}

/**
 * The category editor: a bare autocomplete in the row. Saves on pick; pressing
 * outside (or Escape) cancels and swallows that press.
 */
function InlineCategoryEdit({ transaction, categoryOptions, onPick, onCancel, textSx }) {
  const wrapRef = useRef(null);
  useDismissOutside(wrapRef, onCancel);
  return (
    // Stop the (portalled) option click from bubbling up the React tree to the
    // row's own onClick, which would otherwise open the full edit modal.
    <Box
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
      sx={{ width: '100%' }}
    >
      <CategoryAutocomplete
        categories={categoryOptions}
        leafOnly
        value={transaction.category_id}
        onChange={onPick}
        onClose={onCancel}
        autoFocus
        openOnFocus
        selectOnFocus
        inline
        textSx={textSx}
        sx={{ width: '100%', minWidth: 120 }}
        slotProps={{
          popper: { sx: { zIndex: (theme) => theme.zIndex.modal + 3 } },
        }}
      />
    </Box>
  );
}

/**
 * Renders the in-place editor for one transaction field. Amount and description
 * become editable text (currency / account prefix stay put next to them);
 * category is a bare autocomplete that saves on pick. Saves fire-and-forget —
 * the notifications middleware toasts success or the failure reason, and a
 * rejected update leaves the stored value so the row reverts on its own.
 *
 * @param {Object} transaction
 * @param {'category'|'amount'|'description'} field
 * @param {Function} onDone - called when editing ends (saved or cancelled)
 * @param {Object} [textSx] - font styling of the text being replaced, for a seamless match
 * @param {React.ReactNode} [prefix] - static text kept before a description (e.g. "Cash · ")
 */
export function InlineFieldInput({ transaction, field, onDone, textSx, prefix }) {
  const dispatch = useDispatch();
  const { categories } = useSelector((state) => state.categories);
  // One-shot guard: commit/cancel can each fire more than once (trailing blur,
  // autocomplete change + close) — only the first resolution counts.
  const resolvedRef = useRef(false);

  const categoryOptions = useMemo(() => {
    const type = transaction.type;
    return flattenCategoryTree(
      categories.filter(
        (cat) => cat.status === 'Active' && (type ? cat.type === type : true)
      )
    );
  }, [categories, transaction.type]);

  const resolve = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onDone();
  }, [onDone]);

  const save = useCallback(
    (updates) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      // Fire-and-forget so the editor closes immediately (no race when the user
      // jumps straight to another field); the middleware toasts the outcome.
      dispatch(
        updateTransaction({
          transactionId: transaction.transaction_id,
          updates,
        })
      );
      onDone();
    },
    [dispatch, transaction.transaction_id, onDone]
  );

  if (field === 'category') {
    return (
      <InlineCategoryEdit
        transaction={transaction}
        categoryOptions={categoryOptions}
        textSx={textSx}
        onCancel={resolve}
        onPick={(categoryId) => {
          // A pick saves; clearing keeps the field open to search again
          if (categoryId && categoryId !== transaction.category_id) {
            save({ categoryId });
          }
        }}
      />
    );
  }

  if (field === 'amount') {
    const current = Math.abs(parseFloat(transaction.amount || 0));
    const { prefix: curPrefix, number, suffix: curSuffix } = splitMoney(
      current,
      transaction.currency
    );
    return (
      <Box
        component="span"
        onClick={(e) => e.stopPropagation()}
        sx={[{ whiteSpace: 'nowrap' }, textSx]}
      >
        {curPrefix}
        <InlineTextEdit
          initialText={number}
          numeric
          textSx={textSx}
          onCommit={(text) => {
            const num = parseFloat(String(text).replace(/,/g, ''));
            if (!Number.isNaN(num) && num > 0 && num !== current) {
              save({ amount: num });
            } else {
              resolve();
            }
          }}
          onCancel={resolve}
        />
        {curSuffix}
      </Box>
    );
  }

  // description
  return (
    <Box
      component="span"
      onClick={(e) => e.stopPropagation()}
      sx={[
        { whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%' },
        textSx,
      ]}
    >
      {prefix}
      <InlineTextEdit
        initialText={transaction.description || ''}
        placeholder="Add note"
        textSx={textSx}
        onCommit={(text) => {
          const next = String(text).trim();
          if (next !== (transaction.description || '')) {
            save({ description: next });
          } else {
            resolve();
          }
        }}
        onCancel={resolve}
      />
    </Box>
  );
}

export default InlineFieldInput;

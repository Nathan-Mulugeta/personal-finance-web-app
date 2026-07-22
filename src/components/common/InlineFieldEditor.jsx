import {
  useCallback,
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

// When any inline editor last closed. Shared across every hook instance (rows
// hold their own state) so the click that dismissed an editor can be swallowed
// by whichever row it lands on, instead of opening that row's full editor.
let lastInlineCloseAt = 0;

/**
 * Tracks which single field, on which transaction, is currently being edited
 * in place across a list. `start(field, txn)` returns a click handler (it stops
 * row propagation so the field-tap doesn't also open the full editor).
 * `justClosed()` is true briefly after closing, to swallow the dismissing click.
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
  const stop = useCallback(() => {
    lastInlineCloseAt = Date.now();
    setEditing(null);
  }, []);
  const isEditing = useCallback(
    (field, transaction) =>
      editing?.id === transaction.transaction_id && editing.field === field,
    [editing]
  );
  const justClosed = useCallback(() => Date.now() - lastInlineCloseAt < 350, []);
  return { editing, start, stop, isEditing, justClosed };
}

/**
 * The exact text span, made editable in place. It's a contentEditable — not a
 * form input — so it keeps the surrounding font size (dodging the touch 16px
 * rule and iOS auto-zoom) and stays inline, so neighbouring text (currency,
 * account prefix) doesn't move. Focuses with the caret at the end.
 */
function InlineTextEdit({ initialText, numeric, placeholder, textSx, onCommit, onCancel }) {
  const ref = useRef(null);
  const doneRef = useRef(false);

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

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(ref.current ? ref.current.textContent : '');
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

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
          cancel();
        }
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
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

  const handleCategory = (categoryId) => {
    // A pick saves; clearing keeps the field open to search again
    if (categoryId && categoryId !== transaction.category_id) {
      save({ categoryId });
    }
  };

  if (field === 'category') {
    return (
      // Stop the (portalled) option click from bubbling up to the row's own
      // onClick, which would otherwise open the full edit modal.
      <Box
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        sx={{ width: '100%' }}
      >
        <CategoryAutocomplete
          categories={categoryOptions}
          leafOnly
          value={transaction.category_id}
          onChange={handleCategory}
          onClose={resolve}
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

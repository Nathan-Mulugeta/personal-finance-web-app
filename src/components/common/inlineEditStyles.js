// Shared affordances for the tap/click-to-edit fields. Applied directly to the
// field element — spread as one entry of an `sx` array.

// The single source of the dotted "editable" underline: faint at rest (the only
// cue on touch), firmer — darker and thicker — on hover. Every editable
// affordance below composes these two fragments.
const underlineSx = (theme) => ({
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: theme.palette.divider,
  textDecorationThickness: '1px',
  textUnderlineOffset: '2px',
});
const underlineHoverSx = (theme) => ({
  textDecorationColor: theme.palette.text.primary,
  textDecorationThickness: '2px',
});

// An inline-editable field. A little horizontal padding (offset by a matching
// negative margin so layout doesn't shift) grows the click target beyond the
// raw glyphs, while the rest of the row/cell stays free to open the full
// editor. No vertical padding — it would add height to the contentEditable
// editor and grow the row on entering edit mode.
export const editableTextSx = (theme) => ({
  cursor: 'pointer',
  borderRadius: 1,
  px: 0.5,
  mx: -0.5,
  ...underlineSx(theme),
  '@media (hover: hover)': {
    '&:hover': underlineHoverSx(theme),
  },
});

// Just the underline (no padding/cursor), for a display value whose click
// target is a surrounding control — e.g. "Set budget" beside its edit button.
export const editableUnderlineSx = (theme) => ({
  ...underlineSx(theme),
  '@media (hover: hover)': {
    '&:hover': underlineHoverSx(theme),
  },
});

// For a wrapping clickable box (e.g. the budget cell that holds the amount plus
// its edit button): the primary amount (a body2) carries the underline, and
// hovering anywhere in the box firms it up — without underlining the icon or
// any secondary caption.
export const editableAmountBoxSx = (theme) => ({
  cursor: 'pointer',
  '& .MuiTypography-body2': underlineSx(theme),
  '@media (hover: hover)': {
    '&:hover .MuiTypography-body2': underlineHoverSx(theme),
  },
});

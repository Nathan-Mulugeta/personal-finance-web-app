// Shared affordance for the tap/click-to-edit transaction fields (category,
// amount, note). Applied directly to the field element — spread as one entry of
// an `sx` array.

// The editable field itself. A faint dotted underline reads as "editable" (the
// only cue on touch); on hover the underline firms up — darker and thicker —
// which is the desktop affordance, no background wash. A little symmetric
// padding (offset by a matching negative margin so layout doesn't shift) grows
// the click target a touch beyond the raw glyphs, while the rest of the
// row/cell stays free to open the full editor.
export const editableTextSx = (theme) => ({
  cursor: 'pointer',
  borderRadius: 1,
  px: 0.5,
  mx: -0.5,
  py: 0.25,
  my: -0.25,
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: theme.palette.divider,
  textDecorationThickness: '1px',
  textUnderlineOffset: '2px',
  '@media (hover: hover)': {
    '&:hover': {
      textDecorationColor: theme.palette.text.primary,
      textDecorationThickness: '2px',
    },
  },
});

// Just the dotted "editable" underline (no padding/cursor), for a display value
// whose click target is a surrounding control — e.g. the budget amount that
// sits next to its edit/add button. Same at-rest + hover-firm behaviour as the
// inline fields, for a consistent feel.
export const editableUnderlineSx = (theme) => ({
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: theme.palette.divider,
  textDecorationThickness: '1px',
  textUnderlineOffset: '2px',
  '@media (hover: hover)': {
    '&:hover': {
      textDecorationColor: theme.palette.text.primary,
      textDecorationThickness: '2px',
    },
  },
});

// For a wrapping clickable box (e.g. the budget cell that holds the amount plus
// its edit button): the primary amount (a body2) carries the dotted underline,
// and hovering anywhere in the box firms it up — without underlining the icon
// or any secondary caption.
export const editableAmountBoxSx = (theme) => ({
  cursor: 'pointer',
  '& .MuiTypography-body2': {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: theme.palette.divider,
    textDecorationThickness: '1px',
    textUnderlineOffset: '2px',
  },
  '@media (hover: hover)': {
    '&:hover .MuiTypography-body2': {
      textDecorationColor: theme.palette.text.primary,
      textDecorationThickness: '2px',
    },
  },
});

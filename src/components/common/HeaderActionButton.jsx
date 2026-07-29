import { Badge, IconButton } from '@mui/material';

/**
 * The 36×36 page-header action button, shared so every page's header uses the
 * exact same button. Two looks:
 *   - variant="primary"  (default): filled primary circle — the "Add X" action
 *   - variant="secondary": subtle text.secondary icon — filters, etc.
 * Pass `badgeContent` to show the small count badge (e.g. active filters).
 *
 * @param {React.ReactNode} icon - the icon element (size it yourself, e.g. fontSize: 20)
 * @param {() => void} onClick
 * @param {string} label - aria-label
 * @param {'primary'|'secondary'} [variant]
 * @param {number} [badgeContent]
 * @param {object} [sx] - merged onto the button (e.g. a left margin)
 */
export default function HeaderActionButton({
  icon,
  onClick,
  label,
  variant = 'primary',
  badgeContent,
  sx,
  ...rest
}) {
  const primary = variant === 'primary';
  return (
    <IconButton
      onClick={onClick}
      aria-label={label}
      sx={[
        {
          width: 36,
          height: 36,
          ...(primary
            ? {
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { backgroundColor: 'primary.dark' },
              }
            : {
                color: 'text.secondary',
                '&:hover': { backgroundColor: 'action.hover' },
              }),
        },
        sx,
      ]}
      {...rest}
    >
      {badgeContent !== undefined ? (
        <Badge
          badgeContent={badgeContent}
          color="primary"
          overlap="circular"
          sx={{
            '& .MuiBadge-badge': {
              fontSize: '0.5625rem',
              height: 15,
              minWidth: 15,
              px: 0.25,
            },
          }}
        >
          {icon}
        </Badge>
      ) : (
        icon
      )}
    </IconButton>
  );
}

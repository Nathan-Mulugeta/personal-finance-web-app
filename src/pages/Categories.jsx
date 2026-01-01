import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Tooltip,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CategoryIcon from '@mui/icons-material/Category';
import FilterListIcon from '@mui/icons-material/FilterList';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  clearError,
} from '../store/slices/categoriesSlice';
import { categorySchema } from '../schemas/categorySchema';
import { CATEGORY_TYPES, CATEGORY_STATUSES } from '../lib/api/categories';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { buildCategoryTree } from '../utils/categoryHierarchy';

function Categories() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { categories, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.categories);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [filters, setFilters] = useState({
    type: '',
    status: 'Active',
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      type: 'Expense',
      parentCategoryId: null,
      status: 'Active',
    },
  });

  const watchedType = watch('type');
  const watchedStatus = watch('status');
  const watchedParentCategoryId = watch('parentCategoryId');

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['categories'],
    filters: {
      categories: { status: filters.status || undefined },
    },
  });

  // Build category tree client-side from Redux categories data
  const categoryTree = useMemo(() => {
    // Filter categories based on current filters
    let filteredCategories = categories;

    if (filters.type) {
      filteredCategories = filteredCategories.filter(
        (cat) => cat.type === filters.type
      );
    }

    if (filters.status) {
      filteredCategories = filteredCategories.filter(
        (cat) => cat.status === filters.status
      );
    }

    // Build tree from filtered categories
    return buildCategoryTree(filteredCategories);
  }, [categories, filters.type, filters.status]);

  const handleOpenDialog = (category = null, parentCategoryId = null) => {
    if (category) {
      setEditingCategory(category);
      reset({
        name: category.name,
        type: category.type,
        parentCategoryId: category.parent_category_id,
        status: category.status,
      });
    } else {
      setEditingCategory(null);

      // Determine the type for the new category
      // If adding under a parent category, inherit its type
      // Otherwise, use the active filter type or default to 'Expense'
      let inheritedType = filters.type || 'Expense';
      if (parentCategoryId) {
        const parentCategory = categories.find(
          (cat) => cat.category_id === parentCategoryId
        );
        if (parentCategory) {
          inheritedType = parentCategory.type;
        }
      }

      reset({
        name: '',
        type: inheritedType,
        parentCategoryId: parentCategoryId,
        status: 'Active',
      });
    }
    setActionError(null);
    setIsSubmitting(false);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingCategory(null);
    setActionError(null);
    setIsSubmitting(false);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      if (editingCategory) {
        await dispatch(
          updateCategory({
            categoryId: editingCategory.category_id,
            updates: data,
          })
        ).unwrap();
      } else {
        await dispatch(createCategory(data)).unwrap();
      }
      handleCloseDialog();
    } catch (err) {
      console.error('Error saving category:', err);
      const errorMessage =
        err?.message || 'Failed to save category. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(deleteCategory(deleteConfirm.category_id)).unwrap();
      setDeleteConfirm(null);
      setDeleteError(null);
    } catch (err) {
      console.error('Error deleting category:', err);
      const errorMessage =
        err?.message || 'Failed to delete category. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleExpand = (categoryId) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Google-style chip styling for status badges
  const getStatusChipSx = (status) => {
    switch (status) {
      case 'Active':
        return {
          backgroundColor: '#e6f4ea',
          color: '#1e8e3e',
          fontWeight: 500,
        };
      case 'Archived':
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          fontWeight: 500,
        };
      default:
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          fontWeight: 500,
        };
    }
  };

  // Type chip styling - text color only, no background or border
  const getTypeChipSx = (type) => {
    if (type === 'Income') {
      return {
        backgroundColor: 'transparent',
        borderColor: '#1e8e3e',
        color: '#1e8e3e',
        fontWeight: 500,
        border: '1px solid',
      };
    }
    if (type === 'Expense') {
      return {
        backgroundColor: 'transparent',
        borderColor: '#b71c1c',
        color: '#b71c1c',
        fontWeight: 500,
        border: '1px solid',
      };
    }
    return {
      backgroundColor: 'transparent',
      color: '#5f6368',
      fontWeight: 500,
      border: 'none',
    };
  };

  // Get available parent categories (excluding self and descendants when editing)
  const getAvailableParents = () => {
    if (!watchedType) return [];

    let available = categories.filter(
      (cat) =>
        cat.type === watchedType &&
        cat.status === 'Active' &&
        (!editingCategory || cat.category_id !== editingCategory.category_id)
    );

    // When editing, exclude descendants to prevent circular references
    if (editingCategory) {
      const excludeIds = new Set([editingCategory.category_id]);
      const findDescendants = (parentId) => {
        categories.forEach((cat) => {
          if (cat.parent_category_id === parentId) {
            excludeIds.add(cat.category_id);
            findDescendants(cat.category_id);
          }
        });
      };
      findDescendants(editingCategory.category_id);
      available = available.filter((cat) => !excludeIds.has(cat.category_id));
    }

    return available;
  };

  // Count total categories including nested ones
  const countTotalCategories = (nodes) => {
    let count = 0;
    nodes.forEach((node) => {
      count++;
      if (node.children && node.children.length > 0) {
        count += countTotalCategories(node.children);
      }
    });
    return count;
  };

  // Render category tree recursively - Google Sheets-like clean rows
  const renderCategoryTree = (categoryNodes, level = 0) => {
    return categoryNodes.map((category, index) => {
      const hasChildren = category.children && category.children.length > 0;
      const isExpanded = expandedCategories.has(category.category_id);
      const isLast = index === categoryNodes.length - 1;

      return (
        <Box key={category.category_id}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              pl: { xs: level * 2 + 1, sm: level * 3 + 1.5 },
              pr: { xs: 0.5, sm: 1.5 },
              py: { xs: 0.75, sm: 1 },
              minHeight: { xs: 44, sm: 48 },
              borderBottom: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
              transition: 'background-color 0.1s ease',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
              '&:hover .action-buttons': {
                opacity: 1,
              },
            }}
          >
            {/* Expand/Collapse Icon */}
            <Box
              sx={{
                width: { xs: 28, sm: 32 },
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                mr: { xs: 0.25, sm: 0.5 },
                flexShrink: 0,
              }}
            >
              {hasChildren ? (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(category.category_id);
                  }}
                  sx={{
                    p: 0.5,
                    color: 'text.secondary',
                    '&:hover': {
                      backgroundColor: 'transparent',
                      color: 'text.primary',
                    },
                  }}
                >
                  {isExpanded ? (
                    <ExpandMoreIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                  ) : (
                    <ChevronRightIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                  )}
                </IconButton>
              ) : (
                <Box sx={{ width: 28, height: 28 }} />
              )}
            </Box>

            {/* Category Name - Clickable to expand/collapse */}
            <Box
              onClick={() => {
                if (hasChildren) {
                  toggleExpand(category.category_id);
                }
              }}
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.75, sm: 1 },
                cursor: hasChildren ? 'pointer' : 'default',
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: level === 0 ? 500 : 400,
                  fontSize: { xs: '0.875rem', sm: '0.9375rem' },
                  color: 'text.primary',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {category.name}
              </Typography>
              <Chip
                label={category.type}
                size="small"
                sx={{
                  height: { xs: 20, sm: 22 },
                  fontSize: { xs: '0.6875rem', sm: '0.75rem' },
                  flexShrink: 0,
                  border: 'none',
                  '& .MuiChip-label': {
                    px: { xs: 0.75, sm: 1 },
                  },
                  ...getTypeChipSx(category.type),
                }}
              />
              {category.status === 'Archived' && (
                <Chip
                  label="Archived"
                  size="small"
                  sx={{
                    height: { xs: 20, sm: 22 },
                    fontSize: { xs: '0.6875rem', sm: '0.75rem' },
                    flexShrink: 0,
                    '& .MuiChip-label': {
                      px: { xs: 0.75, sm: 1 },
                    },
                    ...getStatusChipSx('Archived'),
                  }}
                />
              )}
            </Box>

            {/* Action Buttons - visible on hover (desktop) or always (mobile) */}
            <Box
              className="action-buttons"
              sx={{
                display: 'flex',
                gap: 0,
                alignItems: 'center',
                ml: 'auto',
                flexShrink: 0,
                opacity: { xs: 1, sm: 0 },
                transition: 'opacity 0.15s ease',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip title="Add subcategory" arrow>
                <IconButton
                  size="small"
                  onClick={() => handleOpenDialog(null, category.category_id)}
                  sx={{
                    p: { xs: 0.5, sm: 0.75 },
                    color: 'text.secondary',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      color: 'primary.main',
                    },
                  }}
                >
                  <AddIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit" arrow>
                <IconButton
                  size="small"
                  onClick={() => handleOpenDialog(category)}
                  sx={{
                    p: { xs: 0.5, sm: 0.75 },
                    color: '#5f6368',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      color: '#1a73e8',
                    },
                  }}
                >
                  <EditIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete" arrow>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteConfirm(category)}
                    disabled={category.status === 'Archived'}
                    sx={{
                      p: { xs: 0.5, sm: 0.75 },
                      color: '#5f6368',
                      '&:hover:not(:disabled)': {
                        backgroundColor: 'action.hover',
                        color: '#d93025',
                      },
                      '&:disabled': {
                        opacity: 0.3,
                      },
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>

          {/* Children */}
          {hasChildren && (
            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
              {renderCategoryTree(category.children, level + 1)}
            </Collapse>
          )}
        </Box>
      );
    });
  };

  if (loading && !isInitialized && categories.length === 0) {
    return <LoadingSpinner />;
  }

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== '' && v !== 'Active'
  ).length;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: { xs: 1.5, sm: 2 },
          gap: { xs: 1, sm: 0 },
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            fontWeight: 500,
            color: 'text.primary',
          }}
        >
          Categories
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          <Button
            variant={activeFilterCount > 0 ? 'contained' : 'text'}
            startIcon={<FilterListIcon sx={{ fontSize: 18 }} />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{
              textTransform: 'none',
              fontSize: '0.875rem',
              minHeight: 36,
              flex: { xs: '1 1 auto', sm: 'none' },
            }}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleOpenDialog()}
            size="small"
            sx={{
              textTransform: 'none',
              fontSize: '0.875rem',
              minHeight: 36,
              flex: { xs: '1 1 auto', sm: 'none' },
            }}
          >
            Add Category
          </Button>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Filters Section */}
      <Collapse in={filtersOpen}>
        <Box
          sx={{
            mb: 2,
            p: { xs: 1.5, sm: 2 },
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.default',
          }}
        >
          <Grid container spacing={{ xs: 1.5, sm: 2 }} alignItems="center">
            <Grid item xs={6} sm={4} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Type</InputLabel>
                <Select
                  value={filters.type}
                  label="Type"
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  sx={{ fontSize: '0.875rem' }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>
                    All Types
                  </MenuItem>
                  {CATEGORY_TYPES.map((type) => (
                    <MenuItem
                      key={type}
                      value={type}
                      sx={{ fontSize: '0.875rem' }}
                    >
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  sx={{ fontSize: '0.875rem' }}
                >
                  {CATEGORY_STATUSES.map((status) => (
                    <MenuItem
                      key={status}
                      value={status}
                      sx={{ fontSize: '0.875rem' }}
                    >
                      {status}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Box>
      </Collapse>

      {categoryTree.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 4, sm: 6 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <CategoryIcon
            sx={{
              fontSize: { xs: 48, sm: 64 },
              color: 'text.secondary',
              mb: 1.5,
              opacity: 0.5,
            }}
          />
          <Typography
            variant="h6"
            color="text.secondary"
            gutterBottom
            sx={{ fontSize: { xs: '1rem', sm: '1.125rem' }, fontWeight: 500 }}
          >
            No categories yet
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, fontSize: '0.875rem' }}
          >
            Create your first category to organize your transactions
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleOpenDialog()}
            sx={{
              textTransform: 'none',
              fontSize: '0.875rem',
              minHeight: 36,
            }}
          >
            Create Category
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: 'background.paper',
          }}
        >
          {/* Table Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: { xs: 1.5, sm: 2 },
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.default',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Category
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              {countTotalCategories(categoryTree)} categor
              {countTotalCategories(categoryTree) === 1 ? 'y' : 'ies'}
            </Typography>
          </Box>
          {/* Category List */}
          <Box>{renderCategoryTree(categoryTree)}</Box>
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>
            {editingCategory ? 'Edit Category' : 'Create New Category'}
          </DialogTitle>
          <DialogContent sx={{ overflow: 'visible' }}>
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
                {actionError}
              </Alert>
            )}
            <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: 2 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Category Name *"
                  {...register('name')}
                  error={!!errors.name}
                  helperText={errors.name?.message}
                  autoFocus
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.type}>
                  <InputLabel>Type *</InputLabel>
                  <Select
                    {...register('type')}
                    label="Type *"
                    value={watchedType || ''}
                    onChange={(e) => setValue('type', e.target.value)}
                  >
                    {CATEGORY_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.type && (
                    <FormHelperText>{errors.type.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.status}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    {...register('status')}
                    label="Status"
                    value={watchedStatus || ''}
                    onChange={(e) => setValue('status', e.target.value)}
                  >
                    {CATEGORY_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.status && (
                    <FormHelperText>{errors.status.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth error={!!errors.parentCategoryId}>
                  <InputLabel>Parent Category (Optional)</InputLabel>
                  <Select
                    {...register('parentCategoryId', {
                      setValueAs: (v) => (v === '' ? null : v),
                    })}
                    label="Parent Category (Optional)"
                    value={watchedParentCategoryId || ''}
                    onChange={(e) =>
                      setValue('parentCategoryId', e.target.value || null)
                    }
                    disabled={!watchedType}
                  >
                    <MenuItem value="">None (Root Category)</MenuItem>
                    {getAvailableParents().map((category) => (
                      <MenuItem
                        key={category.category_id}
                        value={category.category_id}
                      >
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.parentCategoryId && (
                    <FormHelperText>
                      {errors.parentCategoryId.message}
                    </FormHelperText>
                  )}
                  {!watchedType && (
                    <FormHelperText>
                      Please select a category type first
                    </FormHelperText>
                  )}
                  {editingCategory && (
                    <FormHelperText>
                      Note: Cannot set parent to self or descendants
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>
              {editingCategory && (
                <Grid item xs={12}>
                  <Alert severity="info">
                    Changing the parent category will move this category in the
                    hierarchy. Circular references are not allowed.
                  </Alert>
                </Grid>
              )}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              startIcon={
                isSubmitting ? (
                  <CircularProgress size={20} color="inherit" />
                ) : null
              }
            >
              {isSubmitting
                ? editingCategory
                  ? 'Updating...'
                  : 'Creating...'
                : editingCategory
                ? 'Update'
                : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => {
          setDeleteConfirm(null);
          setDeleteError(null);
        }}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Category</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete{' '}
            <strong>{deleteConfirm?.name}</strong>?
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. You cannot delete categories with:
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>Existing transactions</li>
              <li>Subcategories</li>
            </ul>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteConfirm(null);
              setDeleteError(null);
            }}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={
              isDeleting ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Categories;

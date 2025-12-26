import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
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
  fetchCategoryTree,
  createCategory,
  updateCategory,
  deleteCategory,
  clearError,
} from '../store/slices/categoriesSlice';
import { categorySchema } from '../schemas/categorySchema';
import { CATEGORY_TYPES, CATEGORY_STATUSES } from '../lib/api/categories';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

function Categories() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { categories, categoryTree, loading, backgroundLoading, isInitialized, error } = useSelector(
    (state) => state.categories
  );
  const [openDialog, setOpenDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
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

  useEffect(() => {
    // Only fetch if not initialized, otherwise use cached data
    if (!isInitialized) {
      dispatch(fetchCategories({ status: filters.status || undefined }));
      dispatch(fetchCategoryTree({ status: filters.status || undefined }));
    } else {
      // Background refresh
      dispatch(fetchCategories({ status: filters.status || undefined }));
      dispatch(fetchCategoryTree({ status: filters.status || undefined }));
    }
  }, [dispatch, filters.status, isInitialized]);

  useEffect(() => {
    // Filter tree by type if specified
    if (filters.type) {
      dispatch(fetchCategoryTree({ type: filters.type, status: filters.status || undefined }));
    } else {
      dispatch(fetchCategoryTree({ status: filters.status || undefined }));
    }
  }, [dispatch, filters.type, filters.status]);

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
      reset({
        name: '',
        type: filters.type || 'Expense',
        parentCategoryId: parentCategoryId,
        status: 'Active',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingCategory(null);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
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
      // Refresh categories and tree
      dispatch(fetchCategories({ status: filters.status || undefined }));
      dispatch(
        fetchCategoryTree({
          type: filters.type || undefined,
          status: filters.status || undefined,
        })
      );
    } catch (err) {
      console.error('Error saving category:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await dispatch(deleteCategory(deleteConfirm.category_id)).unwrap();
      setDeleteConfirm(null);
      // Refresh categories and tree
      dispatch(fetchCategories({ status: filters.status || undefined }));
      dispatch(
        fetchCategoryTree({
          type: filters.type || undefined,
          status: filters.status || undefined,
        })
      );
    } catch (err) {
      console.error('Error deleting category:', err);
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active':
        return 'success';
      case 'Archived':
        return 'default';
      default:
        return 'default';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Income':
        return 'success';
      case 'Expense':
        return 'error';
      default:
        return 'default';
    }
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

  // Render category tree recursively
  const renderCategoryTree = (categoryNodes, level = 0) => {
    return categoryNodes.map((category) => {
      const hasChildren = category.children && category.children.length > 0;
      const isExpanded = expandedCategories.has(category.category_id);

      return (
        <Box key={category.category_id} sx={{ mb: 0.5 }}>
          <Paper
            elevation={level === 0 ? 1 : 0}
            sx={{
              borderRadius: 1,
              border: '1px solid',
              borderColor: level === 0 ? 'divider' : 'transparent',
              backgroundColor:
                level === 0
                  ? 'background.paper'
                  : level === 1
                  ? 'action.hover'
                  : 'transparent',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'action.hover',
                boxShadow: level === 0 ? 2 : 0,
                borderColor: 'primary.light',
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                pl: { xs: level === 0 ? 1 : level * 2 + 0.5, sm: level === 0 ? 2 : level * 2.5 + 1 },
                pr: { xs: 0.5, sm: 1.5 },
                py: { xs: 1, sm: 1.25 },
                minHeight: { xs: 48, sm: 56 },
              }}
            >
              {/* Expand/Collapse Icon */}
              <Box
                sx={{
                  width: { xs: 24, sm: 32 },
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  mr: { xs: 0.5, sm: 1 },
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
                      color: 'text.secondary',
                      '&:hover': {
                        backgroundColor: 'action.selected',
                        color: 'primary.main',
                      },
                    }}
                  >
                    {isExpanded ? (
                      <ExpandMoreIcon fontSize="small" />
                    ) : (
                      <ChevronRightIcon fontSize="small" />
                    )}
                  </IconButton>
                ) : (
                  <Box sx={{ width: 24, height: 24 }} />
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
                  gap: 1.5,
                  cursor: hasChildren ? 'pointer' : 'default',
                  py: 0.5,
                  px: 1,
                  borderRadius: 1,
                  transition: 'background-color 0.2s',
                  '&:hover': hasChildren
                    ? {
                        backgroundColor: 'action.selected',
                      }
                    : {},
                }}
              >
                <Typography
                  variant="body1"
                  fontWeight={level === 0 ? 600 : 500}
                  sx={{
                    color: 'text.primary',
                    fontSize: { xs: level === 0 ? '0.875rem' : '0.8125rem', sm: level === 0 ? '1rem' : '0.9375rem' },
                  }}
                >
                  {category.name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={category.type}
                    color={getTypeColor(category.type)}
                    size="small"
                    sx={{
                      height: { xs: 20, sm: 24 },
                      fontSize: { xs: '0.6875rem', sm: '0.75rem' },
                      fontWeight: 500,
                    }}
                  />
                  {category.status === 'Archived' && (
                    <Chip
                      label={category.status}
                      color={getStatusColor(category.status)}
                      size="small"
                      sx={{
                        height: { xs: 20, sm: 24 },
                        fontSize: { xs: '0.6875rem', sm: '0.75rem' },
                      }}
                    />
                  )}
                </Box>
              </Box>

              {/* Action Buttons */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.5,
                  alignItems: 'center',
                  ml: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Tooltip title="Add Subcategory" arrow>
                  <IconButton
                    size="small"
                    onClick={() => handleOpenDialog(null, category.category_id)}
                    sx={{
                      color: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.light',
                        color: 'primary.contrastText',
                      },
                    }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit Category" arrow>
                  <IconButton
                    size="small"
                    onClick={() => handleOpenDialog(category)}
                    sx={{
                      color: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.light',
                        color: 'primary.contrastText',
                      },
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete Category" arrow>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteConfirm(category)}
                    disabled={category.status === 'Archived'}
                    sx={{
                      color: 'error.main',
                      '&:hover:not(:disabled)': {
                        backgroundColor: 'error.light',
                        color: 'error.contrastText',
                      },
                      '&:disabled': {
                        opacity: 0.3,
                      },
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Paper>

          {/* Children */}
          {hasChildren && (
            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
              <Box
                sx={{
                  ml: level === 0 ? 2.5 : 2,
                  pl: 2.5,
                  borderLeft: '2px solid',
                  borderColor: 'divider',
                  mt: 0.5,
                }}
              >
                {renderCategoryTree(category.children, level + 1)}
              </Box>
            </Collapse>
          )}
        </Box>
      );
    });
  };

  if (loading && categories.length === 0) {
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
          mb: 3,
          gap: { xs: 2, sm: 0 },
        }}
      >
        <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Categories
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant={activeFilterCount > 0 ? 'contained' : 'outlined'}
            startIcon={<FilterListIcon />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              flex: { xs: '1 1 auto', sm: 'none' },
            }}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            size="small"
            sx={{
              textTransform: 'none',
              fontWeight: 500,
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
        <Card elevation={1} sx={{ mb: 3, border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ mb: 2 }}>
              Filter Categories
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={filters.type}
                    label="Type"
                    onChange={(e) => handleFilterChange('type', e.target.value)}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {CATEGORY_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  >
                    {CATEGORY_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Collapse>

      {categoryTree.length === 0 ? (
        <Card elevation={2}>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CategoryIcon
                sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No categories yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Create your first category to organize your transactions
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                Create Category
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
              px: 1,
            }}
          >
            <Typography variant="h6" fontWeight={600} color="text.primary">
              Category Hierarchy
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {countTotalCategories(categoryTree)} total categor{countTotalCategories(categoryTree) === 1 ? 'y' : 'ies'}
              {categoryTree.length !== countTotalCategories(categoryTree) && (
                <span> ({categoryTree.length} root)</span>
              )}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            {renderCategoryTree(categoryTree)}
          </Box>
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
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
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
                      <MenuItem key={category.category_id} value={category.category_id}>
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
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button type="submit" variant="contained">
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={!!deleteConfirm} 
        onClose={() => setDeleteConfirm(null)}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Category</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete{' '}
            <strong>{deleteConfirm?.name}</strong>?
          </Typography>
          <Alert severity="error" sx={{ mt: 2 }}>
            This action cannot be undone. You cannot delete categories with:
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>Existing transactions</li>
              <li>Subcategories</li>
            </ul>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Categories;

import express from 'express';
import SalesPlan from '../models/SalesPlan.js';
import Product from '../models/Product.js';

const router = express.Router();

// ✅ ENHANCED: Get all sales plans with advanced filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      fiscalYear, 
      month, 
      product, 
      page = 1, 
      limit = 1000,
      sortBy = 'fiscalYear',
      sortOrder = 'desc'
    } = req.query;
    
    let filter = {};
    
    if (status) filter.status = status;
    // UPDATED: Handle fiscalYear as string in range format
    if (fiscalYear) filter.fiscalYear = fiscalYear;
    if (month) filter.month = month;
    
    // ✅ FIXED: Enhanced product filtering
    if (product) {
      try {
        const productDoc = await Product.findById(product);
        if (productDoc) {
          filter.productName = productDoc.Product;
        } else {
          return res.status(404).json({
            success: false,
            message: 'Product not found'
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
            message: 'Invalid product ID'
        });
      }
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // ✅ ENHANCED: Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // ✅ FIXED: No need to populate product since we store name directly
    const salesPlans = await SalesPlan.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await SalesPlan.countDocuments(filter);

    // ✅ ENHANCED: Add display names
    const enhancedSalesPlans = salesPlans.map(plan => ({
      ...plan,
      displayName: `${plan.fiscalYear} - ${plan.month} - ${plan.productName}`
    }));

    console.log(`📊 Fetched ${enhancedSalesPlans.length} sales plans`);

    res.json({
      success: true,
      salesPlans: enhancedSalesPlans,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      filters: {
        status,
        fiscalYear,
        month,
        product
      }
    });
  } catch (error) {
    console.error('❌ Error fetching sales plans:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching sales plans',
      error: error.message 
    });
  }
});

// ✅ ENHANCED: Get sales plan by ID with better error handling
router.get('/:id', async (req, res) => {
  try {
    if (!req.params.id || req.params.id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales plan ID format'
      });
    }

    const salesPlan = await SalesPlan.findById(req.params.id);
    
    if (!salesPlan) {
      return res.status(404).json({ 
        success: false,
        message: 'Sales plan not found' 
      });
    }
    
    res.json({
      success: true,
      salesPlan: salesPlan.toFormattedJSON ? salesPlan.toFormattedJSON() : salesPlan
    });
  } catch (error) {
    console.error('❌ Error fetching sales plan:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales plan ID format'
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Error fetching sales plan',
      error: error.message 
    });
  }
});

// ✅ ENHANCED: Create a new sales plan with comprehensive validation
router.post('/', async (req, res) => {
  try {
    const { product, unit, fiscalYear, month, targetQuantity, status, note } = req.body;
    
    console.log('🆕 Creating new sales plan with data:', { 
      product, 
      fiscalYear, 
      month, 
      targetQuantity,
      status 
    });
    
    // ✅ ENHANCED: Comprehensive validation
    const missingFields = [];
    if (!product) missingFields.push('product');
    if (!fiscalYear) missingFields.push('fiscalYear');
    if (!month) missingFields.push('month');
    if (targetQuantity === undefined || targetQuantity === null) missingFields.push('targetQuantity');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // UPDATED: Validate fiscalYear format (e.g., "2025-2026")
    const fiscalYearRegex = /^\d{4}-\d{4}$/;
    if (!fiscalYearRegex.test(fiscalYear)) {
      return res.status(400).json({
        success: false,
        message: 'Fiscal year must be in format "YYYY-YYYY" (e.g., "2025-2026")'
      });
    }

    // Validate the fiscal year range
    const [startYear, endYear] = fiscalYear.split('-').map(Number);
    if (endYear !== startYear + 1) {
      return res.status(400).json({
        success: false,
        message: 'Fiscal year must be in consecutive years format (e.g., "2025-2026")'
      });
    }

    // Validate target quantity
    if (targetQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Target quantity cannot be negative'
      });
    }

    // Validate month
    const validMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (!validMonths.includes(month)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month'
      });
    }

    // ✅ FIXED: Get product name from Product collection using the provided ID
    let productDoc;
    try {
      productDoc = await Product.findById(product);
      if (!productDoc) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    if (productDoc.Status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot create sales plan for inactive product'
      });
    }

    // ✅ FIXED: Check for duplicate using product name (not ID)
    const existingPlan = await SalesPlan.findOne({
      productName: productDoc.Product,
      fiscalYear: fiscalYear, // UPDATED: Already in range format
      month,
      status: 'Active'
    });

    if (existingPlan) {
      return res.status(409).json({
        success: false,
        message: 'Active sales plan already exists for this product, fiscal year, and month combination'
      });
    }

    // ✅ FIXED: Create new sales plan with auto-generated ID
    const salesPlan = new SalesPlan({
      productName: productDoc.Product, // Store product name only
      unit: unit || productDoc.Unit || 'Unit',
      fiscalYear: fiscalYear, // UPDATED: In range format
      month,
      targetQuantity: parseInt(targetQuantity),
      status: status || 'Active',
      note: note || ''
    });

    console.log('📝 Saving new sales plan...');
    const newSalesPlan = await salesPlan.save();
    
    console.log('✅ New sales plan created with ID:', newSalesPlan._id);
    
    res.status(201).json({
      success: true,
      message: 'Sales plan created successfully',
      salesPlan: newSalesPlan.toFormattedJSON ? newSalesPlan.toFormattedJSON() : newSalesPlan
    });
  } catch (error) {
    console.error('❌ Error creating sales plan:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Sales plan already exists for this product, fiscal year, and month combination'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating sales plan',
      error: error.message
    });
  }
});

// ✅ ENHANCED: Update existing sales plan with comprehensive validation
router.put('/:id', async (req, res) => {
  try {
    const { product, unit, fiscalYear, month, targetQuantity, status, note } = req.body;
    
    console.log('📝 Updating sales plan ID:', req.params.id, 'with data:', { 
      product, 
      fiscalYear, 
      month, 
      targetQuantity,
      status 
    });
    
    // Validate ID format
    if (!req.params.id || req.params.id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales plan ID format'
      });
    }

    const salesPlan = await SalesPlan.findById(req.params.id);
    if (!salesPlan) {
      return res.status(404).json({ 
        success: false,
        message: 'Sales plan not found' 
      });
    }

    // UPDATED: Validate fiscalYear format if provided
    if (fiscalYear) {
      const fiscalYearRegex = /^\d{4}-\d{4}$/;
      if (!fiscalYearRegex.test(fiscalYear)) {
        return res.status(400).json({
          success: false,
          message: 'Fiscal year must be in format "YYYY-YYYY" (e.g., "2025-2026")'
        });
      }

      const [startYear, endYear] = fiscalYear.split('-').map(Number);
      if (endYear !== startYear + 1) {
        return res.status(400).json({
          success: false,
          message: 'Fiscal year must be in consecutive years format (e.g., "2025-2026")'
        });
      }
    }

    // Validate target quantity if provided
    if (targetQuantity !== undefined && targetQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Target quantity cannot be negative'
      });
    }

    let productName = salesPlan.productName;
    let finalUnit = unit || salesPlan.unit;

    // ✅ FIXED: If product ID is provided, get the product name from Product collection
    if (product) {
      let productDoc;
      try {
        productDoc = await Product.findById(product);
        if (!productDoc) {
          return res.status(404).json({
            success: false,
            message: 'Product not found'
          });
        }
        productName = productDoc.Product;
        finalUnit = unit || productDoc.Unit || salesPlan.unit;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product ID format'
        });
      }
    }

    // ✅ FIXED: Check for duplicate using product name only for active plans
    const updatedFiscalYear = fiscalYear || salesPlan.fiscalYear;
    const updatedMonth = month || salesPlan.month;
    const updatedStatus = status || salesPlan.status;

    if (updatedStatus === 'Active') {
      const existingPlan = await SalesPlan.findOne({
        productName: productName,
        fiscalYear: updatedFiscalYear,
        month: updatedMonth,
        status: 'Active',
        _id: { $ne: req.params.id }
      });

      if (existingPlan) {
        return res.status(409).json({
          success: false,
          message: 'Another active sales plan already exists for this product, fiscal year, and month combination'
        });
      }
    }

    // ✅ FIXED: Update the existing sales plan with new data
    const updateData = {};
    if (product) updateData.productName = productName;
    if (unit !== undefined) updateData.unit = finalUnit;
    if (fiscalYear) updateData.fiscalYear = fiscalYear;
    if (month) updateData.month = month;
    if (targetQuantity !== undefined) updateData.targetQuantity = parseInt(targetQuantity);
    if (status) updateData.status = status;
    if (note !== undefined) updateData.note = note;

    const updatedSalesPlan = await SalesPlan.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    console.log('✅ Sales plan updated successfully:', updatedSalesPlan._id);
    
    res.json({
      success: true,
      message: 'Sales plan updated successfully',
      salesPlan: updatedSalesPlan.toFormattedJSON ? updatedSalesPlan.toFormattedJSON() : updatedSalesPlan
    });
  } catch (error) {
    console.error('❌ Error updating sales plan:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales plan ID format'
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Another sales plan already exists for this product, fiscal year, and month combination'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating sales plan',
      error: error.message
    });
  }
});

// ✅ ENHANCED: Delete a sales plan with better validation
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting sales plan ID:', req.params.id);
    
    // Validate ID format
    if (!req.params.id || req.params.id.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales plan ID format'
      });
    }
    
    const salesPlan = await SalesPlan.findById(req.params.id);
    if (!salesPlan) {
      return res.status(404).json({ 
        success: false,
        message: 'Sales plan not found' 
      });
    }

    await SalesPlan.findByIdAndDelete(req.params.id);
    
    console.log('✅ Sales plan deleted successfully:', req.params.id);
    
    res.json({
      success: true,
      message: 'Sales plan deleted successfully',
      deletedPlan: {
        id: req.params.id,
        productName: salesPlan.productName,
        fiscalYear: salesPlan.fiscalYear,
        month: salesPlan.month
      }
    });
  } catch (error) {
    console.error('❌ Error deleting sales plan:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid sales plan ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error deleting sales plan',
      error: error.message
    });
  }
});

// ✅ ENHANCED: Get sales dashboard statistics with error handling
router.get('/dashboard/stats', async (req, res) => {
  try {
    const { fiscalYear } = req.query;
    
    console.log('📈 Fetching dashboard stats for fiscal year:', fiscalYear || 'all');
    
    const stats = await SalesPlan.getDashboardStats(fiscalYear || null);
    
    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
});

// ✅ ENHANCED: Get active products for dropdown with better error handling
router.get('/products/active', async (req, res) => {
  try {
    console.log('🛍️ Fetching active products...');
    
    const products = await Product.find({ 
      Status: 'Active'
    })
    .select('Product ProductCode PackSize Unit ProductPrice Status')
    .sort({ Product: 1 })
    .lean();
    
    console.log(`✅ Found ${products.length} active products`);
    
    res.json({
      success: true,
      products: products.map(product => ({
        ...product,
        name: product.Product,
        code: product.ProductCode,
        unit: product.Unit,
        price: product.ProductPrice,
        status: product.Status
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

// ✅ ENHANCED: Get fiscal years from existing sales plans
router.get('/fiscal-years', async (req, res) => {
  try {
    console.log('📅 Fetching fiscal years...');
    
    const fiscalYears = await SalesPlan.distinct('fiscalYear');
    
    // If no fiscal years exist, generate default ones
    if (fiscalYears.length === 0) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      
      // Generate fiscal years based on current date
      let startYear;
      if (currentMonth >= 7) {
        startYear = currentYear;
      } else {
        startYear = currentYear - 1;
      }
      
      // Generate 5 fiscal years including current and next 4
      for (let i = 0; i < 5; i++) {
        const year = startYear + i;
        fiscalYears.push(`${year}-${year + 1}`);
      }
      
      console.log('📅 Generated default fiscal years:', fiscalYears);
    } else {
      console.log(`📅 Found ${fiscalYears.length} fiscal years in database`);
    }
    
    // Sort fiscal years in descending order
    const sortedFiscalYears = fiscalYears.sort((a, b) => {
      const yearA = parseInt(a.split('-')[0]);
      const yearB = parseInt(b.split('-')[0]);
      return yearB - yearA;
    });
    
    res.json({
      success: true,
      fiscalYears: sortedFiscalYears
    });
  } catch (error) {
    console.error('❌ Error fetching fiscal years:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching fiscal years',
      error: error.message
    });
  }
});

// ✅ NEW: Bulk operations endpoint
router.post('/bulk', async (req, res) => {
  try {
    const { operations } = req.body;
    
    if (!Array.isArray(operations)) {
      return res.status(400).json({
        success: false,
        message: 'Operations must be an array'
      });
    }
    
    const results = [];
    
    for (const operation of operations) {
      try {
        let result;
        if (operation.type === 'create') {
          result = await SalesPlan.create(operation.data);
        } else if (operation.type === 'update') {
          result = await SalesPlan.findByIdAndUpdate(operation.id, operation.data, { new: true });
        } else if (operation.type === 'delete') {
          result = await SalesPlan.findByIdAndDelete(operation.id);
        }
        results.push({ success: true, operation: operation.type, result });
      } catch (error) {
        results.push({ success: false, operation: operation.type, error: error.message });
      }
    }
    
    res.json({
      success: true,
      message: 'Bulk operations completed',
      results
    });
  } catch (error) {
    console.error('❌ Error in bulk operations:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing bulk operations',
      error: error.message
    });
  }
});

export default router;
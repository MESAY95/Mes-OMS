import express from 'express';
const router = express.Router();
import InfoPricing from '../models/InfoPricing.js';

// Get all info pricing records with advanced filtering
router.get('/', async (req, res) => {
  try {
    const { 
      productType, 
      category, 
      active = 'true',
      search,
      dateFrom,
      dateTo,
      page = 1, 
      limit = 50,
      sortBy = 'category',
      sortOrder = 'asc'
    } = req.query;
    
    let filter = {};
    
    // Build filter conditions
    if (productType) filter.productType = productType;
    if (category) filter.category = category;
    if (active !== 'false') filter.isActive = true;
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.effectiveDate = {};
      if (dateFrom) filter.effectiveDate.$gte = new Date(dateFrom);
      if (dateTo) filter.effectiveDate.$lte = new Date(dateTo);
    }
    
    // Search functionality
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { remark: { $regex: search, $options: 'i' } },
        { unit: { $regex: search, $options: 'i' } }
      ];
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const infoPricings = await InfoPricing.find(filter)
      .populate('productType', 'name sku category') // Add productType population
      .populate('materialId', 'name sku category unit currentPrice')
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);
    
    const total = await InfoPricing.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);
    
    // Get summary statistics
    const categorySummary = await InfoPricing.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$category',
          totalValue: { $sum: '$value' },
          itemCount: { $sum: 1 },
          averageValue: { $avg: '$value' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: infoPricings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      summary: {
        categorySummary,
        totalValue: categorySummary.reduce((sum, cat) => sum + cat.totalValue, 0),
        totalItems: total
      }
    });
  } catch (error) {
    console.error('Error fetching info pricings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while fetching pricing information',
      error: error.message 
    });
  }
});

// Get info pricing by ID
router.get('/:id', async (req, res) => {
  try {
    const infoPricing = await InfoPricing.findById(req.params.id)
      .populate('productType', 'name sku category') // Add productType population
      .populate('materialId', 'name sku category unit currentPrice specifications');
    
    if (!infoPricing) {
      return res.status(404).json({
        success: false,
        message: 'Pricing information not found'
      });
    }
    
    res.json({
      success: true,
      data: infoPricing
    });
  } catch (error) {
    console.error('Error fetching info pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pricing information',
      error: error.message
    });
  }
});

// Create new info pricing
router.post('/', async (req, res) => {
  try {
    // Check for duplicates
    const { productType, description, category, effectiveDate } = req.body;
    const existing = await InfoPricing.checkDuplicate(
      productType, 
      description, 
      category, 
      new Date(effectiveDate)
    );
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate pricing information found',
        duplicate: existing
      });
    }
    
    const infoPricing = new InfoPricing(req.body);
    const savedInfoPricing = await infoPricing.save();
    
    // Populate both productType and materialId
    await savedInfoPricing.populate('productType', 'name sku category');
    await savedInfoPricing.populate('materialId', 'name sku category unit currentPrice');
    
    res.status(201).json({
      success: true,
      message: 'Pricing information created successfully',
      data: savedInfoPricing
    });
  } catch (error) {
    console.error('Error creating info pricing:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(400).json({
      success: false,
      message: 'Error creating pricing information',
      error: error.message
    });
  }
});

// Update other routes similarly...
// Update the productType parameter to expect ObjectId in these routes:
// - GET /product/:productType → /product/:productTypeId
// - GET /calculate/:productType → /calculate/:productTypeId

// Get pricing information by product type ID
router.get('/product/:productTypeId', async (req, res) => {
  try {
    const { productTypeId } = req.params;
    const infoPricings = await InfoPricing.getActiveByProductType(productTypeId);
    
    res.json({
      success: true,
      data: infoPricings,
      count: infoPricings.length
    });
  } catch (error) {
    console.error('Error fetching info pricings by product type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pricing information',
      error: error.message
    });
  }
});

// Calculate pricing for specific product by ID
router.get('/calculate/:productTypeId', async (req, res) => {
  try {
    const { productTypeId } = req.params;
    const { productionVolume = 1000 } = req.query;
    
    const pricingInfo = await InfoPricing.getActiveByProductType(productTypeId);
    
    // Calculate comprehensive pricing
    const calculation = {
      productType: productTypeId,
      productionVolume: parseInt(productionVolume),
      costBreakdown: {},
      totalCost: 0,
      costPerUnit: 0
    };
    
    // Group by category and calculate
    pricingInfo.forEach(item => {
      if (!calculation.costBreakdown[item.category]) {
        calculation.costBreakdown[item.category] = {
          total: 0,
          items: []
        };
      }
      
      const itemCost = item.value * (item.calculationRules?.allocationFactor || 1) * 
                      (item.calculationRules?.wasteFactor || 1);
      
      calculation.costBreakdown[item.category].total += itemCost;
      calculation.costBreakdown[item.category].items.push({
        description: item.description,
        value: item.value,
        unit: item.unit,
        calculatedCost: itemCost,
        material: item.materialId ? {
          name: item.materialId.name,
          sku: item.materialId.sku
        } : null
      });
      
      calculation.totalCost += itemCost;
    });
    
    calculation.costPerUnit = calculation.totalCost / parseInt(productionVolume);
    
    res.json({
      success: true,
      data: calculation
    });
  } catch (error) {
    console.error('Error calculating pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while calculating pricing',
      error: error.message
    });
  }
});

export default router;
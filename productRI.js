import express from 'express';
import mongoose from 'mongoose';
import ProductRI from '../models/ProductRI.js';
import Product from '../models/Product.js';

const router = express.Router();

// Enhanced ProductCache class for product name lookup
class ProductCache {
  constructor(ttl = 300000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  remove(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

const productCache = new ProductCache();

// Enhanced utility function to find product by name
const findProductByName = async (productName) => {
  if (!productName) return null;

  // Check cache first
  const cacheKey = `product_${productName.toLowerCase().trim()}`;
  const cachedProduct = productCache.get(cacheKey);
  if (cachedProduct) return cachedProduct;

  try {
    console.log('🔍 Searching for product:', productName);
    
    // Query database for active product - case insensitive search
    const product = await Product.findOne({
      $or: [
        { Product: { $regex: new RegExp(`^${productName}$`, 'i') } },
        { Product: productName }
      ],
      Status: 'Active'
    }).select('_id Product ProductCode Status Unit').lean();

    if (product) {
      // Transform product data for consistency
      const transformedProduct = {
        _id: product._id,
        name: product.Product,
        code: product.ProductCode,
        unit: product.Unit || 'PCS',
        status: product.Status
      };
      
      productCache.set(cacheKey, transformedProduct);
      return transformedProduct;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error finding product:', error);
    return null;
  }
};

// Enhanced response transformer
const transformRecord = (record) => ({
  _id: record._id,
  Date: record.Date,
  Activity: record.Activity,
  Product: record.Product,
  ProductCode: record.ProductCode,
  Unit: record.Unit,
  Batch: record.Batch,
  Quantity: record.Quantity,
  Stock: record.Stock,
  ExpireDate: record.ExpireDate,
  Note: record.Note,
  DocumentNumber: record.DocumentNumber,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

// Enhanced GET /api/product-ri - Get all records with pagination and sorting
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      activity,
      product,
      startDate,
      endDate,
      search,
      sortBy = 'Date',
      sortOrder = 'asc'
    } = req.query;

    console.log('📥 Fetching records with filters:', req.query);

    const filter = {};
    
    if (activity) filter.Activity = activity;
    if (product) filter.Product = product;
    
    if (startDate || endDate) {
      filter.Date = {};
      if (startDate) filter.Date.$gte = new Date(startDate);
      if (endDate) filter.Date.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { Batch: new RegExp(search, 'i') },
        { ProductCode: new RegExp(search, 'i') },
        { DocumentNumber: new RegExp(search, 'i') },
        { Note: new RegExp(search, 'i') },
        { Product: new RegExp(search, 'i') }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const [records, total] = await Promise.all([
      ProductRI.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip((options.page - 1) * options.limit)
        .lean(),
      ProductRI.countDocuments(filter)
    ]);

    const responseData = {
      records: records.map(transformRecord),
      totalPages: Math.ceil(total / options.limit),
      currentPage: options.page,
      totalRecords: total,
      sortBy,
      sortOrder
    };

    console.log(`✅ Found ${records.length} records, sorted by ${sortBy} ${sortOrder}`);
    res.json(responseData);
  } catch (error) {
    console.error('❌ Error fetching records:', error);
    res.status(500).json({ 
      message: 'Error fetching records',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ENHANCED POST /api/product-ri with PROPER expire date handling
router.post('/', async (req, res) => {
  try {
    const {
      Date: dateValue,
      Activity,
      Product: productName,
      Batch,
      Unit,
      Quantity,
      ExpireDate,
      Note,
      DocumentNumber
    } = req.body;

    console.log('📥 Received data for new record:', {
      productName,
      Activity,
      Quantity,
      Batch,
      DocumentNumber,
      dateValue,
      ExpireDate
    });

    // ✅ Validate required fields
    if (!productName) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    const validActivities = ['Receive', 'Issue', 'Return', 'ReceiveCustomer [Rework]', 'IssueCustomer [Rework]', 'IssueProd [Rework]', 'ReceiveProd [Rework]', 'Sample', 'Gift', 'Promotion', 'Waste'];
    if (!Activity || !validActivities.includes(Activity)) {
      return res.status(400).json({ message: 'Valid activity is required' });
    }

    if (!Quantity || Quantity <= 0) {
      return res.status(400).json({ message: 'Valid quantity is required' });
    }

    if (!DocumentNumber || DocumentNumber.trim() === '') {
      return res.status(400).json({ message: 'Document number is required' });
    }

    // ✅ Validate ExpireDate for specific activities
    const expireDateRequiredActivities = ['Receive', 'ReceiveProd [Rework]', 'Waste', 'Issue', 'IssueCustomer [Rework]'];
    if (expireDateRequiredActivities.includes(Activity)) {
      if (!ExpireDate) {
        return res.status(400).json({ message: 'Expire Date is required for ' + Activity + ' activities' });
      }
      
      const transactionDate = new Date(dateValue);
      const expireDateObj = new Date(ExpireDate);
      
      // Reset time parts for accurate date comparison
      transactionDate.setHours(0, 0, 0, 0);
      expireDateObj.setHours(0, 0, 0, 0);
      
      if (expireDateObj < transactionDate) {
        return res.status(400).json({ 
          message: 'Expire Date cannot be before the transaction date' 
        });
      }
    }

    // ✅ Validate Batch for manual entry activities
    const manualBatchActivities = ['Return', 'ReceiveCustomer [Rework]'];
    if (manualBatchActivities.includes(Activity) && (!Batch || Batch.trim() === '')) {
      return res.status(400).json({ message: 'Batch number is required for ' + Activity + ' activities' });
    }

    // ✅ Validate manual batch format for manual entry activities
    if (manualBatchActivities.includes(Activity) && Batch) {
      // Find product to get product code for validation
      const productDoc = await findProductByName(productName);
      if (productDoc && !Batch.startsWith(`${productDoc.code}-`)) {
        return res.status(400).json({ 
          message: `Batch must start with "${productDoc.code}-" for ${Activity} activities` 
        });
      }
      
      if (productDoc && (Batch === `${productDoc.code}-` || Batch.length <= productDoc.code.length + 1)) {
        return res.status(400).json({ 
          message: 'Please enter a batch identifier after the product code prefix' 
        });
      }
    }

    // ✅ Find product by name in database to validate and get product code
    const productDoc = await findProductByName(productName);
    if (!productDoc) {
      return res.status(400).json({ 
        message: `Active product "${productName}" not found. Please select a valid active product.` 
      });
    }

    console.log('✅ Product found:', productDoc);

    let finalBatch = Batch;
    let finalUnit = Unit || productDoc.unit || 'PCS';
    
    // ✅ For populated batch activities, validate batch selection
    const populatedBatchActivities = [
      'Receive', 'ReceiveProd [Rework]', 'Waste', 
      'Issue', 'IssueProd [Rework]', 'IssueCustomer [Rework]',
      'Sample', 'Gift', 'Promotion'
    ];
    
    if (populatedBatchActivities.includes(Activity)) {
      if (!finalBatch) {
        return res.status(400).json({ message: 'Batch is required for ' + Activity + ' activities' });
      }

      try {
        const availableBatches = await ProductRI.getAvailableBatches(productName, Activity);
        const selectedBatch = availableBatches.find(b => b._id === finalBatch);
        
        if (!selectedBatch) {
          return res.status(400).json({ 
            message: `Batch "${finalBatch}" not found or not available for ${Activity} activities` 
          });
        }
        
        if (selectedBatch.totalStock < parseFloat(Quantity) && selectedBatch.totalStock > 0) {
          return res.status(400).json({ 
            message: `Insufficient stock. Available: ${selectedBatch.totalStock}, Requested: ${Quantity}` 
          });
        }

        // ENHANCED: Log expire date information for debugging
        console.log(`📅 Batch expire date info:`, {
          batch: finalBatch,
          hasExpireDate: !!selectedBatch.expireDate,
          expireDate: selectedBatch.expireDate,
          activity: Activity,
          requiresExpireDate: expireDateRequiredActivities.includes(Activity)
        });
      } catch (stockError) {
        console.error('❌ Batch validation error:', stockError);
        return res.status(400).json({ 
          message: 'Error validating batch availability' 
        });
      }
    }

    // ✅ Create record
    const newRecord = new ProductRI({
      Date: new Date(dateValue),
      Activity,
      Product: productName,
      ProductCode: productDoc.code,
      Unit: finalUnit,
      Batch: finalBatch,
      Quantity: parseFloat(Quantity),
      ExpireDate: expireDateRequiredActivities.includes(Activity) ? new Date(ExpireDate) : undefined,
      Note: Note && Note.length > 100 ? Note.substring(0, 100) : Note,
      DocumentNumber: DocumentNumber
    });

    console.log('💾 Saving record:', {
      Product: productName,
      ProductCode: productDoc.code,
      Unit: finalUnit,
      Batch: finalBatch,
      Quantity: parseFloat(Quantity),
      DocumentNumber: DocumentNumber,
      ExpireDate: newRecord.ExpireDate
    });

    // ✅ Save the record
    const savedRecord = await newRecord.save();
    
    console.log('✅ Record saved successfully:', savedRecord._id);
    
    // ✅ Clear cache
    productCache.remove(`product_${productName.toLowerCase().trim()}`);
    
    res.status(201).json({
      message: 'Record created successfully',
      record: transformRecord(savedRecord.toObject())
    });
  } catch (error) {
    console.error('❌ Error creating record:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation failed', errors });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate entry found' });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid data format' });
    }
    
    // Handle custom stock validation errors
    if (error.message && error.message.includes('Insufficient stock')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ 
      message: 'Error creating record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ENHANCED PUT /api/product-ri/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid record ID' });
    }

    const {
      Date: dateValue,
      Activity,
      Product: productName,
      Batch,
      Unit,
      Quantity,
      ExpireDate,
      Note,
      DocumentNumber
    } = req.body;

    console.log('📥 Updating record:', { id, productName, Activity, DocumentNumber });

    // Check if record exists
    const existingRecord = await ProductRI.findById(id);
    if (!existingRecord) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // ✅ Validate ExpireDate for specific activities
    const expireDateRequiredActivities = ['Receive', 'ReceiveProd [Rework]', 'Waste', 'Issue', 'IssueCustomer [Rework]'];
    if (expireDateRequiredActivities.includes(Activity)) {
      if (!ExpireDate) {
        return res.status(400).json({ message: 'Expire Date is required for ' + Activity + ' activities' });
      }
      
      const transactionDate = new Date(dateValue);
      const expireDateObj = new Date(ExpireDate);
      
      // Reset time parts for accurate date comparison
      transactionDate.setHours(0, 0, 0, 0);
      expireDateObj.setHours(0, 0, 0, 0);
      
      if (expireDateObj < transactionDate) {
        return res.status(400).json({ 
          message: 'Expire Date cannot be before the transaction date' 
        });
      }
    }

    // ✅ Validate manual batch format for manual entry activities
    const manualBatchActivities = ['Return', 'ReceiveCustomer [Rework]'];
    if (manualBatchActivities.includes(Activity) && Batch) {
      const productCode = existingRecord.ProductCode;
      if (!Batch.startsWith(`${productCode}-`)) {
        return res.status(400).json({ 
          message: `Batch must start with "${productCode}-" for ${Activity} activities` 
        });
      }
      
      if (Batch === `${productCode}-` || Batch.length <= productCode.length + 1) {
        return res.status(400).json({ 
          message: 'Please enter a batch identifier after the product code prefix' 
        });
      }
    }

    // ✅ FIXED: Use existing product data for updates
    const finalProductName = productName || existingRecord.Product;
    const productCode = existingRecord.ProductCode;
    const finalUnit = existingRecord.Unit;

    console.log('🔧 Update product handling:', {
      providedProduct: productName,
      finalProductName,
      existingProductCode: productCode,
      unit: finalUnit
    });

    // Update record
    const updateData = {
      Date: new Date(dateValue),
      Activity,
      Product: finalProductName,
      ProductCode: productCode,
      Unit: finalUnit,
      Batch,
      Quantity: parseFloat(Quantity),
      ExpireDate: expireDateRequiredActivities.includes(Activity) ? new Date(ExpireDate) : undefined,
      Note: Note && Note.length > 100 ? Note.substring(0, 100) : Note,
      DocumentNumber
    };

    const updatedRecord = await ProductRI.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log('✅ Record updated successfully:', id);
    
    res.json({
      message: 'Record updated successfully',
      record: transformRecord(updatedRecord.toObject())
    });
  } catch (error) {
    console.error('❌ Error updating record:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation failed', errors });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid record ID' });
    }
    
    res.status(500).json({ 
      message: 'Error updating record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced DELETE /api/product-ri/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid record ID' });
    }

    console.log('🗑️ Deleting record:', id);

    const recordToDelete = await ProductRI.findById(id);
    if (!recordToDelete) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const productName = recordToDelete.Product;

    await recordToDelete.deleteOne();

    console.log('✅ Record deleted successfully:', id);
    
    // Clear cache
    productCache.remove(`product_${productName.toLowerCase().trim()}`);

    res.json({ 
      message: 'Record deleted successfully',
      record: transformRecord(recordToDelete.toObject())
    });
  } catch (error) {
    console.error('❌ Error deleting record:', error);
    res.status(500).json({ 
      message: 'Error deleting record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/product-ri/stocks/summary - Stock summary endpoint
router.get('/stocks/summary', async (req, res) => {
  try {
    console.log('📊 Fetching stock summary');
    
    const availableBatches = await ProductRI.aggregate([
      {
        $group: {
          _id: '$Batch',
          totalStock: { 
            $sum: { 
              $cond: [
                { $in: ['$Activity', ['Receive', 'ReceiveCustomer [Rework]', 'ReceiveProd [Rework]'] ]}, 
                '$Quantity', 
                { $multiply: ['$Quantity', -1] }
              ]
            }
          },
          product: { $first: '$Product' },
          productCode: { $first: '$ProductCode' },
          expireDate: { $max: '$ExpireDate' }
        }
      },
      { $match: { totalStock: { $gt: 0 } } },
      { $sort: { expireDate: 1 } }
    ]).exec();
    
    // Group by product and calculate total stock
    const stockSummary = availableBatches.reduce((acc, batch) => {
      const productName = batch.product;
      
      if (!acc[productName]) {
        acc[productName] = {
          productName: productName,
          productCode: batch.productCode || 'N/A',
          totalStock: 0,
          batches: []
        };
      }
      
      acc[productName].totalStock += batch.totalStock;
      acc[productName].batches.push({
        batch: batch._id,
        stock: batch.totalStock,
        expireDate: batch.expireDate
      });
      
      return acc;
    }, {});

    const summaryArray = Object.values(stockSummary);
    
    console.log(`✅ Stock summary: ${summaryArray.length} products with stock`);
    res.json(summaryArray);
  } catch (error) {
    console.error('❌ Error fetching stock summary:', error);
    res.status(500).json({ 
      message: 'Error fetching stock summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ENHANCED GET /api/product-ri/batches/available - Available batches with DEBUG info
router.get('/batches/available', async (req, res) => {
  try {
    const { productName, activity } = req.query;
    
    console.log('🔍 Fetching available batches for product:', { productName, activity });

    if (!productName) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    if (!activity) {
      return res.status(400).json({ message: 'Activity is required' });
    }

    // Validate product exists and is active
    const productDoc = await findProductByName(productName);
    if (!productDoc) {
      return res.status(400).json({ message: 'Product not found or not active' });
    }

    // Use the new batch population system
    const availableBatches = await ProductRI.getAvailableBatches(productName, activity);
    
    console.log(`✅ Found ${availableBatches.length} available batches for activity: ${activity}`);
    console.log(`📅 Batches with expire dates: ${availableBatches.filter(b => b.expireDate).length}`);
    
    // Debug: log first few batches
    availableBatches.slice(0, 3).forEach((batch, index) => {
      console.log(`📦 Sample batch ${index + 1}:`, {
        id: batch._id,
        expireDate: batch.expireDate,
        expireDateISO: batch.expireDate ? new Date(batch.expireDate).toISOString() : 'N/A',
        stock: batch.totalStock,
        source: batch.sourceActivity
      });
    });
    
    res.json({ availableBatches });
  } catch (error) {
    console.error('❌ Error fetching available batches:', error);
    res.status(500).json({ 
      message: 'Error fetching available batches',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/product-ri/stock/:batch - Batch stock
router.get('/stock/:batch', async (req, res) => {
  try {
    const { batch } = req.params;
    console.log('🔍 Fetching stock for batch:', batch);
    
    const stock = await ProductRI.getBatchStock(batch);
    
    console.log(`✅ Batch ${batch} stock: ${stock}`);
    res.json({ stock });
  } catch (error) {
    console.error('❌ Error fetching batch stock:', error);
    res.status(500).json({ 
      message: 'Error fetching batch stock',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// NEW: Debug endpoint to check batch expire dates
router.get('/batches/debug/:batch', async (req, res) => {
  try {
    const { batch } = req.params;
    
    console.log('🔍 Debugging batch:', batch);
    
    // Check in ProductRI
    const productRIRecords = await ProductRI.find({ Batch: batch })
      .select('Activity Product ProductCode ExpireDate Quantity Date')
      .sort({ Date: 1 })
      .lean();
    
    // Check in ProductionManagement
    const ProductionManagement = mongoose.model('ProductionManagement');
    const productionRecords = await ProductionManagement.find({ Batch: batch })
      .select('Activity Product ProductCode ExpireDate Quantity Date')
      .sort({ Date: 1 })
      .lean();
    
    res.json({
      batch,
      productRIRecords,
      productionRecords,
      summary: {
        productRITotal: productRIRecords.length,
        productionTotal: productionRecords.length,
        hasExpireDateInProductRI: productRIRecords.some(r => r.ExpireDate),
        hasExpireDateInProduction: productionRecords.some(r => r.ExpireDate)
      }
    });
  } catch (error) {
    console.error('❌ Error debugging batch:', error);
    res.status(500).json({ 
      message: 'Error debugging batch',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/product-ri/products/active - Get active products
router.get('/products/active', async (req, res) => {
  try {
    console.log('📦 Fetching active products');
    
    const activeProducts = await Product.find({ Status: 'Active' })
      .select('_id Product ProductCode Status Unit')
      .lean();

    const transformedProducts = activeProducts.map(product => ({
      _id: product._id,
      name: product.Product,
      code: product.ProductCode,
      unit: product.Unit || 'PCS',
      status: product.Status
    }));

    console.log(`✅ Found ${transformedProducts.length} active products`);
    res.json(transformedProducts);
  } catch (error) {
    console.error('❌ Error fetching active products:', error);
    res.status(500).json({ 
      message: 'Error fetching active products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Product RI API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

export default router;
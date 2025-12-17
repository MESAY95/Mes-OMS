import express from 'express';
import mongoose from 'mongoose';
import ProductionManagement from '../models/ProductionManagement.js';
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

// Enhanced response transformer - NOW STORES PRODUCT NAME DIRECTLY
const transformRecord = (record) => ({
  _id: record._id,
  Date: record.Date,
  Activity: record.Activity,
  Product: record.Product, // Now stored as string name
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

// Enhanced GET /api/production-managements - Get all records with pagination and sorting
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
    if (product) filter.Product = product; // Now filtering by product name directly
    
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
        { Product: new RegExp(search, 'i') } // Also search by product name
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const [records, total] = await Promise.all([
      ProductionManagement.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip((options.page - 1) * options.limit)
        .lean(),
      ProductionManagement.countDocuments(filter)
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

// ENHANCED POST /api/production-managements - Now stores product name directly
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
      dateValue
    });

    // ✅ Validate required fields
    if (!productName) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    const validActivities = ['Production', 'Transfer', 'Receive [Rework]', 'Issue [Rework]', 'Waste'];
    if (!Activity || !validActivities.includes(Activity)) {
      return res.status(400).json({ message: 'Valid activity is required' });
    }

    if (!Quantity || Quantity <= 0) {
      return res.status(400).json({ message: 'Valid quantity is required' });
    }

    if (!DocumentNumber || DocumentNumber.trim() === '') {
      return res.status(400).json({ message: 'Document number is required' });
    }

    // ✅ Validate ExpireDate for Production, Transfer, and Receive [Rework] activities
    const expireDateRequiredActivities = ['Production', 'Transfer', 'Receive [Rework]'];
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
    const manualBatchActivities = ['Receive [Rework]', 'Waste'];
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
    
    // ✅ Auto-generate batch for Production activities with CORRECT DDMMYY format
    if (Activity === 'Production' && (!Batch || Batch.trim() === '')) {
      const date = new Date(dateValue);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const batchDateStr = `${day}${month}${year}`;
      finalBatch = `${productDoc.code}-${batchDateStr}`;
      console.log('🔧 Auto-generated batch with DDMMYY format:', finalBatch);
    }

    // ✅ Stock validation for Transfer and Issue [Rework] activities
    const stockCheckActivities = ['Transfer', 'Issue [Rework]'];
    if (stockCheckActivities.includes(Activity)) {
      if (!finalBatch) {
        return res.status(400).json({ message: 'Batch is required for ' + Activity + ' activities' });
      }

      try {
        const availableBatches = await ProductionManagement.getAvailableBatches(productName, Activity);
        const selectedBatch = availableBatches.find(b => b._id === finalBatch);
        
        if (!selectedBatch) {
          return res.status(400).json({ 
            message: `Batch "${finalBatch}" not found for product "${productName}"` 
          });
        }
        
        if (selectedBatch.totalStock < parseFloat(Quantity)) {
          return res.status(400).json({ 
            message: `Insufficient stock. Available: ${selectedBatch.totalStock}, Requested: ${Quantity}` 
          });
        }
      } catch (stockError) {
        console.error('❌ Stock validation error:', stockError);
        return res.status(400).json({ 
          message: 'Error validating stock availability' 
        });
      }
    }

    // ✅ Create record with PRODUCT NAME STORED DIRECTLY
    const newRecord = new ProductionManagement({
      Date: new Date(dateValue),
      Activity,
      Product: productName, // Store product name directly
      ProductCode: productDoc.code,
      Unit: finalUnit, // Unit is auto-populated from product in pre-save middleware
      Batch: finalBatch,
      Quantity: parseFloat(Quantity),
      ExpireDate: expireDateRequiredActivities.includes(Activity) ? new Date(ExpireDate) : undefined,
      Note: Note && Note.length > 100 ? Note.substring(0, 100) : Note,
      DocumentNumber: DocumentNumber
    });

    console.log('💾 Saving record with product name:', {
      Product: productName,
      ProductCode: productDoc.code,
      Unit: finalUnit,
      Batch: finalBatch,
      Quantity: parseFloat(Quantity),
      DocumentNumber: DocumentNumber
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

// ENHANCED PUT /api/production-managements/:id - Fixed update functionality
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
    const existingRecord = await ProductionManagement.findById(id);
    if (!existingRecord) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // ✅ Validate ExpireDate for Production, Transfer, and Receive [Rework] activities
    const expireDateRequiredActivities = ['Production', 'Transfer', 'Receive [Rework]'];
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
    const manualBatchActivities = ['Receive [Rework]', 'Waste'];
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

    // ✅ FIXED: Use existing product data for updates - don't re-validate product name
    const finalProductName = productName || existingRecord.Product;
    const productCode = existingRecord.ProductCode; // Keep existing product code
    const finalUnit = existingRecord.Unit; // Unit is immutable and preserved from original

    console.log('🔧 Update product handling:', {
      providedProduct: productName,
      finalProductName,
      existingProductCode: productCode,
      unit: finalUnit
    });

    // Update record - use findByIdAndUpdate to ensure pre-save middleware runs
    const updateData = {
      Date: new Date(dateValue),
      Activity,
      Product: finalProductName, // Store product name directly
      ProductCode: productCode, // Preserve existing product code
      Unit: finalUnit, // Unit is immutable
      Batch,
      Quantity: parseFloat(Quantity),
      ExpireDate: expireDateRequiredActivities.includes(Activity) ? new Date(ExpireDate) : undefined,
      Note: Note && Note.length > 100 ? Note.substring(0, 100) : Note,
      DocumentNumber
    };

    const updatedRecord = await ProductionManagement.findByIdAndUpdate(
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

// Enhanced DELETE /api/production-managements/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid record ID' });
    }

    console.log('🗑️ Deleting record:', id);

    const recordToDelete = await ProductionManagement.findById(id);
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

// GET /api/production-managements/stocks/summary - Stock summary endpoint
router.get('/stocks/summary', async (req, res) => {
  try {
    console.log('📊 Fetching stock summary');
    
    // Use the existing method to get available batches for all products
    const availableBatches = await ProductionManagement.getAvailableBatches();
    
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

// ENHANCED GET /api/production-managements/batches/available - Available batches with ACTIVITY FILTERING
router.get('/batches/available', async (req, res) => {
  try {
    const { productName, activity } = req.query;
    
    console.log('🔍 Fetching available batches for product:', { productName, activity });

    if (!productName) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    // Validate product exists and is active
    const productDoc = await findProductByName(productName);
    if (!productDoc) {
      return res.status(400).json({ message: 'Product not found or not active' });
    }

    // Use enhanced getAvailableBatches with activity filter
    const availableBatches = await ProductionManagement.getAvailableBatches(productName, activity);
    
    console.log(`✅ Found ${availableBatches.length} available batches with stock > 0 for activity: ${activity || 'all'}`);
    
    const simplifiedBatches = availableBatches.map(batch => ({
      _id: batch._id,
      totalStock: batch.totalStock,
      productCode: batch.productCode,
      expireDate: batch.expireDate,
      sourceActivity: batch.sourceActivity,
      // NEW: Include detailed breakdown for Receive [Rework]
      totalIssued: batch.totalIssued,
      totalReceived: batch.totalReceived
    }));
    
    res.json({ availableBatches: simplifiedBatches });
  } catch (error) {
    console.error('❌ Error fetching available batches:', error);
    res.status(500).json({ 
      message: 'Error fetching available batches',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/production-managements/stock/:batch - Batch stock
router.get('/stock/:batch', async (req, res) => {
  try {
    const { batch } = req.params;
    console.log('🔍 Fetching stock for batch:', batch);
    
    const stock = await ProductionManagement.getBatchStock(batch);
    
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

// GET /api/production-managements/products/active - Get active products
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
    message: 'Production Management API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

export default router;
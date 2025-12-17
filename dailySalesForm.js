import express from 'express';
import mongoose from 'mongoose';
import DailySalesForm from '../models/DailySalesForm.js';
import Product from '../models/Product.js';

const router = express.Router();

// Enhanced ProductCache with LRU behavior
class ProductCache {
  constructor(maxSize = 100, ttl = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, data) {
    // Remove oldest item if cache exceeds max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
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
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    
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

// Optimized product search with projection
const findProductByName = async (productName) => {
  if (!productName) return null;

  const cacheKey = `product_${productName.toLowerCase().trim()}`;
  const cachedProduct = productCache.get(cacheKey);
  if (cachedProduct) return cachedProduct;

  try {
    // Use lean() and specific projection for better performance
    const product = await Product.findOne({
      $or: [
        { Product: { $regex: new RegExp(`^${productName}$`, 'i') } },
        { Product: productName }
      ],
      Status: 'Active'
    })
    .select('_id Product ProductCode Status Unit')
    .lean()
    .maxTimeMS(5000); // Add query timeout

    if (product) {
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

// Cache for frequently accessed data
const summaryCache = new Map();
const SUMMARY_CACHE_TTL = 60000; // 1 minute

// Optimized GET /api/daily-sales with better query performance
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      activity,
      category,
      product,
      startDate,
      endDate,
      search,
      sortBy = 'Date',
      sortOrder = 'asc'
    } = req.query;

    // Create cache key for identical queries
    const cacheKey = JSON.stringify({ page, limit, activity, category, product, startDate, endDate, search, sortBy, sortOrder });
    const cached = summaryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL) {
      return res.json(cached.data);
    }

    const filter = {};
    
    // Use $eq for exact matches when possible (better index usage)
    if (activity) filter.Activity = activity;
    if (category) filter.Category = category;
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

    // Use parallel execution with optimized queries
    const [records, total] = await Promise.all([
      DailySalesForm.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip((options.page - 1) * options.limit)
        .lean()
        .maxTimeMS(10000),
      DailySalesForm.countDocuments(filter).maxTimeMS(10000)
    ]);

    const responseData = {
      records: records.map(record => ({
        _id: record._id,
        Date: record.Date,
        Activity: record.Activity,
        Category: record.Category,
        Product: record.Product,
        ProductCode: record.ProductCode,
        Unit: record.Unit,
        Batch: record.Batch,
        Quantity: record.Quantity,
        Price: record.Price,
        TotalAmount: record.TotalAmount,
        Stock: record.Stock,
        ExpireDate: record.ExpireDate,
        Note: record.Note,
        DocumentNumber: record.DocumentNumber,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      })),
      totalPages: Math.ceil(total / options.limit),
      currentPage: options.page,
      totalRecords: total,
      sortBy,
      sortOrder
    };

    // Cache the response
    summaryCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });

    // Clean up old cache entries periodically
    if (summaryCache.size > 50) {
      const now = Date.now();
      for (const [key, value] of summaryCache.entries()) {
        if (now - value.timestamp > SUMMARY_CACHE_TTL) {
          summaryCache.delete(key);
        }
      }
    }

    res.json(responseData);
  } catch (error) {
    console.error('❌ Error fetching records:', error);
    res.status(500).json({ 
      message: 'Error fetching records',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Batch operations for better performance
router.post('/batch', async (req, res) => {
  try {
    const { records } = req.body;
    
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'Records array is required' });
    }

    // Validate all records first
    const validationResults = await Promise.all(
      records.map(record => validateRecord(record))
    );

    const validRecords = [];
    const errors = [];

    validationResults.forEach((result, index) => {
      if (result.valid) {
        validRecords.push(result.record);
      } else {
        errors.push({ index, error: result.error });
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Some records failed validation',
        errors,
        validCount: validRecords.length,
        errorCount: errors.length
      });
    }

    // Insert all valid records in batch
    const savedRecords = await DailySalesForm.insertMany(validRecords, {
      ordered: false,
      lean: true
    });

    // Clear relevant caches
    productCache.clear();
    summaryCache.clear();

    res.status(201).json({
      message: `Successfully created ${savedRecords.length} records`,
      records: savedRecords
    });

  } catch (error) {
    console.error('❌ Error creating batch records:', error);
    res.status(500).json({ 
      message: 'Error creating batch records',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function for record validation
async function validateRecord(recordData) {
  try {
    const { Product: productName, Activity, Quantity, DocumentNumber } = recordData;

    if (!productName) {
      return { valid: false, error: 'Product name is required' };
    }

    // Validate product exists
    const productDoc = await findProductByName(productName);
    if (!productDoc) {
      return { valid: false, error: `Product "${productName}" not found` };
    }

    if (!DocumentNumber || DocumentNumber.trim() === '') {
      return { valid: false, error: 'Document number is required' };
    }

    if (!Quantity || Quantity <= 0) {
      return { valid: false, error: 'Valid quantity is required' };
    }

    // Create and validate record instance
    const record = new DailySalesForm({
      ...recordData,
      ProductCode: productDoc.code,
      Unit: recordData.Unit || productDoc.unit || 'PCS'
    });

    await record.validate();

    return { valid: true, record };

  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Keep your existing POST, PUT, DELETE endpoints but add similar optimizations
// (timeouts, lean queries, etc.)

// Optimize stock summary with caching
router.get('/stocks/summary', async (req, res) => {
  try {
    const cacheKey = 'stock_summary';
    const cached = summaryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL) {
      return res.json(cached.data);
    }

    const availableBatches = await DailySalesForm.aggregate([
      {
        $group: {
          _id: '$Batch',
          totalStock: { 
            $sum: { 
              $cond: [
                { $in: ['$Activity', ['Receive', 'Return from Customer']] }, 
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
    ])
    .maxTimeMS(15000)
    .exec();
    
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
    
    // Cache the result
    summaryCache.set(cacheKey, {
      data: summaryArray,
      timestamp: Date.now()
    });
    
    res.json(summaryArray);
  } catch (error) {
    console.error('❌ Error fetching stock summary:', error);
    res.status(500).json({ 
      message: 'Error fetching stock summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add compression middleware at the application level (recommended)
// app.use(compression());

export default router;
import mongoose from 'mongoose';

const dailySalesFormSchema = new mongoose.Schema({
  Date: { 
    type: Date, 
    required: true, 
    default: Date.now,
    index: true,
    validate: {
      validator: function(date) {
        return date <= new Date();
      },
      message: 'Future dates are not allowed for sales date'
    }
  },
  Activity: { 
    type: String, 
    enum: ['Sales', 'Return from Customer', 'Return to customer', 'Loss', 'Receive'], 
    required: true,
    index: true
  },
  Category: {
    type: String,
    enum: ['Receive', 'Retail', 'Agent', 'Tender', 'Project', 'Promotion', 'Other'],
    required: true,
    index: true
  },
  Product: { 
    type: String, 
    required: true,
    index: true
  },
  ProductCode: {
    type: String,
    required: true
  },
  Batch: { 
    type: String, 
    required: true,
    index: true
  },
  Unit: {
    type: String,
    required: true,
    default: 'PCS'
  },
  Quantity: { 
    type: Number, 
    required: true,
    min: [0.001, 'Quantity must be greater than 0'],
    validate: {
      validator: function(value) {
        return value > 0;
      },
      message: 'Quantity must be greater than 0'
    }
  },
  Price: {
    type: Number,
    required: function() {
      return this.Activity === 'Sales';
    },
    min: [0, 'Price cannot be negative']
  },
  TotalAmount: {
    type: Number,
    required: function() {
      return this.Activity === 'Sales';
    },
    min: [0, 'Total amount cannot be negative']
  },
  Stock: { 
    type: Number, 
    required: true,
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  ExpireDate: {
    type: Date,
    required: function() {
      const expireDateRequiredActivities = ['Receive'];
      return expireDateRequiredActivities.includes(this.Activity);
    },
    validate: {
      validator: function(date) {
        const expireDateRequiredActivities = ['Receive'];
        if (expireDateRequiredActivities.includes(this.Activity)) {
          return date && date >= this.Date;
        }
        return true;
      },
      message: 'ExpireDate must be on or after the transaction date for Receive activities'
    }
  },
  Note: { 
    type: String,
    maxlength: [100, 'Note cannot exceed 100 characters'],
    validate: {
      validator: function(note) {
        return note === undefined || note === null || note.length <= 100;
      },
      message: 'Note cannot exceed 100 characters'
    }
  },
  DocumentNumber: {
    type: String,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Enhanced cache for product data by name
class ProductCache {
  constructor(ttl = 300000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
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
    
    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
        if (now - item.timestamp > this.ttl) {
          this.cache.delete(key);
        }
      }
    }, 60000);
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

const productCache = new ProductCache();
productCache.startCleanup();

// ENHANCED: Batch Population System for Daily Sales
class BatchPopulationSystem {
  static async getBatchesForActivity(activity, productName, productCode) {
    try {
      console.log(`🔄 Fetching batches for ${activity} - Product: ${productName}`);
      
      switch(activity) {
        case 'Receive':
          return await this.getAllReceiveBatches(productName, productCode);
        case 'Sales':
          return await this.getAllSalesBatches(productName, productCode);
        case 'Return from Customer':
          return await this.getAllReturnFromCustomerBatches(productName, productCode);
        case 'Return to customer':
          return await this.getAllReturnToCustomerBatches(productName, productCode);
        case 'Loss':
          return await this.getAllLossBatches(productName, productCode);
        default:
          return [];
      }
    } catch (error) {
      console.error(`❌ Error in getBatchesForActivity for ${activity}:`, error);
      return [];
    }
  }

  // Get ALL batches for Receive activities
  static async getAllReceiveBatches(productName, productCode) {
    try {
      const Sales = mongoose.model('Sales');
      
      // Get ALL transfer batches from sales with PROPER expire date
      const allTransferBatches = await Sales.aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Transfer'
          }
        },
        {
          $lookup: {
            from: 'sales',
            let: { batch: '$Batch' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$Batch', '$$batch'] },
                      { $in: ['$Activity', ['Production', 'Receive']] }
                    ]
                  }
                }
              },
              {
                $sort: { Date: -1 }
              },
              {
                $limit: 1
              },
              {
                $project: {
                  ExpireDate: 1
                }
              }
            ],
            as: 'sourceData'
          }
        },
        {
          $addFields: {
            expireDate: { $arrayElemAt: ['$sourceData.ExpireDate', 0] }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalTransfer: { $sum: '$Quantity' },
            expireDate: { $first: '$expireDate' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allTransferBatches.length} transfer batches for ${productName}`);

      if (allTransferBatches.length === 0) {
        return [];
      }

      // Get total received quantities from daily-sales for these batches
      const receiveBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Receive',
            Batch: { $in: allTransferBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReceive: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const receiveMap = new Map();
      receiveBatches.forEach(batch => {
        receiveMap.set(batch._id, batch.totalReceive);
      });

      // Calculate ALL batches with their available quantities
      const allBatches = allTransferBatches.map(batch => {
        const totalReceive = receiveMap.get(batch._id) || 0;
        const availableQuantity = batch.totalTransfer - totalReceive;
        
        return {
          _id: batch._id,
          totalStock: availableQuantity,
          product: batch.product,
          productCode: batch.productCode,
          expireDate: batch.expireDate,
          unit: batch.unit,
          sourceActivity: 'Transfer',
          totalTransfer: batch.totalTransfer,
          totalReceive: totalReceive,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for Receive (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllReceiveBatches:', error);
      return [];
    }
  }

  // Get ALL batches for Sales activities
  static async getAllSalesBatches(productName, productCode) {
    try {
      // Get ALL receive batches from daily-sales with expire dates
      const allReceiveBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Receive'
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReceived: { $sum: '$Quantity' },
            expireDate: { $first: '$ExpireDate' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allReceiveBatches.length} receive batches for ${productName}`);

      if (allReceiveBatches.length === 0) {
        return [];
      }

      // Get total sales quantities for the same batches
      const salesBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Sales',
            Batch: { $in: allReceiveBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalSold: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const salesMap = new Map();
      salesBatches.forEach(batch => {
        salesMap.set(batch._id, batch.totalSold);
      });

      // Calculate ALL batches with their available quantities
      const allBatches = allReceiveBatches.map(batch => {
        const totalSold = salesMap.get(batch._id) || 0;
        const availableQuantity = batch.totalReceived - totalSold;
        
        return {
          ...batch,
          totalStock: availableQuantity,
          totalSold: totalSold,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for Sales (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllSalesBatches:', error);
      return [];
    }
  }

  // Get batches for Return from Customer
  static async getAllReturnFromCustomerBatches(productName, productCode) {
    try {
      // Get batches that were previously sold
      const allSalesBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Sales'
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalSold: { $sum: '$Quantity' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allSalesBatches.length} sales batches for ${productName}`);

      if (allSalesBatches.length === 0) {
        return [];
      }

      // Get total returned quantities
      const returnBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Return from Customer',
            Batch: { $in: allSalesBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReturned: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const returnMap = new Map();
      returnBatches.forEach(batch => {
        returnMap.set(batch._id, batch.totalReturned);
      });

      // Calculate batches
      const allBatches = allSalesBatches.map(batch => {
        const totalReturned = returnMap.get(batch._id) || 0;
        const availableQuantity = batch.totalSold - totalReturned;
        
        return {
          ...batch,
          totalStock: availableQuantity,
          totalReturned: totalReturned,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for Return from Customer (${allBatches.filter(b => b.isAvailable).length} available)`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllReturnFromCustomerBatches:', error);
      return [];
    }
  }

  // Get batches for Return to customer
  static async getAllReturnToCustomerBatches(productName, productCode) {
    try {
      // Get batches from receive
      const allReceiveBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Receive'
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReceived: { $sum: '$Quantity' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allReceiveBatches.length} receive batches for ${productName}`);

      if (allReceiveBatches.length === 0) {
        return [];
      }

      const allBatches = allReceiveBatches.map(batch => ({
        ...batch,
        totalStock: batch.totalReceived,
        isAvailable: batch.totalReceived > 0
      }));

      console.log(`✅ Returning ${allBatches.length} batches for Return to customer (${allBatches.filter(b => b.isAvailable).length} available)`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllReturnToCustomerBatches:', error);
      return [];
    }
  }

  // Get batches for Loss
  static async getAllLossBatches(productName, productCode) {
    try {
      // Get batches from receive
      const allReceiveBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Receive'
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReceived: { $sum: '$Quantity' },
            expireDate: { $first: '$ExpireDate' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allReceiveBatches.length} receive batches for ${productName}`);

      if (allReceiveBatches.length === 0) {
        return [];
      }

      // Get total loss quantities
      const lossBatches = await mongoose.model('DailySalesForm').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Loss',
            Batch: { $in: allReceiveBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalLoss: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const lossMap = new Map();
      lossBatches.forEach(batch => {
        lossMap.set(batch._id, batch.totalLoss);
      });

      // Calculate batches
      const allBatches = allReceiveBatches.map(batch => {
        const totalLoss = lossMap.get(batch._id) || 0;
        const availableQuantity = batch.totalReceived - totalLoss;
        
        return {
          ...batch,
          totalStock: availableQuantity,
          totalLoss: totalLoss,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for Loss (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllLossBatches:', error);
      return [];
    }
  }
}

// Enhanced pre-save middleware for Daily Sales
dailySalesFormSchema.pre('save', async function(next) {
  try {
    // Validate product exists and is active
    if (this.Product && this.ProductCode) {
      const cacheKey = `product_${this.Product.toLowerCase().trim()}`;
      let product = productCache.get(cacheKey);
      
      if (!product) {
        product = await mongoose.model('Products')
          .findOne({ 
            Product: this.Product,
            Status: 'Active'
          })
          .select('Product ProductCode Status Unit')
          .lean();
        
        if (product) {
          productCache.set(cacheKey, product);
        }
      }
      
      if (!product) {
        throw new Error('Referenced product not found or not active');
      }
      
      // AUTO-POPULATE UNIT FROM PRODUCT DATA
      if (product.Unit) {
        this.Unit = product.Unit;
      }
    } else {
      throw new Error('Product name and code are required');
    }

    // Calculate total amount for sales
    if (this.Activity === 'Sales' && this.Price && this.Quantity) {
      this.TotalAmount = this.Price * this.Quantity;
    }

    // For populated batch activities, validate that selected batch exists
    const populatedBatchActivities = [
      'Receive', 'Sales', 'Return from Customer', 'Return to customer', 'Loss'
    ];

    if (populatedBatchActivities.includes(this.Activity) && this.Batch) {
      const availableBatches = await BatchPopulationSystem.getBatchesForActivity(
        this.Activity, 
        this.Product, 
        this.ProductCode
      );
      
      const selectedBatch = availableBatches.find(b => b._id === this.Batch);
      if (!selectedBatch) {
        throw new Error(`Selected batch "${this.Batch}" is not available for ${this.Activity}`);
      }
      
      // Check stock availability only if the batch has stock
      if (selectedBatch.totalStock < this.Quantity && selectedBatch.totalStock > 0) {
        throw new Error(`Insufficient quantity in batch. Available: ${selectedBatch.totalStock}, Requested: ${this.Quantity}`);
      }

      // Auto-populate ExpireDate from batch data if available and required
      const expireDateRequiredActivities = ['Receive'];
      if (expireDateRequiredActivities.includes(this.Activity) && selectedBatch.expireDate && !this.ExpireDate) {
        console.log(`📅 Auto-populating expire date from batch: ${selectedBatch.expireDate}`);
        this.ExpireDate = selectedBatch.expireDate;
      }
    }

    // Truncate note
    if (this.Note && this.Note.length > 100) {
      this.Note = this.Note.substring(0, 100);
    }

    // Calculate stock
    await this.calculateStock();
    
    next();
  } catch (error) {
    next(error);
  }
});

// Enhanced getAvailableBatches with NEW batch population system
dailySalesFormSchema.statics.getAvailableBatches = async function(productName = null, activity = null) {
  try {
    if (!productName || !activity) {
      return [];
    }

    // Use the new batch population system
    return await BatchPopulationSystem.getBatchesForActivity(activity, productName, '');
  } catch (error) {
    console.error('Error in getAvailableBatches:', error);
    return [];
  }
};

// Optimized batch stock calculation
dailySalesFormSchema.statics.getBatchStock = async function(batch) {
  if (!batch) return 0;
  
  try {
    const result = await this.aggregate([
      { $match: { Batch: batch } },
      {
        $group: {
          _id: '$Batch',
          stock: { 
            $sum: { 
              $cond: [
                { $in: ['$Activity', ['Receive', 'Return from Customer']] }, 
                '$Quantity', 
                { $multiply: ['$Quantity', -1] }
              ]
            }
          }
        }
      }
    ]).exec();
    
    return result.length > 0 ? Math.max(0, result[0].stock) : 0;
  } catch (error) {
    console.error('Error in getBatchStock:', error);
    return 0;
  }
};

// Instance method to calculate stock
dailySalesFormSchema.methods.calculateStock = async function() {
  try {
    const currentStock = await this.constructor.getBatchStock(this.Batch);
    
    if (this.isNew) {
      // Positive stock activities (receiving)
      const positiveActivities = ['Receive', 'Return from Customer'];
      // Negative stock activities (issuing)  
      const negativeActivities = ['Sales', 'Return to customer', 'Loss'];
      
      if (positiveActivities.includes(this.Activity)) {
        this.Stock = currentStock + this.Quantity;
      } else if (negativeActivities.includes(this.Activity)) {
        if (currentStock < this.Quantity) {
          throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${this.Quantity}`);
        }
        this.Stock = currentStock - this.Quantity;
      }
    } else {
      // For updates, recalculate based on all transactions
      this.Stock = await this.constructor.getBatchStock(this.Batch);
    }
  } catch (error) {
    // If stock calculation fails, set a safe default
    const positiveActivities = ['Receive', 'Return from Customer'];
    if (positiveActivities.includes(this.Activity)) {
      this.Stock = this.Quantity;
    } else {
      this.Stock = 0;
    }
    throw error;
  }
};

// Enhanced post-save middleware
dailySalesFormSchema.post('save', async function() {
  try {
    // Update subsequent records for the same batch
    const subsequentRecords = await this.constructor.find({
      Batch: this.Batch,
      Date: { $gt: this.Date }
    }).select('_id Activity Quantity').sort({ Date: 1 }).lean();

    let runningStock = this.Stock;
    const bulkOps = [];
    
    for (const record of subsequentRecords) {
      const positiveActivities = ['Receive', 'Return from Customer'];
      const negativeActivities = ['Sales', 'Return to customer', 'Loss'];
      
      if (positiveActivities.includes(record.Activity)) {
        runningStock += record.Quantity;
      } else if (negativeActivities.includes(record.Activity)) {
        runningStock = Math.max(0, runningStock - record.Quantity);
      }
      
      bulkOps.push({
        updateOne: {
          filter: { _id: record._id },
          update: { $set: { Stock: runningStock } }
        }
      });
    }
    
    if (bulkOps.length > 0) {
      await this.constructor.bulkWrite(bulkOps);
    }

    // Clear relevant cache entries
    productCache.delete(`product_${this.Product.toLowerCase().trim()}`);
  } catch (error) {
    console.error('Error updating subsequent records:', error);
  }
});

// Enhanced compound indexes for optimized queries
dailySalesFormSchema.index({ Product: 1, Date: -1 });
dailySalesFormSchema.index({ Batch: 1, Date: -1 });
dailySalesFormSchema.index({ Activity: 1, Date: -1 });
dailySalesFormSchema.index({ Category: 1, Date: -1 });
dailySalesFormSchema.index({ Date: -1, Activity: 1 });
dailySalesFormSchema.index({ Activity: 1, DocumentNumber: 1, Date: 1 });

export default mongoose.model('DailySalesForm', dailySalesFormSchema);
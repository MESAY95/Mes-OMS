import mongoose from 'mongoose';

const productionManagementSchema = new mongoose.Schema({
  Date: { 
    type: Date, 
    required: true, 
    default: Date.now,
    index: true,
    validate: {
      validator: function(date) {
        return date <= new Date();
      },
      message: 'Future dates are not allowed for transaction date'
    }
  },
  Activity: { 
    type: String, 
    enum: ['Production', 'Transfer', 'Receive [Rework]', 'Issue [Rework]', 'Waste'], 
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
  Stock: { 
    type: Number, 
    required: true,
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  ExpireDate: {
    type: Date,
    required: function() {
      return this.Activity === 'Production' || this.Activity === 'Transfer' || this.Activity === 'Receive [Rework]';
    },
    validate: {
      validator: function(date) {
        if (this.Activity === 'Production' || this.Activity === 'Transfer' || this.Activity === 'Receive [Rework]') {
          return date && date >= this.Date;
        }
        return true;
      },
      message: 'ExpireDate must be on or after the transaction date for Production, Transfer and Receive [Rework] activities'
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

// Enhanced pre-save middleware with CORRECT batch generation and UNIT IMMUTABILITY
productionManagementSchema.pre('save', async function(next) {
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
      
      // AUTO-POPULATE UNIT FROM PRODUCT DATA - IMMUTABLE
      if (product.Unit) {
        this.Unit = product.Unit;
      }
    } else {
      throw new Error('Product name and code are required');
    }

    // Generate Batch for Production activities with CORRECT DDMMYY format
    // Manual batch entry allowed for: Receive [Rework], Waste
    const manualBatchActivities = ['Receive [Rework]', 'Waste'];
    const autoGenerateActivities = ['Production'];
    
    if (autoGenerateActivities.includes(this.Activity) && (!this.Batch || this.Batch.trim() === '')) {
      const date = new Date(this.Date);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const batchDateStr = `${day}${month}${year}`;
      this.Batch = `${this.ProductCode}-${batchDateStr}`;
    }
    
    // Validate batch for manual entry activities
    if (manualBatchActivities.includes(this.Activity) && (!this.Batch || this.Batch.trim() === '')) {
      throw new Error('Batch number is required for ' + this.Activity + ' activities');
    }

    // Validate manual batch format for manual entry activities
    if (manualBatchActivities.includes(this.Activity) && this.Batch) {
      if (!this.Batch.startsWith(`${this.ProductCode}-`)) {
        throw new Error(`Batch must start with "${this.ProductCode}-" for ${this.Activity} activities`);
      }
      
      if (this.Batch === `${this.ProductCode}-` || this.Batch.length <= this.ProductCode.length + 1) {
        throw new Error('Please enter a batch identifier after the product code prefix');
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

// ENHANCED: Updated aggregation with new logic for Receive [Rework] batches
productionManagementSchema.statics.getAvailableBatches = async function(productName = null, activity = null) {
  try {
    const matchStage = productName ? { 
      Product: productName
    } : {};
    
    // Special filtering for Issue [Rework] - only show batches from Receive [Rework]
    if (activity === 'Issue [Rework]') {
      matchStage.Activity = 'Receive [Rework]';
    }
    
    // NEW: Enhanced logic for Receive [Rework] - calculate available batches from ProductRI
    if (activity === 'Receive [Rework]') {
      // Get ProductRI model
      const ProductRI = mongoose.model('ProductRI');
      
      try {
        // Calculate available batches: IssueProd [Rework] - Receive [Rework] > 0
        const availableBatchesFromRI = await ProductRI.aggregate([
          { 
            $match: { 
              Product: productName,
              Activity: 'IssueProd [Rework]'
            } 
          },
          {
            $group: {
              _id: '$Batch',
              totalIssued: { $sum: '$Quantity' },
              product: { $first: '$Product' },
              productCode: { $first: '$ProductCode' },
              expireDate: { $max: '$ExpireDate' },
              unit: { $first: '$Unit' }
            }
          }
        ]).exec();

        console.log(`🔍 Found ${availableBatchesFromRI.length} issued batches from ProductRI for ${productName}`);

        // If no issued batches found, return empty array
        if (availableBatchesFromRI.length === 0) {
          return [];
        }

        // Get total received quantities from ProductionManagement for the same batches
        const receivedBatches = await this.aggregate([
          {
            $match: {
              Product: productName,
              Activity: 'Receive [Rework]',
              Batch: { $in: availableBatchesFromRI.map(b => b._id) }
            }
          },
          {
            $group: {
              _id: '$Batch',
              totalReceived: { $sum: '$Quantity' }
            }
          }
        ]).exec();

        // Create a map of received quantities for easy lookup
        const receivedMap = new Map();
        receivedBatches.forEach(batch => {
          receivedMap.set(batch._id, batch.totalReceived);
        });

        // Calculate available quantity: issued - received
        const availableBatches = availableBatchesFromRI.map(batch => {
          const totalReceived = receivedMap.get(batch._id) || 0;
          const availableQuantity = batch.totalIssued - totalReceived;
          
          return {
            _id: batch._id,
            totalStock: availableQuantity,
            product: batch.product,
            productCode: batch.productCode,
            expireDate: batch.expireDate,
            unit: batch.unit,
            sourceActivity: 'IssueProd [Rework]',
            totalIssued: batch.totalIssued,
            totalReceived: totalReceived
          };
        }).filter(batch => batch.totalStock > 0);

        console.log(`✅ After calculation: ${availableBatches.length} batches with available stock > 0`);
        return availableBatches;

      } catch (error) {
        console.error('❌ Error in Receive [Rework] batch calculation:', error);
        return [];
      }
    }
    
    // Existing logic for other activities
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$Batch',
          totalStock: { 
            $sum: { 
              $cond: [
                { $in: ['$Activity', ['Production', 'Receive [Rework]'] ]}, 
                '$Quantity', 
                { $multiply: ['$Quantity', -1] }
              ]
            }
          },
          product: { $first: '$Product' },
          productCode: { $first: '$ProductCode' },
          expireDate: { $max: '$ExpireDate' },
          sourceActivity: { $first: '$Activity' }
        }
      },
      { $match: { totalStock: { $gt: 0 } } },
      { $sort: { expireDate: 1 } }
    ];

    return await this.aggregate(pipeline).exec();
  } catch (error) {
    console.error('Error in getAvailableBatches:', error);
    throw error;
  }
};

// Optimized batch stock calculation
productionManagementSchema.statics.getBatchStock = async function(batch) {
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
                { $in: ['$Activity', ['Production', 'Receive [Rework]'] ] }, 
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
productionManagementSchema.methods.calculateStock = async function() {
  try {
    const currentStock = await this.constructor.getBatchStock(this.Batch);
    
    if (this.isNew) {
      // Positive stock activities
      const positiveActivities = ['Production', 'Receive [Rework]'];
      // Negative stock activities  
      const negativeActivities = ['Transfer', 'Issue [Rework]', 'Waste'];
      
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
    const positiveActivities = ['Production', 'Receive [Rework]'];
    if (positiveActivities.includes(this.Activity)) {
      this.Stock = this.Quantity;
    } else {
      this.Stock = 0;
    }
    throw error; // Re-throw to prevent saving invalid data
  }
};

// Enhanced post-save middleware
productionManagementSchema.post('save', async function() {
  try {
    // Update subsequent records for the same batch
    const subsequentRecords = await this.constructor.find({
      Batch: this.Batch,
      Date: { $gt: this.Date }
    }).select('_id Activity Quantity').sort({ Date: 1 }).lean();

    let runningStock = this.Stock;
    const bulkOps = [];
    
    for (const record of subsequentRecords) {
      const positiveActivities = ['Production', 'Receive [Rework]'];
      const negativeActivities = ['Transfer', 'Issue [Rework]', 'Waste'];
      
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

// Pre-remove middleware to handle stock recalculation
productionManagementSchema.pre('remove', async function(next) {
  try {
    // Store batch info for post-remove
    this._batchToUpdate = this.Batch;
    this._productToUpdate = this.Product;
    next();
  } catch (error) {
    next(error);
  }
});

productionManagementSchema.post('remove', async function() {
  try {
    // Recalculate stock for remaining records in the batch
    const remainingRecords = await this.constructor.find({
      Batch: this._batchToUpdate
    }).sort({ Date: 1 });

    let runningStock = 0;
    const bulkOps = [];
    
    for (const record of remainingRecords) {
      const positiveActivities = ['Production', 'Receive [Rework]'];
      const negativeActivities = ['Transfer', 'Issue [Rework]', 'Waste'];
      
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

    // Clear cache
    productCache.delete(`product_${this._productToUpdate.toLowerCase().trim()}`);
  } catch (error) {
    console.error('Error recalculating stock after deletion:', error);
  }
});

// Enhanced compound indexes for optimized queries
productionManagementSchema.index({ Product: 1, Date: -1 });
productionManagementSchema.index({ Batch: 1, Date: -1 });
productionManagementSchema.index({ Activity: 1, Date: -1 });
productionManagementSchema.index({ Date: -1, Activity: 1 });
productionManagementSchema.index({ Activity: 1, DocumentNumber: 1, Date: 1 });

export default mongoose.model('ProductionManagement', productionManagementSchema);
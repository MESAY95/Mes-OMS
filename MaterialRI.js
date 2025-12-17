import mongoose from 'mongoose';

const materialRISchema = new mongoose.Schema({
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
    enum: ['Receive', 'Issue'], 
    required: true,
    index: true
  },
  Material: { 
    type: String, 
    required: true,
    index: true
  },
  MaterialCode: {
    type: String,
    required: true
  },
  Batch: { 
    type: String, 
    required: true,
    index: true
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
      return this.Activity === 'Receive';
    },
    validate: {
      validator: function(date) {
        if (this.Activity === 'Receive') {
          // Allow future dates and same day, but not past dates relative to transaction date
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

// Enhanced cache for material data by name
class MaterialCache {
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

const materialCache = new MaterialCache();
materialCache.startCleanup();

// Enhanced pre-save middleware with CORRECT batch generation
materialRISchema.pre('save', async function(next) {
  try {
    // Validate material exists and is active
    if (this.Material && this.MaterialCode) {
      const cacheKey = `material_${this.Material.toLowerCase().trim()}`;
      let material = materialCache.get(cacheKey);
      
      if (!material) {
        material = await mongoose.model('Materials')
          .findOne({ 
            Material: this.Material,
            Status: 'Active'
          })
          .select('Material MaterialCode Status')
          .lean();
        
        if (material) {
          materialCache.set(cacheKey, material);
        }
      }
      
      if (!material) {
        throw new Error('Referenced material not found or not active');
      }
    } else {
      throw new Error('Material name and code are required');
    }

    // Generate Batch for Receive activities with CORRECT DDMMYY format
    if (this.Activity === 'Receive' && (!this.Batch || this.Batch.trim() === '')) {
      const date = new Date(this.Date);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const batchDateStr = `${day}${month}${year}`;
      this.Batch = `${this.MaterialCode}-${batchDateStr}`;
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

// Enhanced aggregation with better performance
materialRISchema.statics.getAvailableBatches = async function(materialName = null) {
  try {
    const matchStage = materialName ? { 
      Material: materialName
    } : {};
    
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$Batch',
          totalStock: { 
            $sum: { 
              $cond: [
                { $eq: ['$Activity', 'Receive'] }, 
                '$Quantity', 
                { $multiply: ['$Quantity', -1] }
              ]
            }
          },
          material: { $first: '$Material' },
          materialCode: { $first: '$MaterialCode' },
          expireDate: { $max: '$ExpireDate' }
        }
      },
      { $match: { totalStock: { $gt: 0 } } }, // Only batches with stock > 0
      { $sort: { expireDate: 1 } }
    ];

    return await this.aggregate(pipeline).exec();
  } catch (error) {
    console.error('Error in getAvailableBatches:', error);
    throw error;
  }
};

// Optimized batch stock calculation
materialRISchema.statics.getBatchStock = async function(batch) {
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
                { $eq: ['$Activity', 'Receive'] }, 
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
materialRISchema.methods.calculateStock = async function() {
  try {
    const currentStock = await this.constructor.getBatchStock(this.Batch);
    
    if (this.isNew) {
      if (this.Activity === 'Receive') {
        this.Stock = currentStock + this.Quantity;
      } else {
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
    if (this.Activity === 'Receive') {
      this.Stock = this.Quantity;
    } else {
      this.Stock = 0;
    }
    throw error; // Re-throw to prevent saving invalid data
  }
};

// Enhanced post-save middleware
materialRISchema.post('save', async function() {
  try {
    // Update subsequent records for the same batch
    const subsequentRecords = await this.constructor.find({
      Batch: this.Batch,
      Date: { $gt: this.Date }
    }).select('_id Activity Quantity').sort({ Date: 1 }).lean();

    let runningStock = this.Stock;
    const bulkOps = [];
    
    for (const record of subsequentRecords) {
      if (record.Activity === 'Receive') {
        runningStock += record.Quantity;
      } else {
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
    materialCache.delete(`material_${this.Material.toLowerCase().trim()}`);
  } catch (error) {
    console.error('Error updating subsequent records:', error);
  }
});

// Pre-remove middleware to handle stock recalculation
materialRISchema.pre('remove', async function(next) {
  try {
    // Store batch info for post-remove
    this._batchToUpdate = this.Batch;
    this._materialToUpdate = this.Material;
    next();
  } catch (error) {
    next(error);
  }
});

materialRISchema.post('remove', async function() {
  try {
    // Recalculate stock for remaining records in the batch
    const remainingRecords = await this.constructor.find({
      Batch: this._batchToUpdate
    }).sort({ Date: 1 });

    let runningStock = 0;
    const bulkOps = [];
    
    for (const record of remainingRecords) {
      if (record.Activity === 'Receive') {
        runningStock += record.Quantity;
      } else {
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
    materialCache.delete(`material_${this._materialToUpdate.toLowerCase().trim()}`);
  } catch (error) {
    console.error('Error recalculating stock after deletion:', error);
  }
});

// Enhanced compound indexes for optimized queries
materialRISchema.index({ Material: 1, Date: -1 });
materialRISchema.index({ Batch: 1, Date: -1 });
materialRISchema.index({ Activity: 1, Date: -1 });
materialRISchema.index({ Date: -1, Activity: 1 });
materialRISchema.index({ Activity: 1, DocumentNumber: 1, Date: 1 });

export default mongoose.model('MaterialRI', materialRISchema);
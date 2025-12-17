import mongoose from 'mongoose';

const productRISchema = new mongoose.Schema({
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
    enum: ['Receive', 'Issue', 'Return', 'ReceiveCustomer [Rework]', 'IssueCustomer [Rework]', 'IssueProd [Rework]', 'ReceiveProd [Rework]', 'Sample', 'Gift', 'Promotion', 'Waste'], 
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
      const expireDateRequiredActivities = ['Receive', 'ReceiveProd [Rework]', 'Waste', 'Issue', 'IssueCustomer [Rework]'];
      return expireDateRequiredActivities.includes(this.Activity);
    },
    validate: {
      validator: function(date) {
        const expireDateRequiredActivities = ['Receive', 'ReceiveProd [Rework]', 'Waste', 'Issue', 'IssueCustomer [Rework]'];
        if (expireDateRequiredActivities.includes(this.Activity)) {
          return date && date >= this.Date;
        }
        return true;
      },
      message: 'ExpireDate must be on or after the transaction date for Receive, ReceiveProd [Rework], Waste, Issue, and IssueCustomer [Rework] activities'
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

// ENHANCED: Batch Population System with PROPER expire date retrieval
class BatchPopulationSystem {
  static async getBatchesForActivity(activity, productName, productCode) {
    try {
      console.log(`🔄 Fetching batches for ${activity} - Product: ${productName}`);
      
      switch(activity) {
        case 'Receive':
          return await this.getAllReceiveBatches(productName, productCode);
        case 'ReceiveProd [Rework]':
          return await this.getAllReceiveProdReworkBatches(productName, productCode);
        case 'Waste':
          return await this.getAllWasteBatches(productName, productCode);
        case 'Issue':
        case 'Sample':
        case 'Gift':
        case 'Promotion':
          return await this.getAllIssueBatches(productName, productCode);
        case 'IssueProd [Rework]':
          return await this.getAllIssueProdReworkBatches(productName, productCode);
        case 'IssueCustomer [Rework]':
          return await this.getAllIssueCustomerReworkBatches(productName, productCode);
        default:
          return [];
      }
    } catch (error) {
      console.error(`❌ Error in getBatchesForActivity for ${activity}:`, error);
      return [];
    }
  }

  // ENHANCED: Get ALL batches for Receive activities with PROPER expire date
  static async getAllReceiveBatches(productName, productCode) {
    try {
      const ProductionManagement = mongoose.model('ProductionManagement');
      
      // Get ALL transfer batches from production-management with PROPER expire date
      const allTransferBatches = await ProductionManagement.aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Transfer'
          }
        },
        {
          $lookup: {
            from: 'productionmanagements',
            let: { batch: '$Batch' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$Batch', '$$batch'] },
                      { $in: ['$Activity', ['Production', 'Receive [Rework]']] }
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

      // Get total received quantities from product-r1 for these batches
      const receiveBatches = await mongoose.model('ProductRI').aggregate([
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

  // ENHANCED: Get ALL batches for ReceiveProd [Rework] activities with PROPER expire date
  static async getAllReceiveProdReworkBatches(productName, productCode) {
    try {
      const ProductionManagement = mongoose.model('ProductionManagement');
      
      // Get ALL Issue [Rework] batches from production-management with PROPER expire date
      const allIssueReworkBatches = await ProductionManagement.aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Issue [Rework]'
          }
        },
        {
          $lookup: {
            from: 'productionmanagements',
            let: { batch: '$Batch' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$Batch', '$$batch'] },
                      { $in: ['$Activity', ['Production', 'Receive [Rework]']] }
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
            totalIssueRework: { $sum: '$Quantity' },
            expireDate: { $first: '$expireDate' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allIssueReworkBatches.length} Issue [Rework] batches for ${productName}`);

      if (allIssueReworkBatches.length === 0) {
        return [];
      }

      // Get total ReceiveProd [Rework] quantities
      const receiveProdReworkBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'ReceiveProd [Rework]',
            Batch: { $in: allIssueReworkBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReceiveProdRework: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const receiveProdReworkMap = new Map();
      receiveProdReworkBatches.forEach(batch => {
        receiveProdReworkMap.set(batch._id, batch.totalReceiveProdRework);
      });

      // Calculate ALL batches
      const allBatches = allIssueReworkBatches.map(batch => {
        const totalReceiveProdRework = receiveProdReworkMap.get(batch._id) || 0;
        const availableQuantity = batch.totalIssueRework - totalReceiveProdRework;
        
        return {
          _id: batch._id,
          totalStock: availableQuantity,
          product: batch.product,
          productCode: batch.productCode,
          expireDate: batch.expireDate,
          unit: batch.unit,
          sourceActivity: 'Issue [Rework]',
          totalIssueRework: batch.totalIssueRework,
          totalReceiveProdRework: totalReceiveProdRework,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for ReceiveProd [Rework] (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllReceiveProdReworkBatches:', error);
      return [];
    }
  }

  // ENHANCED: Get ALL batches for Waste activities with PROPER expire date
  static async getAllWasteBatches(productName, productCode) {
    try {
      const ProductionManagement = mongoose.model('ProductionManagement');
      
      // Get ALL Waste batches from production-management with PROPER expire date
      const allProductionWasteBatches = await ProductionManagement.aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Waste'
          }
        },
        {
          $lookup: {
            from: 'productionmanagements',
            let: { batch: '$Batch' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$Batch', '$$batch'] },
                      { $in: ['$Activity', ['Production', 'Receive [Rework]']] }
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
            totalProductionWaste: { $sum: '$Quantity' },
            expireDate: { $first: '$expireDate' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allProductionWasteBatches.length} Waste batches from production for ${productName}`);

      if (allProductionWasteBatches.length === 0) {
        return [];
      }

      // Get total Waste quantities from product-r1
      const productRIWasteBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'Waste',
            Batch: { $in: allProductionWasteBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalProductRIWaste: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const productRIWasteMap = new Map();
      productRIWasteBatches.forEach(batch => {
        productRIWasteMap.set(batch._id, batch.totalProductRIWaste);
      });

      // Calculate ALL batches
      const allBatches = allProductionWasteBatches.map(batch => {
        const totalProductRIWaste = productRIWasteMap.get(batch._id) || 0;
        const availableQuantity = batch.totalProductionWaste - totalProductRIWaste;
        
        return {
          _id: batch._id,
          totalStock: availableQuantity,
          product: batch.product,
          productCode: batch.productCode,
          expireDate: batch.expireDate,
          unit: batch.unit,
          sourceActivity: 'Waste',
          totalProductionWaste: batch.totalProductionWaste,
          totalProductRIWaste: totalProductRIWaste,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for Waste (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllWasteBatches:', error);
      return [];
    }
  }

  // ENHANCED: Get ALL batches for Issue activities with expire date
  static async getAllIssueBatches(productName, productCode) {
    try {
      // Get ALL receive batches from product-r1 with expire dates
      const allReceiveBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: { $in: ['Receive', 'ReceiveProd [Rework]'] }
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
            sourceActivity: { $first: '$Activity' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allReceiveBatches.length} receive batches for ${productName}`);

      if (allReceiveBatches.length === 0) {
        return [];
      }

      // Get total issued quantities for the same batches
      const issuedBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: { $in: ['Issue', 'Sample', 'Gift', 'Promotion'] },
            Batch: { $in: allReceiveBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalIssued: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const issuedMap = new Map();
      issuedBatches.forEach(batch => {
        issuedMap.set(batch._id, batch.totalIssued);
      });

      // Calculate ALL batches with their available quantities
      const allBatches = allReceiveBatches.map(batch => {
        const totalIssued = issuedMap.get(batch._id) || 0;
        const availableQuantity = batch.totalReceived - totalIssued;
        
        return {
          ...batch,
          totalStock: availableQuantity,
          totalIssued: totalIssued,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for Issue (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllIssueBatches:', error);
      return [];
    }
  }

  // ENHANCED: Get ALL batches for IssueProd [Rework] activities with expire date
  static async getAllIssueProdReworkBatches(productName, productCode) {
    try {
      // Get ALL ReceiveCustomer [Rework] batches with expire dates
      const allReceiveCustomerReworkBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'ReceiveCustomer [Rework]'
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReceivedCustomerRework: { $sum: '$Quantity' },
            expireDate: { $first: '$ExpireDate' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allReceiveCustomerReworkBatches.length} ReceiveCustomer [Rework] batches for ${productName}`);

      if (allReceiveCustomerReworkBatches.length === 0) {
        return [];
      }

      // Get total IssueProd [Rework] quantities
      const issueProdReworkBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'IssueProd [Rework]',
            Batch: { $in: allReceiveCustomerReworkBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalIssueProdRework: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const issueProdReworkMap = new Map();
      issueProdReworkBatches.forEach(batch => {
        issueProdReworkMap.set(batch._id, batch.totalIssueProdRework);
      });

      // Calculate ALL batches
      const allBatches = allReceiveCustomerReworkBatches.map(batch => {
        const totalIssueProdRework = issueProdReworkMap.get(batch._id) || 0;
        const availableQuantity = batch.totalReceivedCustomerRework - totalIssueProdRework;
        
        return {
          ...batch,
          totalStock: availableQuantity,
          totalIssueProdRework: totalIssueProdRework,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for IssueProd [Rework] (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllIssueProdReworkBatches:', error);
      return [];
    }
  }

  // ENHANCED: Get ALL batches for IssueCustomer [Rework] activities with expire date
  static async getAllIssueCustomerReworkBatches(productName, productCode) {
    try {
      // Get ALL ReceiveCustomer [Rework] batches with expire dates
      const allReceiveCustomerReworkBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'ReceiveCustomer [Rework]'
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalReceivedCustomerRework: { $sum: '$Quantity' },
            expireDate: { $first: '$ExpireDate' },
            product: { $first: '$Product' },
            productCode: { $first: '$ProductCode' },
            unit: { $first: '$Unit' },
            lastTransactionDate: { $max: '$Date' }
          }
        },
        { $sort: { lastTransactionDate: -1 } }
      ]).exec();

      console.log(`📦 Found ${allReceiveCustomerReworkBatches.length} ReceiveCustomer [Rework] batches for ${productName}`);

      if (allReceiveCustomerReworkBatches.length === 0) {
        return [];
      }

      // Get total IssueCustomer [Rework] quantities
      const issueCustomerReworkBatches = await mongoose.model('ProductRI').aggregate([
        {
          $match: {
            Product: productName,
            Activity: 'IssueCustomer [Rework]',
            Batch: { $in: allReceiveCustomerReworkBatches.map(b => b._id) }
          }
        },
        {
          $group: {
            _id: '$Batch',
            totalIssueCustomerRework: { $sum: '$Quantity' }
          }
        }
      ]).exec();

      const issueCustomerReworkMap = new Map();
      issueCustomerReworkBatches.forEach(batch => {
        issueCustomerReworkMap.set(batch._id, batch.totalIssueCustomerRework);
      });

      // Calculate ALL batches
      const allBatches = allReceiveCustomerReworkBatches.map(batch => {
        const totalIssueCustomerRework = issueCustomerReworkMap.get(batch._id) || 0;
        const availableQuantity = batch.totalReceivedCustomerRework - totalIssueCustomerRework;
        
        return {
          ...batch,
          totalStock: availableQuantity,
          totalIssueCustomerRework: totalIssueCustomerRework,
          isAvailable: availableQuantity > 0
        };
      });

      console.log(`✅ Returning ${allBatches.length} batches for IssueCustomer [Rework] (${allBatches.filter(b => b.isAvailable).length} available)`);
      console.log(`📅 Expire dates found: ${allBatches.filter(b => b.expireDate).length}`);
      return allBatches;
    } catch (error) {
      console.error('Error in getAllIssueCustomerReworkBatches:', error);
      return [];
    }
  }
}

// Enhanced pre-save middleware with PROPER expire date handling
productRISchema.pre('save', async function(next) {
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

    // NEW: Manual batch entry activities ONLY for Return and ReceiveCustomer [Rework]
    const manualBatchActivities = ['Return', 'ReceiveCustomer [Rework]'];
    
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

    // For populated batch activities, validate that selected batch exists
    const populatedBatchActivities = [
      'Receive', 'ReceiveProd [Rework]', 'Waste', 
      'Issue', 'IssueProd [Rework]', 'IssueCustomer [Rework]',
      'Sample', 'Gift', 'Promotion'
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

      // ENHANCED: Auto-populate ExpireDate from batch data if available and required
      const expireDateRequiredActivities = ['Receive', 'ReceiveProd [Rework]', 'Waste', 'Issue', 'IssueCustomer [Rework]'];
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
productRISchema.statics.getAvailableBatches = async function(productName = null, activity = null) {
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

// Optimized batch stock calculation with new activity types
productRISchema.statics.getBatchStock = async function(batch) {
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
                { $in: ['$Activity', ['Receive', 'ReceiveCustomer [Rework]', 'ReceiveProd [Rework]'] ] }, 
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

// Instance method to calculate stock with new activity types
productRISchema.methods.calculateStock = async function() {
  try {
    const currentStock = await this.constructor.getBatchStock(this.Batch);
    
    if (this.isNew) {
      // Positive stock activities (receiving)
      const positiveActivities = ['Receive', 'ReceiveCustomer [Rework]', 'ReceiveProd [Rework]'];
      // Negative stock activities (issuing)  
      const negativeActivities = ['Issue', 'IssueCustomer [Rework]', 'IssueProd [Rework]', 'Sample', 'Gift', 'Promotion', 'Waste', 'Return'];
      
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
    const positiveActivities = ['Receive', 'ReceiveCustomer [Rework]', 'ReceiveProd [Rework]'];
    if (positiveActivities.includes(this.Activity)) {
      this.Stock = this.Quantity;
    } else {
      this.Stock = 0;
    }
    throw error;
  }
};

// Enhanced post-save middleware with new activity types
productRISchema.post('save', async function() {
  try {
    // Update subsequent records for the same batch
    const subsequentRecords = await this.constructor.find({
      Batch: this.Batch,
      Date: { $gt: this.Date }
    }).select('_id Activity Quantity').sort({ Date: 1 }).lean();

    let runningStock = this.Stock;
    const bulkOps = [];
    
    for (const record of subsequentRecords) {
      const positiveActivities = ['Receive', 'ReceiveCustomer [Rework]', 'ReceiveProd [Rework]'];
      const negativeActivities = ['Issue', 'IssueCustomer [Rework]', 'IssueProd [Rework]', 'Sample', 'Gift', 'Promotion', 'Waste', 'Return'];
      
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
productRISchema.pre('remove', async function(next) {
  try {
    // Store batch info for post-remove
    this._batchToUpdate = this.Batch;
    this._productToUpdate = this.Product;
    next();
  } catch (error) {
    next(error);
  }
});

productRISchema.post('remove', async function() {
  try {
    // Recalculate stock for remaining records in the batch
    const remainingRecords = await this.constructor.find({
      Batch: this._batchToUpdate
    }).sort({ Date: 1 });

    let runningStock = 0;
    const bulkOps = [];
    
    for (const record of remainingRecords) {
      const positiveActivities = ['Receive', 'ReceiveCustomer [Rework]', 'ReceiveProd [Rework]'];
      const negativeActivities = ['Issue', 'IssueCustomer [Rework]', 'IssueProd [Rework]', 'Sample', 'Gift', 'Promotion', 'Waste', 'Return'];
      
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
productRISchema.index({ Product: 1, Date: -1 });
productRISchema.index({ Batch: 1, Date: -1 });
productRISchema.index({ Activity: 1, Date: -1 });
productRISchema.index({ Date: -1, Activity: 1 });
productRISchema.index({ Activity: 1, DocumentNumber: 1, Date: 1 });

export default mongoose.model('ProductRI', productRISchema);
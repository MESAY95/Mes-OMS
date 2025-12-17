import express from 'express';
import mongoose from 'mongoose';
import MaterialRI from '../models/MaterialRI.js';
import Material2 from '../models/Material2.js';

const router = express.Router();

// Enhanced MaterialCache class for material name lookup
class MaterialCache {
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

const materialCache = new MaterialCache();

// Enhanced utility function to find material by name
const findMaterialByName = async (materialName) => {
  if (!materialName) return null;

  // Check cache first
  const cacheKey = `material_${materialName.toLowerCase().trim()}`;
  const cachedMaterial = materialCache.get(cacheKey);
  if (cachedMaterial) return cachedMaterial;

  try {
    console.log('🔍 Searching for material:', materialName);
    
    // Query database for active material - case insensitive search
    const material = await Material2.findOne({
      $or: [
        { Material: { $regex: new RegExp(`^${materialName}$`, 'i') } },
        { Material: materialName }
      ],
      Status: 'Active'
    }).select('_id Material MaterialCode Status Unit').lean();

    if (material) {
      // Transform material data for consistency
      const transformedMaterial = {
        _id: material._id,
        name: material.Material,
        code: material.MaterialCode,
        status: material.Status,
        unit: material.Unit || 'pcs'
      };
      
      materialCache.set(cacheKey, transformedMaterial);
      return transformedMaterial;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error finding material:', error);
    return null;
  }
};

// Enhanced response transformer - NOW STORES MATERIAL NAME DIRECTLY
const transformRecord = (record) => ({
  _id: record._id,
  Date: record.Date,
  Activity: record.Activity,
  Material: record.Material, // Store material name directly
  MaterialCode: record.MaterialCode,
  Batch: record.Batch,
  Quantity: record.Quantity,
  Stock: record.Stock,
  ExpireDate: record.ExpireDate,
  Note: record.Note,
  DocumentNumber: record.DocumentNumber,
  Unit: record.Unit,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

// Enhanced GET /api/material-ri - Get all records with pagination and sorting
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      activity,
      material,
      startDate,
      endDate,
      search,
      sortBy = 'Date',
      sortOrder = 'desc'
    } = req.query;

    console.log('📥 Fetching records with filters:', req.query);

    const filter = {};
    
    if (activity) filter.Activity = activity;
    if (material) filter.Material = material; // Now filtering by material name directly
    
    if (startDate || endDate) {
      filter.Date = {};
      if (startDate) filter.Date.$gte = new Date(startDate);
      if (endDate) filter.Date.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { Batch: new RegExp(search, 'i') },
        { MaterialCode: new RegExp(search, 'i') },
        { DocumentNumber: new RegExp(search, 'i') },
        { Note: new RegExp(search, 'i') },
        { Material: new RegExp(search, 'i') } // Also search by material name
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const [records, total] = await Promise.all([
      MaterialRI.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip((options.page - 1) * options.limit)
        .lean(),
      MaterialRI.countDocuments(filter)
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

// ENHANCED POST /api/material-ri - Now stores material name directly
router.post('/', async (req, res) => {
  try {
    const {
      Date: dateValue,
      Activity,
      Material: materialName,
      Batch,
      Quantity,
      ExpireDate,
      Note,
      DocumentNumber,
      Unit
    } = req.body;

    console.log('📥 Received data for new record:', {
      materialName,
      Activity,
      Quantity,
      Batch,
      DocumentNumber,
      dateValue
    });

    // ✅ Validate required fields
    if (!materialName) {
      return res.status(400).json({ message: 'Material name is required' });
    }

    if (!Activity || !['Receive', 'Issue'].includes(Activity)) {
      return res.status(400).json({ message: 'Valid activity (Receive/Issue) is required' });
    }

    if (!Quantity || Quantity <= 0) {
      return res.status(400).json({ message: 'Valid quantity is required' });
    }

    if (!DocumentNumber || DocumentNumber.trim() === '') {
      return res.status(400).json({ message: 'Document number is required' });
    }

    // ✅ Validate ExpireDate for Receive activities - must be on or after transaction date
    if (Activity === 'Receive') {
      if (!ExpireDate) {
        return res.status(400).json({ message: 'Expire Date is required for Receive activities' });
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

    // ✅ Find material by name in database to validate and get material code
    const materialDoc = await findMaterialByName(materialName);
    if (!materialDoc) {
      return res.status(400).json({ 
        message: `Active material "${materialName}" not found. Please select a valid active material.` 
      });
    }

    console.log('✅ Material found:', materialDoc);

    let finalBatch = Batch;
    let finalUnit = Unit || materialDoc.unit || 'pcs';
    
    // ✅ Auto-generate batch for Receive activities with CORRECT DDMMYY format
    if (Activity === 'Receive' && (!Batch || Batch.trim() === '')) {
      const date = new Date(dateValue);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const batchDateStr = `${day}${month}${year}`;
      finalBatch = `${materialDoc.code}-${batchDateStr}`;
      console.log('🔧 Auto-generated batch with DDMMYY format:', finalBatch);
    }

    // ✅ Stock validation for Issue activities
    if (Activity === 'Issue') {
      if (!finalBatch) {
        return res.status(400).json({ message: 'Batch is required for Issue activities' });
      }

      try {
        const availableBatches = await MaterialRI.getAvailableBatches(materialName);
        const selectedBatch = availableBatches.find(b => b._id === finalBatch);
        
        if (!selectedBatch) {
          return res.status(400).json({ 
            message: `Batch "${finalBatch}" not found for material "${materialName}"` 
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

    // ✅ Create record with MATERIAL NAME STORED DIRECTLY
    const newRecord = new MaterialRI({
      Date: new Date(dateValue),
      Activity,
      Material: materialName, // Store material name directly
      MaterialCode: materialDoc.code,
      Batch: finalBatch,
      Quantity: parseFloat(Quantity),
      ExpireDate: Activity === 'Receive' ? new Date(ExpireDate) : undefined,
      Note: Note && Note.length > 100 ? Note.substring(0, 100) : Note,
      DocumentNumber: DocumentNumber,
      Unit: finalUnit
    });

    console.log('💾 Saving record with material name:', {
      Material: materialName,
      MaterialCode: materialDoc.code,
      Batch: finalBatch,
      Quantity: parseFloat(Quantity),
      DocumentNumber: DocumentNumber,
      Unit: finalUnit
    });

    // ✅ Save the record
    const savedRecord = await newRecord.save();
    
    console.log('✅ Record saved successfully:', savedRecord._id);
    
    // ✅ Clear cache
    materialCache.remove(`material_${materialName.toLowerCase().trim()}`);
    
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

// ENHANCED PUT /api/material-ri/:id - Fixed update functionality
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
      Material: materialName,
      Batch,
      Quantity,
      ExpireDate,
      Note,
      DocumentNumber,
      Unit
    } = req.body;

    console.log('📥 Updating record:', { id, materialName, Activity, DocumentNumber });

    // Check if record exists
    const existingRecord = await MaterialRI.findById(id);
    if (!existingRecord) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // ✅ Validate ExpireDate for Receive activities - must be on or after transaction date
    if (Activity === 'Receive') {
      if (!ExpireDate) {
        return res.status(400).json({ message: 'Expire Date is required for Receive activities' });
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

    // ✅ FIXED: Use existing material data for updates - don't re-validate material name
    // For updates, we trust the existing material data in the record
    const finalMaterialName = materialName || existingRecord.Material;
    const materialCode = existingRecord.MaterialCode; // Keep existing material code
    const finalUnit = Unit || existingRecord.Unit;

    console.log('🔧 Update material handling:', {
      providedMaterial: materialName,
      finalMaterialName,
      existingMaterialCode: materialCode,
      unit: finalUnit
    });

    // Update record - use findByIdAndUpdate to ensure pre-save middleware runs
    const updateData = {
      Date: new Date(dateValue),
      Activity,
      Material: finalMaterialName, // Store material name directly
      MaterialCode: materialCode, // Preserve existing material code
      Batch,
      Quantity: parseFloat(Quantity),
      ExpireDate: Activity === 'Receive' ? new Date(ExpireDate) : undefined,
      Note: Note && Note.length > 100 ? Note.substring(0, 100) : Note,
      DocumentNumber,
      Unit: finalUnit
    };

    const updatedRecord = await MaterialRI.findByIdAndUpdate(
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

// Enhanced DELETE /api/material-ri/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid record ID' });
    }

    console.log('🗑️ Deleting record:', id);

    const recordToDelete = await MaterialRI.findById(id);
    if (!recordToDelete) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const materialName = recordToDelete.Material;

    await recordToDelete.deleteOne();

    console.log('✅ Record deleted successfully:', id);
    
    // Clear cache
    materialCache.remove(`material_${materialName.toLowerCase().trim()}`);

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

// GET /api/material-ri/stocks/summary - Stock summary endpoint
router.get('/stocks/summary', async (req, res) => {
  try {
    console.log('📊 Fetching stock summary');
    
    // Use the existing method to get available batches for all materials
    const availableBatches = await MaterialRI.getAvailableBatches();
    
    // Group by material and calculate total stock
    const stockSummary = availableBatches.reduce((acc, batch) => {
      const materialName = batch.material;
      
      if (!acc[materialName]) {
        acc[materialName] = {
          materialName: materialName,
          materialCode: batch.materialCode || 'N/A',
          totalStock: 0,
          batches: []
        };
      }
      
      acc[materialName].totalStock += batch.totalStock;
      acc[materialName].batches.push({
        batch: batch._id,
        stock: batch.totalStock,
        expireDate: batch.expireDate
      });
      
      return acc;
    }, {});

    const summaryArray = Object.values(stockSummary);
    
    console.log(`✅ Stock summary: ${summaryArray.length} materials with stock`);
    res.json(summaryArray);
  } catch (error) {
    console.error('❌ Error fetching stock summary:', error);
    res.status(500).json({ 
      message: 'Error fetching stock summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/material-ri/batches/available - Available batches
router.get('/batches/available', async (req, res) => {
  try {
    const { materialName } = req.query;
    
    console.log('🔍 Fetching available batches for material:', materialName);

    if (!materialName) {
      return res.status(400).json({ message: 'Material name is required' });
    }

    // Validate material exists and is active
    const materialDoc = await findMaterialByName(materialName);
    if (!materialDoc) {
      return res.status(400).json({ message: 'Material not found or not active' });
    }

    const availableBatches = await MaterialRI.getAvailableBatches(materialName);
    
    console.log(`✅ Found ${availableBatches.length} available batches with stock > 0`);
    
    const simplifiedBatches = availableBatches.map(batch => ({
      _id: batch._id,
      totalStock: batch.totalStock,
      materialCode: batch.materialCode,
      expireDate: batch.expireDate
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

// GET /api/material-ri/stock/:batch - Batch stock
router.get('/stock/:batch', async (req, res) => {
  try {
    const { batch } = req.params;
    console.log('🔍 Fetching stock for batch:', batch);
    
    const stock = await MaterialRI.getBatchStock(batch);
    
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

// GET /api/material-ri/materials/active - Get active materials
router.get('/materials/active', async (req, res) => {
  try {
    console.log('📦 Fetching active materials');
    
    const activeMaterials = await Material2.find({ Status: 'Active' })
      .select('_id Material MaterialCode Status Unit')
      .lean();

    const transformedMaterials = activeMaterials.map(material => ({
      _id: material._id,
      name: material.Material,
      code: material.MaterialCode,
      unit: material.Unit || 'pcs',
      status: material.Status
    }));

    console.log(`✅ Found ${transformedMaterials.length} active materials`);
    res.json(transformedMaterials);
  } catch (error) {
    console.error('❌ Error fetching active materials:', error);
    res.status(500).json({ 
      message: 'Error fetching active materials',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// NEW: Get material transaction statistics
router.get('/statistics', async (req, res) => {
  try {
    const { startDate, endDate, material } = req.query;
    
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.Date = {};
      if (startDate) matchStage.Date.$gte = new Date(startDate);
      if (endDate) matchStage.Date.$lte = new Date(endDate);
    }
    if (material) matchStage.Material = material;

    const statistics = await MaterialRI.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$Activity',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$Quantity' },
          avgQuantity: { $avg: '$Quantity' },
          minQuantity: { $min: '$Quantity' },
          maxQuantity: { $max: '$Quantity' }
        }
      }
    ]);

    const dailyActivity = await MaterialRI.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$Date' } },
            activity: '$Activity'
          },
          count: { $sum: 1 },
          totalQuantity: { $sum: '$Quantity' }
        }
      },
      { $sort: { '_id.date': -1 } },
      { $limit: 30 }
    ]);

    // Get top materials by transaction volume
    const topMaterials = await MaterialRI.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$Material',
          materialCode: { $first: '$MaterialCode' },
          transactionCount: { $sum: 1 },
          totalQuantity: { $sum: '$Quantity' },
          receiveCount: {
            $sum: { $cond: [{ $eq: ['$Activity', 'Receive'] }, 1, 0] }
          },
          issueCount: {
            $sum: { $cond: [{ $eq: ['$Activity', 'Issue'] }, 1, 0] }
          }
        }
      },
      { $sort: { transactionCount: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      statistics,
      dailyActivity,
      topMaterials,
      period: {
        startDate: startDate || 'Beginning',
        endDate: endDate || 'Now'
      }
    });
  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({ 
      message: 'Error fetching statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// NEW: Batch expiration alerts
router.get('/alerts/expiration', async (req, res) => {
  try {
    const { daysThreshold = 30 } = req.query;
    
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + parseInt(daysThreshold));

    const expiringBatches = await MaterialRI.aggregate([
      {
        $match: {
          ExpireDate: { $lte: thresholdDate },
          Activity: 'Receive'
        }
      },
      {
        $group: {
          _id: '$Batch',
          material: { $first: '$Material' },
          materialCode: { $first: '$MaterialCode' },
          expireDate: { $first: '$ExpireDate' },
          totalReceived: { $sum: '$Quantity' },
          lastTransaction: { $max: '$Date' }
        }
      },
      {
        $lookup: {
          from: 'material-ris',
          let: { batch: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$Batch', '$$batch'] },
                Activity: 'Issue'
              }
            },
            {
              $group: {
                _id: '$Batch',
                totalIssued: { $sum: '$Quantity' }
              }
            }
          ],
          as: 'issueData'
        }
      },
      {
        $addFields: {
          totalIssued: { $arrayElemAt: ['$issueData.totalIssued', 0] }
        }
      },
      {
        $addFields: {
          currentStock: {
            $subtract: [
              '$totalReceived',
              { $ifNull: ['$totalIssued', 0] }
            ]
          }
        }
      },
      {
        $match: {
          currentStock: { $gt: 0 }
        }
      },
      {
        $project: {
          batch: '$_id',
          material: 1,
          materialCode: 1,
          expireDate: 1,
          currentStock: 1,
          daysUntilExpiry: {
            $divide: [
              { $subtract: ['$expireDate', new Date()] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      },
      {
        $addFields: {
          daysUntilExpiry: { $ceil: '$daysUntilExpiry' },
          alertLevel: {
            $cond: [
              { $lte: ['$expireDate', new Date()] },
              'Expired',
              {
                $cond: [
                  { $lte: ['$daysUntilExpiry', 7] },
                  'Critical',
                  'Warning'
                ]
              }
            ]
          }
        }
      },
      { $sort: { expireDate: 1 } }
    ]);

    res.json({
      alerts: expiringBatches,
      total: expiringBatches.length,
      expired: expiringBatches.filter(a => a.alertLevel === 'Expired').length,
      critical: expiringBatches.filter(a => a.alertLevel === 'Critical').length,
      warning: expiringBatches.filter(a => a.alertLevel === 'Warning').length,
      threshold: parseInt(daysThreshold)
    });
  } catch (error) {
    console.error('❌ Error fetching expiration alerts:', error);
    res.status(500).json({ 
      message: 'Error fetching expiration alerts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// NEW: Get material stock summary with valuation
router.get('/stock-valuation', async (req, res) => {
  try {
    const stockSummary = await MaterialRI.aggregate([
      {
        $group: {
          _id: '$Material',
          materialCode: { $first: '$MaterialCode' },
          unit: { $first: '$Unit' },
          totalReceived: {
            $sum: {
              $cond: [{ $eq: ['$Activity', 'Receive'] }, '$Quantity', 0]
            }
          },
          totalIssued: {
            $sum: {
              $cond: [{ $eq: ['$Activity', 'Issue'] }, '$Quantity', 0]
            }
          }
        }
      },
      {
        $addFields: {
          currentStock: { $subtract: ['$totalReceived', '$totalIssued'] }
        }
      },
      {
        $match: {
          currentStock: { $gt: 0 }
        }
      },
      {
        $lookup: {
          from: 'materials',
          localField: '_id',
          foreignField: 'Material',
          as: 'materialData'
        }
      },
      {
        $unwind: '$materialData'
      },
      {
        $project: {
          material: '$_id',
          materialCode: 1,
          unit: 1,
          currentStock: 1,
          unitPrice: '$materialData.UnitPrice',
          totalValue: {
            $multiply: ['$currentStock', '$materialData.UnitPrice']
          },
          status: {
            $cond: [
              { $lte: ['$currentStock', 0] },
              'Out of Stock',
              {
                $cond: [
                  { $lte: ['$currentStock', '$materialData.MinimumConsumption'] },
                  'Low Stock',
                  'Normal'
                ]
              }
            ]
          }
        }
      },
      { $sort: { totalValue: -1 } }
    ]);

    const totalValuation = stockSummary.reduce((sum, item) => sum + (item.totalValue || 0), 0);

    res.json({
      stockSummary,
      totalValuation: Math.round(totalValuation * 100) / 100,
      totalItems: stockSummary.length,
      lowStockItems: stockSummary.filter(item => item.status === 'Low Stock').length,
      outOfStockItems: stockSummary.filter(item => item.status === 'Out of Stock').length
    });
  } catch (error) {
    console.error('❌ Error fetching stock valuation:', error);
    res.status(500).json({ 
      message: 'Error fetching stock valuation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Material RI API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

export default router;
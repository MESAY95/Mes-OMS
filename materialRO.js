import express from 'express';
import MaterialROS from '../models/MaterialROS.js';
import Material from '../models/Material2.js';
import InventoryMS from '../models/InventoryMS.js';

const router = express.Router();

// Get all material reorder status with proper population
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status,
      search 
    } = req.query;

    const filter = {};
    
    if (status && status !== 'All') {
      filter.Status = status;
    }

    if (search) {
      // We'll populate material and then filter
      const materials = await Material.find({
        $or: [
          { Material: { $regex: search, $options: 'i' } },
          { MaterialCode: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const materialIds = materials.map(m => m._id);
      filter.Material = { $in: materialIds };
    }

    const reorderStatus = await MaterialROS.find(filter)
      .populate('Material')
      .sort({ Status: 1, AvailableStock: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await MaterialROS.countDocuments(filter);

    res.json({
      reorderStatus,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching material reorder status:', error);
    res.status(500).json({ 
      message: 'Error fetching material reorder status',
      error: error.message 
    });
  }
});

// Update material reorder status
router.post('/update-status', async (req, res) => {
  try {
    // First ensure inventory is updated from transactions
    await InventoryMS.updateFromTransactions();

    const materials = await Material.find({ Status: 'Active' });
    const updates = [];

    for (const material of materials) {
      const inventory = await InventoryMS.findOne({ Material: material._id });
      const availableStock = inventory ? inventory.Quantity : 0;
      
      // Calculate appropriate stock levels
      const dangerStockLevel = Math.max(
        material.MinimumConsumption * material.MinimumLeadTime,
        material.ReorderQuantity * 0.3
      );
      
      const reorderPoint = Math.max(
        material.MaximumConsumption * material.MaximumLeadTime,
        material.ReorderQuantity
      );
      
      const maximumStockLevel = reorderPoint * 1.5;

      let status = 'Active';
      if (availableStock <= 0) {
        status = 'Out of Stock';
      } else if (availableStock <= dangerStockLevel) {
        status = 'Danger Level';
      } else if (availableStock <= reorderPoint) {
        status = 'Low Stock';
      }

      const reorderStatus = await MaterialROS.findOneAndUpdate(
        { Material: material._id },
        {
          Material: material._id,
          Unit: material.Unit,
          MinimumStockLevel: material.MinimumConsumption,
          MaximumStockLevel: maximumStockLevel,
          DangerStockLevel: dangerStockLevel,
          AvailableStock: availableStock,
          ReorderPoint: reorderPoint,
          Status: status
        },
        { upsert: true, new: true }
      ).populate('Material');

      updates.push(reorderStatus);
    }

    res.json({ 
      message: 'Reorder status updated successfully',
      updated: updates.length,
      details: updates
    });
  } catch (error) {
    console.error('Update material RO error:', error);
    res.status(500).json({ 
      message: 'Error updating reorder status',
      error: error.message 
    });
  }
});

// Get low stock materials
router.get('/low-stock', async (req, res) => {
  try {
    const lowStockMaterials = await MaterialROS.find({
      Status: { $in: ['Low Stock', 'Out of Stock', 'Danger Level'] }
    })
    .populate('Material')
    .sort({ 
      Status: -1, 
      AvailableStock: 1 
    })
    .lean();

    // Enhance with additional data
    const enhancedMaterials = await Promise.all(
      lowStockMaterials.map(async (item) => {
        const inventory = await InventoryMS.findOne({ Material: item.Material._id });
        return {
          ...item,
          currentInventory: inventory,
          needsUrgentAttention: item.Status === 'Out of Stock' || item.Status === 'Danger Level',
          suggestedReorder: Math.max(
            item.MaximumStockLevel - item.AvailableStock,
            item.ReorderPoint
          )
        };
      })
    );

    res.json(enhancedMaterials);
  } catch (error) {
    console.error('Get low stock materials error:', error);
    res.status(500).json({ 
      message: 'Error fetching low stock materials',
      error: error.message 
    });
  }
});

// Get reorder status for a specific material
router.get('/:materialId', async (req, res) => {
  try {
    const { materialId } = req.params;

    const reorderStatus = await MaterialROS.findOne({ Material: materialId })
      .populate('Material')
      .lean();

    if (!reorderStatus) {
      return res.status(404).json({ message: 'Reorder status not found for this material' });
    }

    // Get current inventory data
    const inventory = await InventoryMS.findOne({ Material: materialId }).lean();
    
    // Get recent transactions
    const material = await Material.findById(materialId);
    const recentTransactions = await MaterialRI.find({ 
      Material: material.Material 
    })
    .sort({ Date: -1 })
    .limit(10)
    .lean();

    res.json({
      ...reorderStatus,
      currentInventory: inventory,
      recentTransactions,
      consumptionRate: {
        minimum: material.MinimumConsumption,
        maximum: material.MaximumConsumption,
        average: (material.MinimumConsumption + material.MaximumConsumption) / 2
      },
      leadTime: {
        minimum: material.MinimumLeadTime,
        maximum: material.MaximumLeadTime,
        average: (material.MinimumLeadTime + material.MaximumLeadTime) / 2
      }
    });
  } catch (error) {
    console.error('Error fetching material reorder details:', error);
    res.status(500).json({ 
      message: 'Error fetching material reorder details',
      error: error.message 
    });
  }
});

// Update specific reorder settings
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      MinimumStockLevel, 
      MaximumStockLevel, 
      DangerStockLevel, 
      ReorderPoint,
      Status 
    } = req.body;

    const updateData = {};
    if (MinimumStockLevel !== undefined) updateData.MinimumStockLevel = MinimumStockLevel;
    if (MaximumStockLevel !== undefined) updateData.MaximumStockLevel = MaximumStockLevel;
    if (DangerStockLevel !== undefined) updateData.DangerStockLevel = DangerStockLevel;
    if (ReorderPoint !== undefined) updateData.ReorderPoint = ReorderPoint;
    if (Status !== undefined) updateData.Status = Status;

    // Validate stock levels
    if (MinimumStockLevel !== undefined && MaximumStockLevel !== undefined) {
      if (MinimumStockLevel >= MaximumStockLevel) {
        return res.status(400).json({ 
          message: 'Minimum stock level must be less than maximum stock level' 
        });
      }
    }

    const updatedStatus = await MaterialROS.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('Material');

    if (!updatedStatus) {
      return res.status(404).json({ message: 'Reorder status not found' });
    }

    res.json({
      message: 'Reorder status updated successfully',
      reorderStatus: updatedStatus
    });
  } catch (error) {
    console.error('Error updating reorder status:', error);
    res.status(500).json({ 
      message: 'Error updating reorder status',
      error: error.message 
    });
  }
});

export default router;
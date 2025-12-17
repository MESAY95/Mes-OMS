import express from 'express';
import InventoryPlan from '../models/InventoryPlan.js';
import Product from '../models/Product.js';
import Material from '../models/Material2.js';

const router = express.Router();

// Debug middleware for this router
router.use((req, res, next) => {
  console.log(`InventoryPlan Route: ${req.method} ${req.path}`);
  next();
});

// Helper function to escape regex characters
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Format fiscal year as "2024-2025"
const formatFiscalYear = (year) => {
  if (!year) return '';
  return `${year}-${year + 1}`;
};

// Get all inventory plans with filtering - sorted with newest at bottom
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/inventoryplans called');
    const { category, fiscalYear, month, balanceType, formatted } = req.query;
    let filter = {};
    if (category) filter.category = category;
    if (fiscalYear) filter.fiscalYear = parseInt(fiscalYear);
    if (month) filter.month = month;
    if (balanceType) filter.balanceType = balanceType;

    // Sort by creation date (oldest first) so newest appear at bottom
    const inventoryPlans = await InventoryPlan.find(filter).sort({ createdAt: 1 });
    
    // If formatted parameter is true, return fiscalYear as formatted string
    if (formatted === 'true') {
      const formattedPlans = inventoryPlans.map(plan => ({
        ...plan.toObject(),
        fiscalYear: formatFiscalYear(plan.fiscalYear)
      }));
      console.log(`Returning ${formattedPlans.length} inventory plans with formatted fiscal years`);
      return res.json(formattedPlans);
    }
    
    console.log(`Returning ${inventoryPlans.length} inventory plans`);
    res.json(inventoryPlans);
  } catch (error) {
    console.error('Error fetching inventory plans:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new inventory plan
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/inventoryplans called with data:', req.body);

    // Validate required fields
    const { category, item, fiscalYear, month, balanceType, quantity, unit } = req.body;
    
    if (!category || !item || !fiscalYear || !month || !balanceType || !unit) {
      return res.status(400).json({ 
        message: 'Missing required fields: category, item, fiscalYear, month, balanceType, unit' 
      });
    }

    // Convert and validate numeric fields
    const quantityNum = Number(quantity);
    const fiscalYearNum = Number(fiscalYear);

    console.log('Converted values:', { quantityNum, fiscalYearNum });

    if (isNaN(quantityNum) || quantityNum < 0) {
      return res.status(400).json({ 
        message: 'Quantity must be a valid non-negative number' 
      });
    }

    if (isNaN(fiscalYearNum) || fiscalYearNum < 2000 || fiscalYearNum > 2100) {
      return res.status(400).json({ 
        message: 'Fiscal year must be a valid year between 2000 and 2100' 
      });
    }

    // Validate category
    if (!['Product', 'Material'].includes(category)) {
      return res.status(400).json({ 
        message: 'Category must be either "Product" or "Material"' 
      });
    }

    // Validate balanceType
    if (!['Opening Balance', 'Closing Balance'].includes(balanceType)) {
      return res.status(400).json({ 
        message: 'Balance type must be either "Opening Balance" or "Closing Balance"' 
      });
    }

    // Validate month
    const validMonths = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    if (!validMonths.includes(month)) {
      return res.status(400).json({ 
        message: 'Invalid month' 
      });
    }

    // Verify that the item exists in the corresponding collection by name
    let itemExists = false;
    let itemDetails = null;
    
    // Escape the item name for regex to handle special characters
    const escapedItem = escapeRegex(item);
    
    if (category === 'Product') {
      itemDetails = await Product.findOne({ 
        $or: [
          { Product: { $regex: new RegExp(`^${escapedItem}$`, 'i') } }
        ],
        Status: 'Active'
      });
      itemExists = !!itemDetails;
      console.log(`Product search for "${item}":`, itemExists);
      if (itemDetails) {
        console.log('Found product:', {
          Product: itemDetails.Product,
          ProductCode: itemDetails.ProductCode,
          Unit: itemDetails.Unit,
          id: itemDetails._id
        });
      }
    } else if (category === 'Material') {
      itemDetails = await Material.findOne({ 
        $or: [
          { Material: { $regex: new RegExp(`^${escapedItem}$`, 'i') } }
        ],
        Status: 'Active'
      });
      itemExists = !!itemDetails;
      console.log(`Material search for "${item}":`, itemExists);
      if (itemDetails) {
        console.log('Found material:', {
          Material: itemDetails.Material,
          MaterialCode: itemDetails.MaterialCode,
          Unit: itemDetails.Unit,
          id: itemDetails._id
        });
      }
    }

    if (!itemExists) {
      return res.status(400).json({ 
        message: `Item "${item}" not found in ${category} collection or is not active` 
      });
    }

    // Use the canonical name and unit from the database
    const canonicalItemName = category === 'Product' 
      ? itemDetails.Product 
      : itemDetails.Material;
    
    const itemUnit = itemDetails.Unit || unit;

    // Check if inventory plan already exists for the same period, item and balance type
    const existingPlan = await InventoryPlan.findOne({
      category: category,
      item: canonicalItemName,
      fiscalYear: fiscalYearNum,
      month: month,
      balanceType: balanceType
    });

    if (existingPlan) {
      return res.status(400).json({ 
        message: `Inventory plan for ${balanceType} already exists for this item and period` 
      });
    }

    // Create the inventory plan with converted numbers and canonical name
    const inventoryPlanData = {
      category,
      item: canonicalItemName,
      unit: itemUnit,
      fiscalYear: fiscalYearNum,
      month,
      balanceType,
      quantity: quantityNum,
      note: req.body.note || ''
    };

    console.log('Creating inventory plan with data:', inventoryPlanData);

    const inventoryPlan = new InventoryPlan(inventoryPlanData);
    const newInventoryPlan = await inventoryPlan.save();
    
    console.log('Inventory plan created successfully:', newInventoryPlan._id);
    res.status(201).json(newInventoryPlan);
  } catch (error) {
    console.error('Error creating inventory plan:', error);
    
    if (error.code === 11000) {
      res.status(400).json({ 
        message: 'Inventory plan already exists for this item, period and balance type' 
      });
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      res.status(400).json({ 
        message: 'Validation error', 
        errors: errors 
      });
    } else {
      res.status(500).json({ 
        message: 'Error creating inventory plan',
        error: error.message 
      });
    }
  }
});

// Update an inventory plan
router.put('/:id', async (req, res) => {
  try {
    console.log('PUT /api/inventoryplans/:id called for ID:', req.params.id, 'with data:', req.body);

    const inventoryPlan = await InventoryPlan.findById(req.params.id);
    if (!inventoryPlan) {
      return res.status(404).json({ message: 'Inventory plan not found' });
    }

    // Convert numeric fields if provided
    const updateData = { ...req.body };
    
    if (updateData.quantity !== undefined) {
      const quantityNum = Number(updateData.quantity);
      if (isNaN(quantityNum) || quantityNum < 0) {
        return res.status(400).json({ 
          message: 'Quantity must be a valid non-negative number' 
        });
      }
      updateData.quantity = quantityNum;
    }

    if (updateData.fiscalYear !== undefined) {
      const fiscalYearNum = Number(updateData.fiscalYear);
      if (isNaN(fiscalYearNum) || fiscalYearNum < 2000 || fiscalYearNum > 2100) {
        return res.status(400).json({ 
          message: 'Fiscal year must be a valid year between 2000 and 2100' 
        });
      }
      updateData.fiscalYear = fiscalYearNum;
    }

    // Validate category if provided
    if (updateData.category && !['Product', 'Material'].includes(updateData.category)) {
      return res.status(400).json({ 
        message: 'Category must be either "Product" or "Material"' 
      });
    }

    // Validate balanceType if provided
    if (updateData.balanceType && !['Opening Balance', 'Closing Balance'].includes(updateData.balanceType)) {
      return res.status(400).json({ 
        message: 'Balance type must be either "Opening Balance" or "Closing Balance"' 
      });
    }

    // Validate month if provided
    if (updateData.month) {
      const validMonths = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      if (!validMonths.includes(updateData.month)) {
        return res.status(400).json({ 
          message: 'Invalid month' 
        });
      }
    }

    // Verify that the item exists in the corresponding collection if item or category is being updated
    if (updateData.item || updateData.category) {
      const targetCategory = updateData.category || inventoryPlan.category;
      const targetItem = updateData.item || inventoryPlan.item;

      let itemExists = false;
      let itemDetails = null;
      
      // Escape the item name for regex
      const escapedItem = escapeRegex(targetItem);
      
      if (targetCategory === 'Product') {
        itemDetails = await Product.findOne({ 
          $or: [
            { Product: { $regex: new RegExp(`^${escapedItem}$`, 'i') } }
          ],
          Status: 'Active'
        });
        itemExists = !!itemDetails;
        console.log(`Product search for "${targetItem}":`, itemExists);
      } else if (targetCategory === 'Material') {
        itemDetails = await Material.findOne({ 
          $or: [
            { Material: { $regex: new RegExp(`^${escapedItem}$`, 'i') } }
          ],
          Status: 'Active'
        });
        itemExists = !!itemDetails;
        console.log(`Material search for "${targetItem}":`, itemExists);
      }

      if (!itemExists) {
        return res.status(400).json({ 
          message: `Item "${targetItem}" not found in ${targetCategory} collection or is not active` 
        });
      }

      // Use the canonical name and unit from the database
      if (itemDetails) {
        updateData.item = targetCategory === 'Product' 
          ? itemDetails.Product 
          : itemDetails.Material;
        
        updateData.unit = itemDetails.Unit || inventoryPlan.unit;
      }
    }

    // Check for duplicate if relevant fields are being updated
    if (updateData.category || updateData.item || updateData.fiscalYear || updateData.month || updateData.balanceType) {
      const duplicatePlan = await InventoryPlan.findOne({
        category: updateData.category || inventoryPlan.category,
        item: updateData.item || inventoryPlan.item,
        fiscalYear: updateData.fiscalYear || inventoryPlan.fiscalYear,
        month: updateData.month || inventoryPlan.month,
        balanceType: updateData.balanceType || inventoryPlan.balanceType,
        _id: { $ne: req.params.id }
      });

      if (duplicatePlan) {
        return res.status(400).json({ 
          message: 'Another inventory plan already exists for this item, period and balance type' 
        });
      }
    }

    console.log('Updating inventory plan with data:', updateData);
    Object.assign(inventoryPlan, updateData);
    const updatedInventoryPlan = await inventoryPlan.save();
    
    console.log('Inventory plan updated successfully:', req.params.id);
    res.json(updatedInventoryPlan);
  } catch (error) {
    console.error('Error updating inventory plan:', error);
    
    if (error.code === 11000) {
      res.status(400).json({ 
        message: 'Another inventory plan already exists for this item, period and balance type' 
      });
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      res.status(400).json({ 
        message: 'Validation error', 
        errors: errors 
      });
    } else {
      res.status(400).json({ 
        message: 'Error updating inventory plan',
        error: error.message 
      });
    }
  }
});

// Delete an inventory plan
router.delete('/:id', async (req, res) => {
  try {
    console.log('DELETE /api/inventoryplans/:id called for ID:', req.params.id);
    
    const inventoryPlan = await InventoryPlan.findById(req.params.id);
    if (!inventoryPlan) {
      return res.status(404).json({ message: 'Inventory plan not found' });
    }

    await InventoryPlan.findByIdAndDelete(req.params.id);
    console.log('Inventory plan deleted successfully:', req.params.id);
    res.json({ message: 'Inventory plan deleted' });
  } catch (error) {
    console.error('Error deleting inventory plan:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all products for dropdown
router.get('/products', async (req, res) => {
  try {
    console.log('GET /api/inventoryplans/products called');
    
    const products = await Product.find({
      Status: 'Active'
    })
    .select('Product ProductCode Unit Status')
    .sort({ Product: 1 })
    .lean();

    const transformedProducts = products.map(product => ({
      _id: product._id,
      name: product.Product,
      sku: product.ProductCode || '',
      unit: product.Unit || 'pcs',
      status: product.Status
    })).filter(product => product.name);

    console.log(`Returning ${transformedProducts.length} products`);
    res.json(transformedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      message: 'Error fetching products',
      error: error.message 
    });
  }
});

// Get all materials for dropdown
router.get('/materials', async (req, res) => {
  try {
    console.log('GET /api/inventoryplans/materials called');
    
    const materials = await Material.find({
      Status: 'Active'
    })
    .select('Material MaterialCode Unit Status')
    .sort({ Material: 1 })
    .lean();

    const transformedMaterials = materials.map(material => ({
      _id: material._id,
      name: material.Material,
      sku: material.MaterialCode || '',
      unit: material.Unit || 'pcs',
      status: material.Status
    })).filter(material => material.name);

    console.log(`Returning ${transformedMaterials.length} materials`);
    res.json(transformedMaterials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ 
      message: 'Error fetching materials',
      error: error.message 
    });
  }
});

// Get fiscal years from existing plans
router.get('/fiscal-years', async (req, res) => {
  try {
    console.log('GET /api/inventoryplans/fiscal-years called');
    const fiscalYears = await InventoryPlan.distinct('fiscalYear');
    res.json(fiscalYears.sort().reverse());
  } catch (error) {
    console.error('Error fetching fiscal years:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get balance types from existing plans
router.get('/balance-types', async (req, res) => {
  try {
    console.log('GET /api/inventoryplans/balance-types called');
    const balanceTypes = await InventoryPlan.distinct('balanceType');
    res.json(balanceTypes.sort());
  } catch (error) {
    console.error('Error fetching balance types:', error);
    res.status(500).json({ message: error.message });
  }
});

// Import inventory plans from Excel
router.post('/import', async (req, res) => {
  try {
    console.log('POST /api/inventoryplans/import called with data:', req.body.data.length, 'records');
    
    const importData = req.body.data;
    let imported = 0;
    let errors = [];

    for (let i = 0; i < importData.length; i++) {
      const planData = importData[i];
      try {
        // Validate required fields
        if (!planData.category || !planData.item || !planData.fiscalYear || !planData.month || !planData.balanceType || !planData.quantity) {
          errors.push(`Row ${i + 1}: Missing required fields`);
          continue;
        }

        // Check if plan already exists
        const existingPlan = await InventoryPlan.findOne({
          category: planData.category,
          item: planData.item,
          fiscalYear: planData.fiscalYear,
          month: planData.month,
          balanceType: planData.balanceType
        });

        if (!existingPlan) {
          const inventoryPlan = new InventoryPlan(planData);
          await inventoryPlan.save();
          imported++;
        }
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    res.json({
      imported,
      errors,
      message: `Imported ${imported} inventory plans${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
    });
  } catch (error) {
    console.error('Error importing inventory plans:', error);
    res.status(500).json({ message: error.message });
  }
});

// Debug route to check products in database
router.get('/debug-products', async (req, res) => {
  try {
    console.log('GET /api/inventoryplans/debug-products called');
    
    const products = await Product.find({})
      .select('Product ProductCode Unit Status')
      .lean();

    console.log('All products in database:');
    products.forEach((product, index) => {
      console.log(`${index + 1}. Product: "${product.Product}", ProductCode: "${product.ProductCode}", Unit: "${product.Unit}", Status: "${product.Status}"`);
    });

    res.json({
      total: products.length,
      products: products
    });
  } catch (error) {
    console.error('Error in debug route:', error);
    res.status(500).json({ message: error.message });
  }
});

// Debug route to check materials in database
router.get('/debug-materials', async (req, res) => {
  try {
    console.log('GET /api/inventoryplans/debug-materials called');
    
    const materials = await Material.find({})
      .select('Material MaterialCode Unit Status')
      .lean();

    console.log('All materials in database:');
    materials.forEach((material, index) => {
      console.log(`${index + 1}. Material: "${material.Material}", MaterialCode: "${material.MaterialCode}", Unit: "${material.Unit}", Status: "${material.Status}"`);
    });

    res.json({
      total: materials.length,
      materials: materials
    });
  } catch (error) {
    console.error('Error in debug route:', error);
    res.status(500).json({ message: error.message });
  }
});

// Test product search endpoint for debugging
router.post('/test-product-search', async (req, res) => {
  try {
    const { productName } = req.body;
    console.log('Testing product search for:', productName);
    
    if (!productName) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    const escapedItem = escapeRegex(productName);
    
    const product = await Product.findOne({ 
      Product: { $regex: new RegExp(`^${escapedItem}$`, 'i') },
      Status: 'Active'
    });

    if (product) {
      res.json({
        found: true,
        product: {
          _id: product._id,
          Product: product.Product,
          ProductCode: product.ProductCode,
          Unit: product.Unit,
          Status: product.Status
        }
      });
    } else {
      res.json({
        found: false,
        message: `Product "${productName}" not found`
      });
    }
  } catch (error) {
    console.error('Error in test product search:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
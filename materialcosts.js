import express from 'express';
import MaterialCost from '../models/MaterialCost.js';
import Product from '../models/Product.js';
import Material from '../models/Material2.js';

const router = express.Router();

// Helper function to escape regex characters
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Get all material costs
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/materialcosts called');
    
    const materialCosts = await MaterialCost.find().sort({ createdAt: -1 });
    console.log(`Returning ${materialCosts.length} material costs`);
    res.json(materialCosts);
  } catch (error) {
    console.error('Error fetching material costs:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new material cost
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/materialcosts called with data:', req.body);

    // Validate required fields
    const { product, material, materialPrice, priceIncrement, note } = req.body;
    
    if (!product || !material || materialPrice === undefined || priceIncrement === undefined) {
      return res.status(400).json({ 
        message: 'Missing required fields: product, material, materialPrice, priceIncrement' 
      });
    }

    // Convert and validate numeric fields
    const materialPriceNum = Number(materialPrice);
    const priceIncrementNum = Number(priceIncrement);

    if (isNaN(materialPriceNum) || materialPriceNum < 0) {
      return res.status(400).json({ 
        message: 'Material price must be a valid non-negative number' 
      });
    }

    if (isNaN(priceIncrementNum) || priceIncrementNum < 0 || priceIncrementNum > 100) {
      return res.status(400).json({ 
        message: 'Price increment must be a valid percentage between 0 and 100' 
      });
    }

    // Verify that product exists and is active
    const escapedProduct = escapeRegex(product);
    const productDetails = await Product.findOne({ 
      $or: [
        { Product: { $regex: new RegExp(`^${escapedProduct}$`, 'i') } }
      ],
      Status: 'Active'
    });

    if (!productDetails) {
      return res.status(400).json({ 
        message: `Product "${product}" not found or is not active` 
      });
    }

    // Verify that material exists and is active
    const escapedMaterial = escapeRegex(material);
    const materialDetails = await Material.findOne({ 
      $or: [
        { Material: { $regex: new RegExp(`^${escapedMaterial}$`, 'i') } }
      ],
      Status: 'Active'
    });

    if (!materialDetails) {
      return res.status(400).json({ 
        message: `Material "${material}" not found or is not active` 
      });
    }

    // Use canonical names and units from database
    const canonicalProduct = productDetails.Product;
    const productUnit = productDetails.Unit || 'pcs';
    const canonicalMaterial = materialDetails.Material;
    const materialUnit = materialDetails.Unit || 'pcs';

    // Calculate total cost
    const totalCost = materialPriceNum + (materialPriceNum * priceIncrementNum / 100);

    // Check if material cost already exists for this product-material combination
    const existingCost = await MaterialCost.findOne({
      product: canonicalProduct,
      material: canonicalMaterial
    });

    if (existingCost) {
      return res.status(400).json({ 
        message: `Material cost already exists for product "${canonicalProduct}" and material "${canonicalMaterial}"` 
      });
    }

    // Create the material cost record
    const materialCostData = {
      product: canonicalProduct,
      productUnit: productUnit,
      material: canonicalMaterial,
      materialUnit: materialUnit,
      materialPrice: materialPriceNum,
      priceIncrement: priceIncrementNum,
      totalCost: totalCost,
      note: note || ''
    };

    console.log('Creating material cost with data:', materialCostData);

    const materialCost = new MaterialCost(materialCostData);
    const newMaterialCost = await materialCost.save();
    
    console.log('Material cost created successfully:', newMaterialCost._id);
    res.status(201).json(newMaterialCost);
  } catch (error) {
    console.error('Error creating material cost:', error);
    
    if (error.code === 11000) {
      res.status(400).json({ 
        message: 'Material cost already exists for this product and material combination' 
      });
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      res.status(400).json({ 
        message: 'Validation error', 
        errors: errors 
      });
    } else {
      res.status(500).json({ 
        message: 'Error creating material cost',
        error: error.message 
      });
    }
  }
});

// Update a material cost
router.put('/:id', async (req, res) => {
  try {
    console.log('PUT /api/materialcosts/:id called for ID:', req.params.id, 'with data:', req.body);

    const materialCost = await MaterialCost.findById(req.params.id);
    if (!materialCost) {
      return res.status(404).json({ message: 'Material cost not found' });
    }

    // Convert numeric fields if provided
    const updateData = { ...req.body };
    
    if (updateData.materialPrice !== undefined) {
      const materialPriceNum = Number(updateData.materialPrice);
      if (isNaN(materialPriceNum) || materialPriceNum < 0) {
        return res.status(400).json({ 
          message: 'Material price must be a valid non-negative number' 
        });
      }
      updateData.materialPrice = materialPriceNum;
    }

    if (updateData.priceIncrement !== undefined) {
      const priceIncrementNum = Number(updateData.priceIncrement);
      if (isNaN(priceIncrementNum) || priceIncrementNum < 0 || priceIncrementNum > 100) {
        return res.status(400).json({ 
          message: 'Price increment must be a valid percentage between 0 and 100' 
        });
      }
      updateData.priceIncrement = priceIncrementNum;
    }

    // Verify product if being updated
    if (updateData.product) {
      const escapedProduct = escapeRegex(updateData.product);
      const productDetails = await Product.findOne({ 
        $or: [
          { Product: { $regex: new RegExp(`^${escapedProduct}$`, 'i') } }
        ],
        Status: 'Active'
      });

      if (!productDetails) {
        return res.status(400).json({ 
          message: `Product "${updateData.product}" not found or is not active` 
        });
      }

      updateData.product = productDetails.Product;
      updateData.productUnit = productDetails.Unit || materialCost.productUnit;
    }

    // Verify material if being updated
    if (updateData.material) {
      const escapedMaterial = escapeRegex(updateData.material);
      const materialDetails = await Material.findOne({ 
        $or: [
          { Material: { $regex: new RegExp(`^${escapedMaterial}$`, 'i') } }
        ],
        Status: 'Active'
      });

      if (!materialDetails) {
        return res.status(400).json({ 
          message: `Material "${updateData.material}" not found or is not active` 
        });
      }

      updateData.material = materialDetails.Material;
      updateData.materialUnit = materialDetails.Unit || materialCost.materialUnit;
    }

    // Check for duplicate if product or material is being updated
    if (updateData.product || updateData.material) {
      const duplicateCost = await MaterialCost.findOne({
        product: updateData.product || materialCost.product,
        material: updateData.material || materialCost.material,
        _id: { $ne: req.params.id }
      });

      if (duplicateCost) {
        return res.status(400).json({ 
          message: 'Another material cost already exists for this product and material combination' 
        });
      }
    }

    console.log('Updating material cost with data:', updateData);
    Object.assign(materialCost, updateData);
    
    // Recalculate total cost if materialPrice or priceIncrement changed
    if (updateData.materialPrice !== undefined || updateData.priceIncrement !== undefined) {
      materialCost.totalCost = materialCost.materialPrice + 
        (materialCost.materialPrice * materialCost.priceIncrement / 100);
    }
    
    const updatedMaterialCost = await materialCost.save();
    
    console.log('Material cost updated successfully:', req.params.id);
    res.json(updatedMaterialCost);
  } catch (error) {
    console.error('Error updating material cost:', error);
    
    if (error.code === 11000) {
      res.status(400).json({ 
        message: 'Another material cost already exists for this product and material combination' 
      });
    } else if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      res.status(400).json({ 
        message: 'Validation error', 
        errors: errors 
      });
    } else {
      res.status(400).json({ 
        message: 'Error updating material cost',
        error: error.message 
      });
    }
  }
});

// Delete a material cost
router.delete('/:id', async (req, res) => {
  try {
    console.log('DELETE /api/materialcosts/:id called for ID:', req.params.id);
    
    const materialCost = await MaterialCost.findById(req.params.id);
    if (!materialCost) {
      return res.status(404).json({ message: 'Material cost not found' });
    }

    await MaterialCost.findByIdAndDelete(req.params.id);
    console.log('Material cost deleted successfully:', req.params.id);
    res.json({ message: 'Material cost deleted' });
  } catch (error) {
    console.error('Error deleting material cost:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all active products for dropdown
router.get('/products', async (req, res) => {
  try {
    console.log('GET /api/materialcosts/products called');
    
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

    console.log(`Returning ${transformedProducts.length} active products`);
    res.json(transformedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      message: 'Error fetching products',
      error: error.message 
    });
  }
});

// Get all active materials for dropdown
router.get('/materials', async (req, res) => {
  try {
    console.log('GET /api/materialcosts/materials called');
    
    const materials = await Material.find({
      Status: 'Active'
    })
    .select('Material MaterialCode Unit UnitPrice Status')
    .sort({ Material: 1 })
    .lean();

    const transformedMaterials = materials.map(material => ({
      _id: material._id,
      name: material.Material,
      sku: material.MaterialCode || '',
      unit: material.Unit || 'pcs',
      price: material.UnitPrice || 0,
      status: material.Status
    })).filter(material => material.name);

    console.log(`Returning ${transformedMaterials.length} active materials`);
    res.json(transformedMaterials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ 
      message: 'Error fetching materials',
      error: error.message 
    });
  }
});

// Get material unit price by ID
router.get('/material-price/:id', async (req, res) => {
  try {
    console.log('GET /api/materialcosts/material-price/:id called for ID:', req.params.id);
    
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    if (material.Status !== 'Active') {
      return res.status(400).json({ message: 'Material is not active' });
    }

    res.json({ 
      price: material.UnitPrice || 0,
      unit: material.Unit || 'pcs'
    });
  } catch (error) {
    console.error('Error fetching material price:', error);
    res.status(500).json({ 
      message: 'Error fetching material price',
      error: error.message 
    });
  }
});

export default router;
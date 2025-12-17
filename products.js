import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// GET all products with optional filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      product, 
      unit,
      sortBy = 'Product',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { Product: { $regex: search, $options: 'i' } },
        { ProductCode: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.Status = status;
    }
    
    if (product) {
      filter.Product = { $regex: product, $options: 'i' };
    }
    
    if (unit) {
      filter.Unit = unit;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalProducts = await Product.countDocuments(filter);

    // Transform products to include name field for frontend compatibility
    const transformedProducts = products.map(product => ({
      ...product.toObject(),
      name: product.Product // Map Product field to name for frontend
    }));

    res.json({
      data: transformedProducts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / limit),
        totalItems: totalProducts,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET single product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Transform product to include name field
    const transformedProduct = {
      ...product.toObject(),
      name: product.Product
    };
    
    res.json(transformedProduct);
  } catch (error) {
    console.error('Error fetching product:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    res.status(500).json({ 
      message: 'Error fetching product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CREATE new product
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = [
      'Product', 'ProductCode', 'PackSize', 'Unit', 'ProductPrice', 
      'ReorderQuantity', 'MinimumStock', 
      'MaximumStock', 'MinimumLeadTime', 'MaximumLeadTime'
    ];
    
    const missingFields = requiredFields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Enhanced numeric field validation
    const numericFields = [
      { field: 'PackSize', type: 'float', min: 0 },
      { field: 'ProductPrice', type: 'float', min: 0 },
      { field: 'ReorderQuantity', type: 'int', min: 0 },
      { field: 'MinimumStock', type: 'float', min: 0 },
      { field: 'MaximumStock', type: 'float', min: 0 },
      { field: 'MinimumLeadTime', type: 'int', min: 0 },
      { field: 'MaximumLeadTime', type: 'int', min: 0 }
    ];
    
    const validationErrors = [];
    
    for (const { field, type, min } of numericFields) {
      const value = req.body[field];
      
      // Check if value is provided and valid
      if (value === undefined || value === null || value === '') {
        validationErrors.push(`${field} is required`);
        continue;
      }
      
      // Convert to number and validate
      const numValue = type === 'int' ? parseInt(value) : parseFloat(value);
      
      if (isNaN(numValue)) {
        validationErrors.push(`Invalid ${field}: must be a valid number`);
      } else if (min !== undefined && numValue < min) {
        validationErrors.push(`Invalid ${field}: must be greater than or equal to ${min}`);
      }
      
      // Validate stock ranges
      if (field === 'MinimumStock' || field === 'MaximumStock') {
        const minStock = field === 'MinimumStock' ? numValue : parseFloat(req.body.MinimumStock);
        const maxStock = field === 'MaximumStock' ? numValue : parseFloat(req.body.MaximumStock);
        
        if (!isNaN(minStock) && !isNaN(maxStock) && minStock > maxStock) {
          validationErrors.push('Minimum stock cannot be greater than maximum stock');
        }
      }
      
      // Validate lead time ranges
      if (field === 'MinimumLeadTime' || field === 'MaximumLeadTime') {
        const minLeadTime = field === 'MinimumLeadTime' ? numValue : parseInt(req.body.MinimumLeadTime);
        const maxLeadTime = field === 'MaximumLeadTime' ? numValue : parseInt(req.body.MaximumLeadTime);
        
        if (!isNaN(minLeadTime) && !isNaN(maxLeadTime) && minLeadTime > maxLeadTime) {
          validationErrors.push('Minimum lead time cannot be greater than maximum lead time');
        }
      }
    }

    // Check for duplicate product name (case-insensitive)
    const existingProduct = await Product.findOne({ 
      $or: [
        { Product: { $regex: new RegExp(`^${req.body.Product}$`, 'i') } },
        { ProductCode: { $regex: new RegExp(`^${req.body.ProductCode}$`, 'i') } }
      ]
    });
    
    if (existingProduct) {
      if (existingProduct.Product.toLowerCase() === req.body.Product.toLowerCase()) {
        validationErrors.push(`Product with name "${req.body.Product}" already exists`);
      }
      if (existingProduct.ProductCode.toLowerCase() === req.body.ProductCode.toLowerCase()) {
        validationErrors.push(`Product with code "${req.body.ProductCode}" already exists`);
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Create product with validated and converted data
    const product = new Product({
      Product: req.body.Product.trim(),
      ProductCode: req.body.ProductCode.trim(),
      PackSize: parseFloat(req.body.PackSize),
      Unit: req.body.Unit.trim(),
      ProductPrice: parseFloat(req.body.ProductPrice),
      ReorderQuantity: parseInt(req.body.ReorderQuantity),
      MinimumStock: parseFloat(req.body.MinimumStock),
      MaximumStock: parseFloat(req.body.MaximumStock),
      MinimumLeadTime: parseInt(req.body.MinimumLeadTime),
      MaximumLeadTime: parseInt(req.body.MaximumLeadTime),
      Status: req.body.Status || 'Active'
    });

    const newProduct = await product.save();
    
    // Transform response to include name field
    const transformedProduct = {
      ...newProduct.toObject(),
      name: newProduct.Product
    };
    
    res.status(201).json(transformedProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Product with this name or code already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error creating product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// UPDATE product
router.put('/:id', async (req, res) => {
  try {
    // Check if product exists
    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Enhanced numeric field validation for update
    const numericFields = [
      { field: 'PackSize', type: 'float', min: 0 },
      { field: 'ProductPrice', type: 'float', min: 0 },
      { field: 'ReorderQuantity', type: 'int', min: 0 },
      { field: 'MinimumStock', type: 'float', min: 0 },
      { field: 'MaximumStock', type: 'float', min: 0 },
      { field: 'MinimumLeadTime', type: 'int', min: 0 },
      { field: 'MaximumLeadTime', type: 'int', min: 0 }
    ];
    
    const validationErrors = [];
    const updateData = {};

    // Validate and prepare update data for provided fields
    if (req.body.Product !== undefined) {
      if (!req.body.Product.trim()) {
        validationErrors.push('Product name cannot be empty');
      } else {
        // Check for duplicate product name (excluding current product)
        const duplicateProduct = await Product.findOne({ 
          $or: [
            { Product: { $regex: new RegExp(`^${req.body.Product.trim()}$`, 'i') } },
            { ProductCode: { $regex: new RegExp(`^${req.body.ProductCode}$`, 'i') } }
          ],
          _id: { $ne: req.params.id }
        });
        
        if (duplicateProduct) {
          if (duplicateProduct.Product.toLowerCase() === req.body.Product.toLowerCase()) {
            validationErrors.push(`Product with name "${req.body.Product}" already exists`);
          }
          if (req.body.ProductCode && duplicateProduct.ProductCode.toLowerCase() === req.body.ProductCode.toLowerCase()) {
            validationErrors.push(`Product with code "${req.body.ProductCode}" already exists`);
          }
        } else {
          updateData.Product = req.body.Product.trim();
        }
      }
    }

    if (req.body.Unit !== undefined) {
      if (!req.body.Unit.trim()) {
        validationErrors.push('Unit cannot be empty');
      } else {
        updateData.Unit = req.body.Unit.trim();
      }
    }

    // Validate numeric fields
    for (const { field, type, min } of numericFields) {
      if (req.body[field] !== undefined) {
        const value = req.body[field];
        
        // Check if value is valid
        if (value === '' || value === null) {
          validationErrors.push(`${field} cannot be empty`);
          continue;
        }
        
        const numValue = type === 'int' ? parseInt(value) : parseFloat(value);
        
        if (isNaN(numValue)) {
          validationErrors.push(`Invalid ${field}: must be a valid number`);
        } else if (min !== undefined && numValue < min) {
          validationErrors.push(`Invalid ${field}: must be greater than or equal to ${min}`);
        } else {
          updateData[field] = numValue;
        }
      }
    }

    // Validate stock ranges if both are provided
    if (req.body.MinimumStock !== undefined && req.body.MaximumStock !== undefined) {
      const minStock = parseFloat(req.body.MinimumStock);
      const maxStock = parseFloat(req.body.MaximumStock);
      
      if (!isNaN(minStock) && !isNaN(maxStock) && minStock > maxStock) {
        validationErrors.push('Minimum stock cannot be greater than maximum stock');
      }
    } else if (req.body.MinimumStock !== undefined && updateData.MaximumStock === undefined) {
      // If only min stock is updated, validate against existing max
      const minStock = parseFloat(req.body.MinimumStock);
      const maxStock = existingProduct.MaximumStock;
      
      if (!isNaN(minStock) && !isNaN(maxStock) && minStock > maxStock) {
        validationErrors.push('Minimum stock cannot be greater than existing maximum stock');
      }
    } else if (req.body.MaximumStock !== undefined && updateData.MinimumStock === undefined) {
      // If only max stock is updated, validate against existing min
      const minStock = existingProduct.MinimumStock;
      const maxStock = parseFloat(req.body.MaximumStock);
      
      if (!isNaN(minStock) && !isNaN(maxStock) && minStock > maxStock) {
        validationErrors.push('Existing minimum stock cannot be greater than maximum stock');
      }
    }

    // Validate lead time ranges if both are provided
    if (req.body.MinimumLeadTime !== undefined && req.body.MaximumLeadTime !== undefined) {
      const minLeadTime = parseInt(req.body.MinimumLeadTime);
      const maxLeadTime = parseInt(req.body.MaximumLeadTime);
      
      if (!isNaN(minLeadTime) && !isNaN(maxLeadTime) && minLeadTime > maxLeadTime) {
        validationErrors.push('Minimum lead time cannot be greater than maximum lead time');
      }
    } else if (req.body.MinimumLeadTime !== undefined && updateData.MaximumLeadTime === undefined) {
      // If only min lead time is updated, validate against existing max
      const minLeadTime = parseInt(req.body.MinimumLeadTime);
      const maxLeadTime = existingProduct.MaximumLeadTime;
      
      if (!isNaN(minLeadTime) && !isNaN(maxLeadTime) && minLeadTime > maxLeadTime) {
        validationErrors.push('Minimum lead time cannot be greater than existing maximum lead time');
      }
    } else if (req.body.MaximumLeadTime !== undefined && updateData.MinimumLeadTime === undefined) {
      // If only max lead time is updated, validate against existing min
      const minLeadTime = existingProduct.MinimumLeadTime;
      const maxLeadTime = parseInt(req.body.MaximumLeadTime);
      
      if (!isNaN(minLeadTime) && !isNaN(maxLeadTime) && minLeadTime > maxLeadTime) {
        validationErrors.push('Existing minimum lead time cannot be greater than maximum lead time');
      }
    }

    // Validate status
    if (req.body.Status !== undefined) {
      const validStatuses = ['Active', 'Inactive'];
      if (!validStatuses.includes(req.body.Status)) {
        validationErrors.push(`Status must be one of: ${validStatuses.join(', ')}`);
      } else {
        updateData.Status = req.body.Status;
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true 
      }
    );

    // Transform response to include name field
    const transformedProduct = {
      ...updatedProduct.toObject(),
      name: updatedProduct.Product
    };

    res.json(transformedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Product with this name or code already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ 
      message: 'Product deleted successfully',
      deletedProduct: product 
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    res.status(500).json({ 
      message: 'Error deleting product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH endpoint for partial updates (alternative to PUT)
router.patch('/:id', async (req, res) => {
  try {
    // Check if product exists
    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const validationErrors = [];
    const updateData = {};

    // Validate and prepare each field individually
    if (req.body.Product !== undefined) {
      if (!req.body.Product.trim()) {
        validationErrors.push('Product name cannot be empty');
      } else {
        // Check for duplicate
        const duplicateProduct = await Product.findOne({ 
          Product: { $regex: new RegExp(`^${req.body.Product.trim()}$`, 'i') },
          _id: { $ne: req.params.id }
        });
        
        if (duplicateProduct) {
          validationErrors.push(`Product with name "${req.body.Product}" already exists`);
        } else {
          updateData.Product = req.body.Product.trim();
        }
      }
    }

    if (req.body.Unit !== undefined) {
      if (!req.body.Unit.trim()) {
        validationErrors.push('Unit cannot be empty');
      } else {
        updateData.Unit = req.body.Unit.trim();
      }
    }

    // Validate numeric fields
    const numericFields = [
      { field: 'PackSize', type: 'float', min: 0 },
      { field: 'ProductPrice', type: 'float', min: 0 },
      { field: 'ReorderQuantity', type: 'int', min: 0 },
      { field: 'MinimumStock', type: 'float', min: 0 },
      { field: 'MaximumStock', type: 'float', min: 0 },
      { field: 'MinimumLeadTime', type: 'int', min: 0 },
      { field: 'MaximumLeadTime', type: 'int', min: 0 }
    ];

    for (const { field, type, min } of numericFields) {
      if (req.body[field] !== undefined) {
        if (req.body[field] === '' || req.body[field] === null) {
          validationErrors.push(`${field} cannot be empty`);
          continue;
        }
        
        const numValue = type === 'int' ? parseInt(req.body[field]) : parseFloat(req.body[field]);
        
        if (isNaN(numValue)) {
          validationErrors.push(`Invalid ${field}: must be a valid number`);
        } else if (min !== undefined && numValue < min) {
          validationErrors.push(`Invalid ${field}: must be greater than or equal to ${min}`);
        } else {
          updateData[field] = numValue;
        }
      }
    }

    // Validate status
    if (req.body.Status !== undefined) {
      const validStatuses = ['Active', 'Inactive'];
      if (!validStatuses.includes(req.body.Status)) {
        validationErrors.push(`Status must be one of: ${validStatuses.join(', ')}`);
      } else {
        updateData.Status = req.body.Status;
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true 
      }
    );

    // Transform response to include name field
    const transformedProduct = {
      ...updatedProduct.toObject(),
      name: updatedProduct.Product
    };

    res.json(transformedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Product with this name already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
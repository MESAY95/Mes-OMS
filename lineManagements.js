import express from 'express';
import Line from '../models/LineManagement.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';

const router = express.Router();

// Enhanced helper function to transform product data for frontend
const transformProduct = (product) => {
  if (!product) return null;
  
  const productObj = product.toObject ? product.toObject() : product;
  return {
    ...productObj,
    // Map backend fields to frontend expected fields
    _id: productObj._id,
    productName: productObj.Product,
    productCode: productObj.ProductCode,
    unit: productObj.Unit,
    status: productObj.Status,
    displayName: productObj.Product || 'Unnamed Product',
    // Include other fields if needed
    packSize: productObj.PackSize,
    productPrice: productObj.ProductPrice
  };
};

// Enhanced helper to transform line data for frontend
const transformLine = (line) => {
  if (!line) return null;
  
  const lineObj = line.toObject ? line.toObject() : line;
  
  // Ensure products array exists and transform product data
  if (lineObj.products && Array.isArray(lineObj.products)) {
    lineObj.products = lineObj.products
      .filter(product => product != null)
      .map(transformProduct);
  } else {
    lineObj.products = [];
  }
  
  return lineObj;
};

// GET all lines with filtering, pagination, and product population
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status,
      product,
      sortBy = 'lineName',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { lineName: { $regex: search, $options: 'i' } },
        { lineCode: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }

    if (product) {
      // Validate if product ID is valid ObjectId
      if (mongoose.Types.ObjectId.isValid(product)) {
        filter.products = product;
      } else {
        return res.status(400).json({ 
          message: 'Invalid product ID format',
          details: `Received: ${product}`
        });
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const lines = await Line.find(filter)
      .populate({
        path: 'products',
        select: 'Product ProductCode Unit Status PackSize ProductPrice',
        match: { Status: 'Active' } // Only populate active products
      })
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalLines = await Line.countDocuments(filter);

    // Process lines using transformer
    const processedLines = lines.map(transformLine);

    res.json({
      data: processedLines,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalLines / limit),
        totalItems: totalLines,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching lines:', error);
    
    // Handle specific Mongoose errors
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid data format in request',
        field: error.path,
        value: error.value
      });
    }
    
    res.status(500).json({ 
      message: 'Error fetching lines',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET single line by ID
router.get('/:id', async (req, res) => {
  try {
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid line ID format' });
    }

    const line = await Line.findById(req.params.id)
      .populate({
        path: 'products',
        select: 'Product ProductCode Unit Status PackSize ProductPrice',
        match: { Status: 'Active' }
      });

    if (!line) {
      return res.status(404).json({ message: 'Line not found' });
    }

    // Process the line data using transformer
    const lineData = transformLine(line);

    res.json(lineData);
  } catch (error) {
    console.error('Error fetching line:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid line ID format',
        details: error.message 
      });
    }
    res.status(500).json({ 
      message: 'Error fetching line',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET active products for dropdown
router.get('/products/active', async (req, res) => {
  try {
    const products = await Product.find({ 
      Status: 'Active'
    })
    .select('Product ProductCode Unit Status PackSize ProductPrice _id')
    .sort({ Product: 1 });

    // Transform products to ensure consistent format for frontend
    const transformedProducts = products.map(transformProduct);

    res.json(transformedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: 'Please check if the Product model and database connection are working properly'
    });
  }
});

// CREATE new line
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['lineName', 'lineCode', 'capacity'];
    const missingFields = requiredFields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    const validationErrors = [];

    // Validate line name
    if (req.body.lineName && req.body.lineName.trim().length === 0) {
      validationErrors.push('Line name cannot be empty');
    }

    // Validate line code
    if (req.body.lineCode && req.body.lineCode.trim().length === 0) {
      validationErrors.push('Line code cannot be empty');
    }

    // Validate capacity fields
    if (req.body.capacity) {
      const capacityFields = ['hourlyCapacity', 'dailyCapacity', 'weeklyCapacity', 'monthlyCapacity'];
      capacityFields.forEach(field => {
        const value = req.body.capacity[field];
        if (value === undefined || value === null || value === '') {
          validationErrors.push(`Capacity ${field} is required`);
        } else if (isNaN(value) || parseFloat(value) < 0) {
          validationErrors.push(`Capacity ${field} must be a positive number`);
        }
      });
    }

    // Validate products if provided
    if (req.body.products && Array.isArray(req.body.products)) {
      if (req.body.products.length > 0) {
        // Validate each product ID
        const validProductIds = [];
        const invalidProductIds = [];
        
        for (const productId of req.body.products) {
          if (mongoose.Types.ObjectId.isValid(productId)) {
            // Check if product exists and is active
            try {
              const existingProduct = await Product.findOne({
                _id: productId,
                Status: 'Active'
              });
              
              if (existingProduct) {
                validProductIds.push(productId);
              } else {
                invalidProductIds.push(productId);
              }
            } catch (dbError) {
              console.error('Database error checking product:', productId, dbError);
              invalidProductIds.push(productId);
            }
          } else {
            console.error('Invalid product ID format:', productId);
            invalidProductIds.push(productId);
          }
        }
        
        if (invalidProductIds.length > 0) {
          validationErrors.push(`Invalid or inactive product IDs: ${invalidProductIds.join(', ')}`);
        } else {
          req.body.products = validProductIds; // Use only valid products
        }
      }
    }

    // Check for duplicate line code
    const existingLine = await Line.findOne({ 
      lineCode: { $regex: new RegExp(`^${req.body.lineCode.trim()}$`, 'i') } 
    });
    
    if (existingLine) {
      validationErrors.push(`Line with code "${req.body.lineCode}" already exists`);
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Create line
    const line = new Line({
      lineName: req.body.lineName.trim(),
      lineCode: req.body.lineCode.trim(),
      description: req.body.description ? req.body.description.trim() : '',
      capacity: {
        hourlyCapacity: parseFloat(req.body.capacity.hourlyCapacity),
        dailyCapacity: parseFloat(req.body.capacity.dailyCapacity),
        weeklyCapacity: parseFloat(req.body.capacity.weeklyCapacity),
        monthlyCapacity: parseFloat(req.body.capacity.monthlyCapacity)
      },
      operationalHours: {
        shiftsPerDay: req.body.operationalHours?.shiftsPerDay || 2,
        hoursPerShift: req.body.operationalHours?.hoursPerShift || 8,
        workingDaysPerWeek: req.body.operationalHours?.workingDaysPerWeek || 5
      },
      products: req.body.products || [],
      status: req.body.status || 'active'
    });

    const newLine = await line.save();
    
    // Populate product details before sending response
    const populatedLine = await Line.findById(newLine._id)
      .populate({
        path: 'products',
        select: 'Product ProductCode Unit Status PackSize ProductPrice',
        match: { Status: 'Active' }
      });

    // Process the populated line using transformer
    const lineData = transformLine(populatedLine);
      
    res.status(201).json(lineData);
  } catch (error) {
    console.error('Error creating line:', error);
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
        message: 'Line with this code already exists'
      });
    }
    
    // Handle CastError
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid data format',
        field: error.path,
        value: error.value
      });
    }
    
    res.status(500).json({ 
      message: 'Error creating line',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// UPDATE line
router.put('/:id', async (req, res) => {
  try {
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid line ID format' });
    }

    // Check if line exists
    const existingLine = await Line.findById(req.params.id);
    if (!existingLine) {
      return res.status(404).json({ message: 'Line not found' });
    }

    const validationErrors = [];
    const updateData = {};

    // Validate and prepare update data
    if (req.body.lineName !== undefined) {
      if (!req.body.lineName.trim()) {
        validationErrors.push('Line name cannot be empty');
      } else {
        updateData.lineName = req.body.lineName.trim();
      }
    }

    if (req.body.lineCode !== undefined) {
      if (!req.body.lineCode.trim()) {
        validationErrors.push('Line code cannot be empty');
      } else {
        // Check for duplicate line code (excluding current line)
        const duplicateLine = await Line.findOne({ 
          lineCode: { $regex: new RegExp(`^${req.body.lineCode.trim()}$`, 'i') },
          _id: { $ne: req.params.id }
        });
        
        if (duplicateLine) {
          validationErrors.push(`Line with code "${req.body.lineCode}" already exists`);
        } else {
          updateData.lineCode = req.body.lineCode.trim();
        }
      }
    }

    if (req.body.description !== undefined) {
      updateData.description = req.body.description.trim() || '';
    }

    // Validate capacity
    if (req.body.capacity !== undefined) {
      updateData.capacity = {};
      const capacityFields = ['hourlyCapacity', 'dailyCapacity', 'weeklyCapacity', 'monthlyCapacity'];
      
      capacityFields.forEach(field => {
        const value = req.body.capacity[field];
        if (value === undefined || value === null || value === '') {
          validationErrors.push(`Capacity ${field} is required`);
        } else if (isNaN(value) || parseFloat(value) < 0) {
          validationErrors.push(`Capacity ${field} must be a positive number`);
        } else {
          updateData.capacity[field] = parseFloat(value);
        }
      });
    }

    // Validate products
    if (req.body.products !== undefined) {
      if (!Array.isArray(req.body.products)) {
        validationErrors.push('Products must be an array');
      } else if (req.body.products.length > 0) {
        // Validate each product ID
        const validProductIds = [];
        const invalidProductIds = [];
        
        for (const productId of req.body.products) {
          if (mongoose.Types.ObjectId.isValid(productId)) {
            try {
              const existingProduct = await Product.findOne({
                _id: productId,
                Status: 'Active'
              });
              
              if (existingProduct) {
                validProductIds.push(productId);
              } else {
                invalidProductIds.push(productId);
              }
            } catch (dbError) {
              console.error('Database error checking product:', productId, dbError);
              invalidProductIds.push(productId);
            }
          } else {
            console.error('Invalid product ID format:', productId);
            invalidProductIds.push(productId);
          }
        }
        
        if (invalidProductIds.length > 0) {
          validationErrors.push(`Invalid or inactive product IDs: ${invalidProductIds.join(', ')}`);
        } else {
          updateData.products = validProductIds;
        }
      } else {
        updateData.products = [];
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const updatedLine = await Line.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true 
      }
    ).populate({
      path: 'products',
      select: 'Product ProductCode Unit Status PackSize ProductPrice',
      match: { Status: 'Active' }
    });

    // Process the updated line using transformer
    const lineData = transformLine(updatedLine);

    res.json(lineData);
  } catch (error) {
    console.error('Error updating line:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid line ID format',
        details: error.message 
      });
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
        message: 'Line with this code already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating line',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE line
router.delete('/:id', async (req, res) => {
  try {
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid line ID format' });
    }

    const line = await Line.findByIdAndDelete(req.params.id);
    
    if (!line) {
      return res.status(404).json({ message: 'Line not found' });
    }

    res.json({ 
      message: 'Line deleted successfully',
      deletedLine: line 
    });
  } catch (error) {
    console.error('Error deleting line:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Invalid line ID format',
        details: error.message 
      });
    }
    res.status(500).json({ 
      message: 'Error deleting line',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
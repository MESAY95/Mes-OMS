import express from 'express';
import Material from '../models/Material.js';

const router = express.Router();

// GET all materials with optional filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      material, 
      unit,
      sortBy = 'Material',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.Material = { $regex: search, $options: 'i' };
    }
    
    if (status) {
      filter.Status = status;
    }
    
    if (material) {
      filter.Material = { $regex: material, $options: 'i' };
    }
    
    if (unit) {
      filter.Unit = unit;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const materials = await Material.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalMaterials = await Material.countDocuments(filter);

    res.json({
      data: materials,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalMaterials / limit),
        totalItems: totalMaterials,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ 
      message: 'Error fetching materials',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET single material by ID
router.get('/:id', async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }
    res.json(material);
  } catch (error) {
    console.error('Error fetching material:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid material ID format' });
    }
    res.status(500).json({ 
      message: 'Error fetching material',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CREATE new material
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = [
      'Material', 'PackSize', 'Unit', 'UnitPrice', 
      'ReorderQuantity', 'MinimumConsumption', 
      'MaximumConsumption', 'MinimumLeadTime', 'MaximumLeadTime'
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
      { field: 'UnitPrice', type: 'float', min: 0 },
      { field: 'ReorderQuantity', type: 'int', min: 0 },
      { field: 'MinimumConsumption', type: 'float', min: 0 },
      { field: 'MaximumConsumption', type: 'float', min: 0 },
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
      
      // Validate consumption ranges
      if (field === 'MinimumConsumption' || field === 'MaximumConsumption') {
        const minConsumption = field === 'MinimumConsumption' ? numValue : parseFloat(req.body.MinimumConsumption);
        const maxConsumption = field === 'MaximumConsumption' ? numValue : parseFloat(req.body.MaximumConsumption);
        
        if (!isNaN(minConsumption) && !isNaN(maxConsumption) && minConsumption > maxConsumption) {
          validationErrors.push('Minimum consumption cannot be greater than maximum consumption');
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

    // Check for duplicate material name
    const existingMaterial = await Material.findOne({ 
      Material: { $regex: new RegExp(`^${req.body.Material}$`, 'i') } 
    });
    
    if (existingMaterial) {
      validationErrors.push(`Material with name "${req.body.Material}" already exists`);
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Create material with validated and converted data
    const material = new Material({
      Material: req.body.Material.trim(),
      PackSize: parseFloat(req.body.PackSize),
      Unit: req.body.Unit.trim(),
      UnitPrice: parseFloat(req.body.UnitPrice),
      ReorderQuantity: parseInt(req.body.ReorderQuantity),
      MinimumConsumption: parseFloat(req.body.MinimumConsumption),
      MaximumConsumption: parseFloat(req.body.MaximumConsumption),
      MinimumLeadTime: parseInt(req.body.MinimumLeadTime),
      MaximumLeadTime: parseInt(req.body.MaximumLeadTime),
      Status: req.body.Status || 'Active'
    });

    const newMaterial = await material.save();
    res.status(201).json(newMaterial);
  } catch (error) {
    console.error('Error creating material:', error);
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
        message: 'Material with this name already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error creating material',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// UPDATE material
router.put('/:id', async (req, res) => {
  try {
    // Check if material exists
    const existingMaterial = await Material.findById(req.params.id);
    if (!existingMaterial) {
      return res.status(404).json({ message: 'Material not found' });
    }

    // Enhanced numeric field validation for update
    const numericFields = [
      { field: 'PackSize', type: 'float', min: 0 },
      { field: 'UnitPrice', type: 'float', min: 0 },
      { field: 'ReorderQuantity', type: 'int', min: 0 },
      { field: 'MinimumConsumption', type: 'float', min: 0 },
      { field: 'MaximumConsumption', type: 'float', min: 0 },
      { field: 'MinimumLeadTime', type: 'int', min: 0 },
      { field: 'MaximumLeadTime', type: 'int', min: 0 }
    ];
    
    const validationErrors = [];
    const updateData = {};

    // Validate and prepare update data for provided fields
    if (req.body.Material !== undefined) {
      if (!req.body.Material.trim()) {
        validationErrors.push('Material name cannot be empty');
      } else {
        // Check for duplicate material name (excluding current material)
        const duplicateMaterial = await Material.findOne({ 
          Material: { $regex: new RegExp(`^${req.body.Material.trim()}$`, 'i') },
          _id: { $ne: req.params.id }
        });
        
        if (duplicateMaterial) {
          validationErrors.push(`Material with name "${req.body.Material}" already exists`);
        } else {
          updateData.Material = req.body.Material.trim();
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

    // Validate consumption ranges if both are provided
    if (req.body.MinimumConsumption !== undefined && req.body.MaximumConsumption !== undefined) {
      const minConsumption = parseFloat(req.body.MinimumConsumption);
      const maxConsumption = parseFloat(req.body.MaximumConsumption);
      
      if (!isNaN(minConsumption) && !isNaN(maxConsumption) && minConsumption > maxConsumption) {
        validationErrors.push('Minimum consumption cannot be greater than maximum consumption');
      }
    } else if (req.body.MinimumConsumption !== undefined && updateData.MaximumConsumption === undefined) {
      // If only min consumption is updated, validate against existing max
      const minConsumption = parseFloat(req.body.MinimumConsumption);
      const maxConsumption = existingMaterial.MaximumConsumption;
      
      if (!isNaN(minConsumption) && !isNaN(maxConsumption) && minConsumption > maxConsumption) {
        validationErrors.push('Minimum consumption cannot be greater than existing maximum consumption');
      }
    } else if (req.body.MaximumConsumption !== undefined && updateData.MinimumConsumption === undefined) {
      // If only max consumption is updated, validate against existing min
      const minConsumption = existingMaterial.MinimumConsumption;
      const maxConsumption = parseFloat(req.body.MaximumConsumption);
      
      if (!isNaN(minConsumption) && !isNaN(maxConsumption) && minConsumption > maxConsumption) {
        validationErrors.push('Existing minimum consumption cannot be greater than maximum consumption');
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
      const maxLeadTime = existingMaterial.MaximumLeadTime;
      
      if (!isNaN(minLeadTime) && !isNaN(maxLeadTime) && minLeadTime > maxLeadTime) {
        validationErrors.push('Minimum lead time cannot be greater than existing maximum lead time');
      }
    } else if (req.body.MaximumLeadTime !== undefined && updateData.MinimumLeadTime === undefined) {
      // If only max lead time is updated, validate against existing min
      const minLeadTime = existingMaterial.MinimumLeadTime;
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

    const updatedMaterial = await Material.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true 
      }
    );

    res.json(updatedMaterial);
  } catch (error) {
    console.error('Error updating material:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid material ID format' });
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
        message: 'Material with this name already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating material',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE material
router.delete('/:id', async (req, res) => {
  try {
    const material = await Material.findByIdAndDelete(req.params.id);
    
    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    res.json({ 
      message: 'Material deleted successfully',
      deletedMaterial: material 
    });
  } catch (error) {
    console.error('Error deleting material:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid material ID format' });
    }
    res.status(500).json({ 
      message: 'Error deleting material',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH endpoint for partial updates (alternative to PUT)
router.patch('/:id', async (req, res) => {
  try {
    // Check if material exists
    const existingMaterial = await Material.findById(req.params.id);
    if (!existingMaterial) {
      return res.status(404).json({ message: 'Material not found' });
    }

    const validationErrors = [];
    const updateData = {};

    // Validate and prepare each field individually
    if (req.body.Material !== undefined) {
      if (!req.body.Material.trim()) {
        validationErrors.push('Material name cannot be empty');
      } else {
        // Check for duplicate
        const duplicateMaterial = await Material.findOne({ 
          Material: { $regex: new RegExp(`^${req.body.Material.trim()}$`, 'i') },
          _id: { $ne: req.params.id }
        });
        
        if (duplicateMaterial) {
          validationErrors.push(`Material with name "${req.body.Material}" already exists`);
        } else {
          updateData.Material = req.body.Material.trim();
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
      { field: 'UnitPrice', type: 'float', min: 0 },
      { field: 'ReorderQuantity', type: 'int', min: 0 },
      { field: 'MinimumConsumption', type: 'float', min: 0 },
      { field: 'MaximumConsumption', type: 'float', min: 0 },
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

    const updatedMaterial = await Material.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true 
      }
    );

    res.json(updatedMaterial);
  } catch (error) {
    console.error('Error updating material:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid material ID format' });
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
        message: 'Material with this name already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating material',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
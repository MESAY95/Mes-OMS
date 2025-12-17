import express from 'express';
import Department from '../models/DepartmentManagement.js';

const router = express.Router();

// GET all departments with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status,
      sortBy = 'departmentName',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { departmentName: { $regex: search, $options: 'i' } },
        { departmentCode: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const departments = await Department.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalDepartments = await Department.countDocuments(filter);

    res.json({
      data: departments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalDepartments / limit),
        totalItems: totalDepartments,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ 
      message: 'Error fetching departments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET single department by ID
router.get('/:id', async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }
    res.json(department);
  } catch (error) {
    console.error('Error fetching department:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid department ID format' });
    }
    res.status(500).json({ 
      message: 'Error fetching department',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CREATE new department
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['departmentName', 'departmentCode'];
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

    // Validate department name
    if (req.body.departmentName && req.body.departmentName.trim().length === 0) {
      validationErrors.push('Department name cannot be empty');
    }

    // Validate department code
    if (req.body.departmentCode && req.body.departmentCode.trim().length === 0) {
      validationErrors.push('Department code cannot be empty');
    }

    // Check for duplicate department code
    const existingDepartment = await Department.findOne({ 
      departmentCode: { $regex: new RegExp(`^${req.body.departmentCode.trim()}$`, 'i') } 
    });
    
    if (existingDepartment) {
      validationErrors.push(`Department with code "${req.body.departmentCode}" already exists`);
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Create department
    const department = new Department({
      departmentName: req.body.departmentName.trim(),
      departmentCode: req.body.departmentCode.trim(),
      description: req.body.description ? req.body.description.trim() : undefined,
      status: req.body.status || 'Active'
    });

    const newDepartment = await department.save();
    res.status(201).json(newDepartment);
  } catch (error) {
    console.error('Error creating department:', error);
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
        message: 'Department with this code already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error creating department',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// UPDATE department
router.put('/:id', async (req, res) => {
  try {
    // Check if department exists
    const existingDepartment = await Department.findById(req.params.id);
    if (!existingDepartment) {
      return res.status(404).json({ message: 'Department not found' });
    }

    const validationErrors = [];
    const updateData = {};

    // Validate and prepare update data
    if (req.body.departmentName !== undefined) {
      if (!req.body.departmentName.trim()) {
        validationErrors.push('Department name cannot be empty');
      } else {
        updateData.departmentName = req.body.departmentName.trim();
      }
    }

    if (req.body.departmentCode !== undefined) {
      if (!req.body.departmentCode.trim()) {
        validationErrors.push('Department code cannot be empty');
      } else {
        // Check for duplicate department code (excluding current department)
        const duplicateDepartment = await Department.findOne({ 
          departmentCode: { $regex: new RegExp(`^${req.body.departmentCode.trim()}$`, 'i') },
          _id: { $ne: req.params.id }
        });
        
        if (duplicateDepartment) {
          validationErrors.push(`Department with code "${req.body.departmentCode}" already exists`);
        } else {
          updateData.departmentCode = req.body.departmentCode.trim();
        }
      }
    }

    if (req.body.description !== undefined) {
      updateData.description = req.body.description.trim() || undefined;
    }

    // Validate status
    if (req.body.status !== undefined) {
      const validStatuses = ['Active', 'Inactive'];
      if (!validStatuses.includes(req.body.status)) {
        validationErrors.push(`Status must be one of: ${validStatuses.join(', ')}`);
      } else {
        updateData.status = req.body.status;
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const updatedDepartment = await Department.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true 
      }
    );

    res.json(updatedDepartment);
  } catch (error) {
    console.error('Error updating department:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid department ID format' });
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
        message: 'Department with this code already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating department',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE department
router.delete('/:id', async (req, res) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    res.json({ 
      message: 'Department deleted successfully',
      deletedDepartment: department 
    });
  } catch (error) {
    console.error('Error deleting department:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid department ID format' });
    }
    res.status(500).json({ 
      message: 'Error deleting department',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
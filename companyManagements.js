import express from 'express';
import CompanyManagement from '../models/CompanyManagement.js';

const router = express.Router();

// GET all company information with optional filtering
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      city,
      country,
      sortBy = 'companyName',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { 'address.street': { $regex: search, $options: 'i' } },
        { 'contact.email': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (city) {
      filter['address.city'] = { $regex: city, $options: 'i' };
    }
    
    if (country) {
      filter['address.country'] = { $regex: country, $options: 'i' };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const companies = await CompanyManagement.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalCompanies = await CompanyManagement.countDocuments(filter);

    res.json({
      data: companies,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCompanies / limit),
        totalItems: totalCompanies,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching company information:', error);
    res.status(500).json({ 
      message: 'Error fetching company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET single company by ID
router.get('/:id', async (req, res) => {
  try {
    const company = await CompanyManagement.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company information not found' });
    }
    
    res.json(company);
  } catch (error) {
    console.error('Error fetching company information:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid company ID format' });
    }
    res.status(500).json({ 
      message: 'Error fetching company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CREATE new company information
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = [
      'companyName', 
      'address.street', 
      'address.city', 
      'address.state', 
      'address.zipCode', 
      'address.country'
    ];
    
    const missingFields = requiredFields.filter(field => {
      const value = getNestedValue(req.body, field);
      return value === undefined || value === null || value === '';
    });
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Check for duplicate company name
    const existingCompany = await CompanyManagement.findOne({ 
      companyName: { $regex: new RegExp(`^${req.body.companyName.trim()}$`, 'i') }
    });
    
    if (existingCompany) {
      return res.status(400).json({ 
        message: `Company with name "${req.body.companyName}" already exists`
      });
    }

    // Validate email format if provided
    if (req.body.contact?.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.contact.email)) {
        return res.status(400).json({ 
          message: 'Invalid email format'
        });
      }
    }

    // Validate established year if provided
    if (req.body.additionalInfo?.establishedYear) {
      const establishedYear = parseInt(req.body.additionalInfo.establishedYear);
      const currentYear = new Date().getFullYear();
      if (establishedYear < 1900 || establishedYear > currentYear) {
        return res.status(400).json({ 
          message: `Established year must be between 1900 and ${currentYear}`
        });
      }
    }

    const company = new CompanyManagement({
      companyName: req.body.companyName.trim(),
      address: {
        street: req.body.address.street.trim(),
        city: req.body.address.city.trim(),
        state: req.body.address.state.trim(),
        zipCode: req.body.address.zipCode.trim(),
        country: req.body.address.country.trim()
      },
      contact: req.body.contact ? {
        phone: req.body.contact.phone?.trim(),
        email: req.body.contact.email?.trim().toLowerCase(),
        website: req.body.contact.website?.trim()
      } : undefined,
      additionalInfo: req.body.additionalInfo ? {
        taxId: req.body.additionalInfo.taxId?.trim(),
        registrationNumber: req.body.additionalInfo.registrationNumber?.trim(),
        establishedYear: req.body.additionalInfo.establishedYear ? 
          parseInt(req.body.additionalInfo.establishedYear) : undefined
      } : undefined,
      status: req.body.status || 'Active'
    });

    const newCompany = await company.save();
    res.status(201).json(newCompany);
  } catch (error) {
    console.error('Error creating company information:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Company with this name already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error creating company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// UPDATE company information
router.put('/:id', async (req, res) => {
  try {
    // Check if company exists
    const existingCompany = await CompanyManagement.findById(req.params.id);
    if (!existingCompany) {
      return res.status(404).json({ message: 'Company information not found' });
    }

    const validationErrors = [];
    const updateData = {};

    // Validate and prepare update data
    if (req.body.companyName !== undefined) {
      if (!req.body.companyName.trim()) {
        validationErrors.push('Company name cannot be empty');
      } else {
        // Check for duplicate company name (excluding current company)
        const duplicateCompany = await CompanyManagement.findOne({ 
          companyName: { $regex: new RegExp(`^${req.body.companyName.trim()}$`, 'i') },
          _id: { $ne: req.params.id }
        });
        
        if (duplicateCompany) {
          validationErrors.push(`Company with name "${req.body.companyName}" already exists`);
        } else {
          updateData.companyName = req.body.companyName.trim();
        }
      }
    }

    // Validate address fields
    if (req.body.address) {
      updateData.address = {};
      const addressFields = ['street', 'city', 'state', 'zipCode', 'country'];
      
      addressFields.forEach(field => {
        if (req.body.address[field] !== undefined) {
          if (!req.body.address[field].trim()) {
            validationErrors.push(`Address ${field} cannot be empty`);
          } else {
            updateData.address[field] = req.body.address[field].trim();
          }
        }
      });
    }

    // Validate contact fields
    if (req.body.contact) {
      updateData.contact = {};
      
      if (req.body.contact.phone !== undefined) {
        updateData.contact.phone = req.body.contact.phone?.trim();
      }
      
      if (req.body.contact.email !== undefined) {
        if (req.body.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.contact.email)) {
          validationErrors.push('Invalid email format');
        } else {
          updateData.contact.email = req.body.contact.email?.trim().toLowerCase();
        }
      }
      
      if (req.body.contact.website !== undefined) {
        updateData.contact.website = req.body.contact.website?.trim();
      }
    }

    // Validate additional info
    if (req.body.additionalInfo) {
      updateData.additionalInfo = {};
      
      if (req.body.additionalInfo.taxId !== undefined) {
        updateData.additionalInfo.taxId = req.body.additionalInfo.taxId?.trim();
      }
      
      if (req.body.additionalInfo.registrationNumber !== undefined) {
        updateData.additionalInfo.registrationNumber = req.body.additionalInfo.registrationNumber?.trim();
      }
      
      if (req.body.additionalInfo.establishedYear !== undefined) {
        const establishedYear = parseInt(req.body.additionalInfo.establishedYear);
        const currentYear = new Date().getFullYear();
        
        if (isNaN(establishedYear) || establishedYear < 1900 || establishedYear > currentYear) {
          validationErrors.push(`Established year must be a valid year between 1900 and ${currentYear}`);
        } else {
          updateData.additionalInfo.establishedYear = establishedYear;
        }
      }
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

    const updatedCompany = await CompanyManagement.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true 
      }
    );

    res.json(updatedCompany);
  } catch (error) {
    console.error('Error updating company information:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid company ID format' });
    }
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Company with this name already exists'
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE company information
router.delete('/:id', async (req, res) => {
  try {
    const company = await CompanyManagement.findByIdAndDelete(req.params.id);
    
    if (!company) {
      return res.status(404).json({ message: 'Company information not found' });
    }

    res.json({ 
      message: 'Company information deleted successfully',
      deletedCompany: company 
    });
  } catch (error) {
    console.error('Error deleting company information:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid company ID format' });
    }
    res.status(500).json({ 
      message: 'Error deleting company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to get nested object values
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

export default router;
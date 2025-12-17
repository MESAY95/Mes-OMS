// routes/employees.js
import express from 'express';
import Employee from '../models/Employee.js';

const router = express.Router();

// GET /api/employees - Get all employees with optional filtering
router.get('/', async (req, res) => {
  try {
    const { department, status, search, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    let query = {};
    
    // Filter by department
    if (department && department !== 'all') {
      query.department = department;
    }
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Search in employeeId, firstName, lastName, email, position
    if (search) {
      query.$or = [
        { employeeId: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } } // ADDED: Search in phone
      ];
    }

    // Sort configuration
    const sortConfig = {};
    const validSortFields = ['employeeId', 'firstName', 'lastName', 'department', 'position', 'salary', 'hireDate', 'status', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortConfig[sortField] = sortOrder === 'asc' ? 1 : -1;

    const employees = await Employee.find(query)
      .sort(sortConfig)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Employee.countDocuments(query);

    res.json({
      employees,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total,
      hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
      hasPrevPage: parseInt(page) > 1
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees', error: error.message });
  }
});

// GET /api/employees/:id - Get single employee
router.get('/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ message: 'Error fetching employee', error: error.message });
  }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
  try {
    const {
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      department,
      position,
      hireDate,
      salary,
      status = 'active'
    } = req.body;

    // Validate required fields
    const requiredFields = ['employeeId', 'firstName', 'lastName', 'email', 'department', 'position', 'hireDate', 'salary'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Validate hire date - Prevent future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    
    const hireDateObj = new Date(hireDate);
    hireDateObj.setHours(0, 0, 0, 0);
    
    if (hireDateObj > today) {
      return res.status(400).json({ 
        message: 'Hire date cannot be in the future' 
      });
    }

    // Validate salary - must be positive number
    if (salary <= 0) {
      return res.status(400).json({ 
        message: 'Salary must be a positive number' 
      });
    }

    // Check if employeeId or email already exists
    const existingEmployee = await Employee.findOne({
      $or: [{ employeeId }, { email }]
    });

    if (existingEmployee) {
      const conflictField = existingEmployee.employeeId === employeeId ? 'Employee ID' : 'Email';
      return res.status(409).json({ 
        message: `${conflictField} already exists` 
      });
    }

    const employee = new Employee({
      employeeId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      department,
      position: position.trim(),
      hireDate: hireDateObj,
      salary: parseFloat(salary),
      status
    });

    const savedEmployee = await employee.save();
    res.status(201).json({
      message: 'Employee created successfully',
      employee: savedEmployee
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    res.status(500).json({ message: 'Error creating employee', error: error.message });
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
  try {
    const {
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      department,
      position,
      hireDate,
      salary,
      status
    } = req.body;

    // Validate required fields
    const requiredFields = ['employeeId', 'firstName', 'lastName', 'email', 'department', 'position', 'hireDate', 'salary', 'status'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Validate status
    const validStatuses = ['active', 'inactive', 'terminated'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status. Must be one of: active, inactive, terminated' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Validate salary - must be positive number
    if (salary <= 0) {
      return res.status(400).json({ 
        message: 'Salary must be a positive number' 
      });
    }

    // Get existing employee to check original hire date
    const existingEmployee = await Employee.findById(req.params.id);
    if (!existingEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Validate hire date - FIXED: Restrict updating to date after original hire date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const newHireDate = new Date(hireDate);
    newHireDate.setHours(0, 0, 0, 0);
    
    const originalHireDate = new Date(existingEmployee.hireDate);
    originalHireDate.setHours(0, 0, 0, 0);

    // Check if new hire date is after original hire date
    if (newHireDate > originalHireDate) {
      return res.status(400).json({ 
        message: 'Cannot update hire date to a date after the original hire date' 
      });
    }

    // Check if new hire date is in the future
    if (newHireDate > today) {
      return res.status(400).json({ 
        message: 'Hire date cannot be in the future' 
      });
    }

    // Check if employeeId or email already exists (excluding current employee)
    const duplicateEmployee = await Employee.findOne({
      $and: [
        { _id: { $ne: req.params.id } },
        { $or: [{ employeeId }, { email }] }
      ]
    });

    if (duplicateEmployee) {
      const conflictField = duplicateEmployee.employeeId === employeeId ? 'Employee ID' : 'Email';
      return res.status(409).json({ 
        message: `${conflictField} already exists` 
      });
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      req.params.id,
      {
        employeeId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        department,
        position: position.trim(),
        hireDate: newHireDate,
        salary: parseFloat(salary),
        status
      },
      { 
        new: true, 
        runValidators: true 
      }
    );

    res.json({
      message: 'Employee updated successfully',
      employee: updatedEmployee
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    res.status(500).json({ message: 'Error updating employee', error: error.message });
  }
});

// PATCH /api/employees/:id - Partial update employee (for status changes)
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body;

    // Validate status
    if (!status || !['active', 'inactive', 'terminated'].includes(status)) {
      return res.status(400).json({ 
        message: 'Valid status is required (active, inactive, terminated)' 
      });
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({
      message: 'Employee status updated successfully',
      employee: updatedEmployee
    });
  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).json({ message: 'Error updating employee status', error: error.message });
  }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res) => {
  try {
    const deletedEmployee = await Employee.findByIdAndDelete(req.params.id);
    
    if (!deletedEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    res.json({ 
      message: 'Employee deleted successfully',
      employee: deletedEmployee
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ message: 'Error deleting employee', error: error.message });
  }
});

// GET /api/employees/stats/department - Get employee count by department
router.get('/stats/department', async (req, res) => {
  try {
    const stats = await Employee.aggregate([
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 },
          totalSalary: { $sum: '$salary' },
          avgSalary: { $avg: '$salary' },
          minSalary: { $min: '$salary' },
          maxSalary: { $max: '$salary' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching department stats:', error);
    res.status(500).json({ message: 'Error fetching department stats', error: error.message });
  }
});

// GET /api/employees/stats/overview - Get overall employee statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments();
    const activeEmployees = await Employee.countDocuments({ status: 'active' });
    const inactiveEmployees = await Employee.countDocuments({ status: 'inactive' });
    const terminatedEmployees = await Employee.countDocuments({ status: 'terminated' });
    
    // New hires this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newHiresThisMonth = await Employee.countDocuments({
      hireDate: { $gte: startOfMonth }
    });

    // Department count
    const departmentCount = await Employee.distinct('department').then(depts => depts.length);

    // Salary statistics
    const salaryStats = await Employee.aggregate([
      {
        $group: {
          _id: null,
          totalSalary: { $sum: '$salary' },
          avgSalary: { $avg: '$salary' },
          maxSalary: { $max: '$salary' },
          minSalary: { $min: '$salary' }
        }
      }
    ]);

    res.json({
      total: totalEmployees,
      active: activeEmployees,
      inactive: inactiveEmployees,
      terminated: terminatedEmployees,
      newHiresThisMonth,
      departments: departmentCount,
      salary: salaryStats[0] || {
        totalSalary: 0,
        avgSalary: 0,
        maxSalary: 0,
        minSalary: 0
      }
    });
  } catch (error) {
    console.error('Error fetching overview stats:', error);
    res.status(500).json({ message: 'Error fetching overview stats', error: error.message });
  }
});

// GET /api/employees/departments/list - Get list of all departments
router.get('/departments/list', async (req, res) => {
  try {
    const departments = await Employee.distinct('department');
    res.json(departments.filter(dept => dept).sort()); // Remove null/undefined values and sort
  } catch (error) {
    console.error('Error fetching departments list:', error);
    res.status(500).json({ message: 'Error fetching departments list', error: error.message });
  }
});

// GET /api/employees/export - Export employees data (for reports) - ADDED: New endpoint
router.get('/export', async (req, res) => {
  try {
    const { department, status } = req.query;
    
    let query = {};
    if (department && department !== 'all') query.department = department;
    if (status && status !== 'all') query.status = status;

    const employees = await Employee.find(query)
      .select('employeeId firstName lastName email phone department position hireDate salary status')
      .sort({ department: 1, lastName: 1 });

    res.json({
      employees,
      exportDate: new Date().toISOString(),
      total: employees.length,
      filters: {
        department: department || 'all',
        status: status || 'all'
      }
    });
  } catch (error) {
    console.error('Error exporting employees:', error);
    res.status(500).json({ message: 'Error exporting employees', error: error.message });
  }
});

export default router;
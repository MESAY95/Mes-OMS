import express from 'express';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';

const router = express.Router();

// Get all leaves with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee,
      leaveType,
      status,
      startDate,
      endDate
    } = req.query;

    const filter = {};

    if (employee) {
      filter.employee = employee;
    }

    if (leaveType) {
      filter.leaveType = leaveType;
    }

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.$and = [];
      if (startDate) {
        filter.$and.push({ startDate: { $gte: new Date(startDate) } });
      }
      if (endDate) {
        filter.$and.push({ endDate: { $lte: new Date(endDate) } });
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: {
        path: 'employee',
        select: 'employeeId firstName lastName email department'
      }
    };

    const leaves = await Leave.find(filter)
      .populate('employee', 'employeeId firstName lastName email department')
      .populate('approvedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalRecords = await Leave.countDocuments(filter);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      leaves,
      totalPages,
      totalRecords,
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching leaves:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get leave statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate, leaveType } = req.query;

    const filter = {};

    if (startDate || endDate) {
      filter.$and = [];
      if (startDate) {
        filter.$and.push({ startDate: { $gte: new Date(startDate) } });
      }
      if (endDate) {
        filter.$and.push({ endDate: { $lte: new Date(endDate) } });
      }
    }

    if (leaveType) {
      filter.leaveType = leaveType;
    }

    const total = await Leave.countDocuments(filter);
    const pending = await Leave.countDocuments({ ...filter, status: 'pending' });
    const approved = await Leave.countDocuments({ ...filter, status: 'approved' });
    const rejected = await Leave.countDocuments({ ...filter, status: 'rejected' });

    // Leave type distribution
    const leaveTypeStats = await Leave.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$leaveType',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      total,
      pending,
      approved,
      rejected,
      leaveTypeStats
    });
  } catch (error) {
    console.error('Error fetching leave stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single leave by ID
router.get('/:id', async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employee', 'employeeId firstName lastName email department position')
      .populate('approvedBy', 'firstName lastName');

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    res.json(leave);
  } catch (error) {
    console.error('Error fetching leave:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new leave request
router.post('/', async (req, res) => {
  try {
    const {
      employee,
      leaveType,
      startDate,
      endDate,
      reason,
      comments
    } = req.body;

    // Validate required fields
    if (!employee || !leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Check if employee exists
    const employeeExists = await Employee.findById(employee);
    if (!employeeExists) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check for overlapping leave requests
    const overlappingLeave = await Leave.findOne({
      employee,
      status: { $in: ['pending', 'approved'] },
      $or: [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      ]
    });

    if (overlappingLeave) {
      return res.status(400).json({ 
        message: 'Overlapping leave request exists for this employee' 
      });
    }

    const leave = new Leave({
      employee,
      leaveType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      comments,
      status: 'pending'
    });

    await leave.save();

    // Populate employee details before sending response
    await leave.populate('employee', 'employeeId firstName lastName email department');

    res.status(201).json(leave);
  } catch (error) {
    console.error('Error creating leave:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update leave request
router.put('/:id', async (req, res) => {
  try {
    const {
      leaveType,
      startDate,
      endDate,
      reason,
      status,
      comments
    } = req.body;

    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Update fields if provided
    if (leaveType) leave.leaveType = leaveType;
    if (startDate) leave.startDate = new Date(startDate);
    if (endDate) leave.endDate = new Date(endDate);
    if (reason) leave.reason = reason;
    if (comments !== undefined) leave.comments = comments;

    // Handle status change
    if (status && status !== leave.status) {
      leave.status = status;
      if (status === 'approved') {
        leave.approvedBy = req.user?.id; // Assuming you have user authentication
        leave.approvedAt = new Date();
      } else if (status === 'rejected') {
        leave.approvedBy = req.user?.id;
        leave.approvedAt = new Date();
      }
    }

    await leave.save();

    // Populate before sending response
    await leave.populate('employee', 'employeeId firstName lastName email department');
    await leave.populate('approvedBy', 'firstName lastName');

    res.json(leave);
  } catch (error) {
    console.error('Error updating leave:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete leave request
router.delete('/:id', async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    await Leave.findByIdAndDelete(req.params.id);

    res.json({ message: 'Leave deleted successfully' });
  } catch (error) {
    console.error('Error deleting leave:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get leaves by employee
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const leaves = await Leave.find({ employee: employeeId })
      .populate('employee', 'employeeId firstName lastName email department')
      .populate('approvedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalRecords = await Leave.countDocuments({ employee: employeeId });

    res.json({
      leaves,
      totalRecords,
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching employee leaves:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
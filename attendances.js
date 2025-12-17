import express from 'express';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';

const router = express.Router();

// GET /api/attendance - Get all attendance records with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      employeeId, 
      department, 
      startDate, 
      endDate,
      status 
    } = req.query;

    const query = {};

    // Build query based on filters
    if (employeeId) query.employeeId = employeeId;
    if (department) query.department = department;
    if (status) query.status = status;
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { date: -1, checkIn: -1 }
    };

    const attendance = await Attendance.find(query)
      .limit(options.limit * 1)
      .skip((options.page - 1) * options.limit)
      .sort(options.sort);

    const total = await Attendance.countDocuments(query);

    res.json({
      attendance,
      totalPages: Math.ceil(total / options.limit),
      currentPage: options.page,
      totalRecords: total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/attendance/:id - Get single attendance record
router.get('/:id', async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/attendance/employee/:employeeId - Get attendance for specific employee
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { employeeId: req.params.employeeId };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendance = await Attendance.find(query).sort({ date: -1 });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/attendance - Create new attendance record
router.post('/', async (req, res) => {
  try {
    const {
      employeeId,
      date,
      checkIn,
      checkOut,
      status,
      leaveType,
      notes
    } = req.body;

    // Check if employee exists
    const employee = await Employee.findOne({ employeeId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if attendance record already exists for this employee on this date
    const existingAttendance = await Attendance.findOne({ 
      employeeId, 
      date: new Date(date) 
    });

    if (existingAttendance) {
      return res.status(400).json({ 
        message: 'Attendance record already exists for this employee on the selected date' 
      });
    }

    // Calculate total hours if check-in and check-out are provided
    let totalHours = 0;
    if (checkIn && checkOut) {
      const checkInTime = new Date(checkIn);
      const checkOutTime = new Date(checkOut);
      const diff = checkOutTime - checkInTime;
      totalHours = (diff / (1000 * 60 * 60)).toFixed(2); // Convert to hours
    }

    const attendance = new Attendance({
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      department: employee.department,
      position: employee.position,
      date: new Date(date),
      checkIn: checkIn ? new Date(checkIn) : null,
      checkOut: checkOut ? new Date(checkOut) : null,
      totalHours: parseFloat(totalHours),
      status,
      leaveType: status === 'On Leave' ? leaveType : 'None',
      notes,
      overtime: totalHours > 8 ? totalHours - 8 : 0
    });

    const newAttendance = await attendance.save();
    res.status(201).json(newAttendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT /api/attendance/:id - Update attendance record
router.put('/:id', async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const {
      checkIn,
      checkOut,
      status,
      leaveType,
      notes
    } = req.body;

    // Update fields
    if (checkIn !== undefined) attendance.checkIn = checkIn ? new Date(checkIn) : null;
    if (checkOut !== undefined) attendance.checkOut = checkOut ? new Date(checkOut) : null;
    if (status) attendance.status = status;
    if (leaveType) attendance.leaveType = leaveType;
    if (notes !== undefined) attendance.notes = notes;

    // Recalculate total hours if check-in or check-out changed
    if ((checkIn !== undefined || checkOut !== undefined) && attendance.checkIn && attendance.checkOut) {
      const diff = attendance.checkOut - attendance.checkIn;
      attendance.totalHours = parseFloat((diff / (1000 * 60 * 60)).toFixed(2));
      attendance.overtime = attendance.totalHours > 8 ? attendance.totalHours - 8 : 0;
    }

    const updatedAttendance = await attendance.save();
    res.json(updatedAttendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE /api/attendance/:id - Delete attendance record
router.delete('/:id', async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    await Attendance.deleteOne({ _id: req.params.id });
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/attendance/stats/summary - Get attendance summary statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    
    const query = {};
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (department) query.department = department;

    const stats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRecords = await Attendance.countDocuments(query);
    
    const summary = {
      total: totalRecords,
      present: stats.find(s => s._id === 'Present')?.count || 0,
      absent: stats.find(s => s._id === 'Absent')?.count || 0,
      late: stats.find(s => s._id === 'Late')?.count || 0,
      halfDay: stats.find(s => s._id === 'Half-day')?.count || 0,
      onLeave: stats.find(s => s._id === 'On Leave')?.count || 0
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
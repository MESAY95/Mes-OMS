import express from 'express';
import Salary from '../models/Salary.js';
import User from '../models/User.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all salaries (Admin only)
router.get('/', adminAuth, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            employee, 
            status, 
            payPeriodStart, 
            payPeriodEnd,
            department 
        } = req.query;
        
        const filter = {};
        
        // Employee filter
        if (employee) {
            filter.employee = employee;
        }
        
        // Status filter
        if (status) {
            filter.status = status;
        }
        
        // Pay period filter
        if (payPeriodStart || payPeriodEnd) {
            filter.payPeriod = {};
            if (payPeriodStart) filter.payPeriod.$gte = new Date(payPeriodStart);
            if (payPeriodEnd) filter.payPeriod.$lte = new Date(payPeriodEnd);
        }

        let query = Salary.find(filter)
            .populate('employee', 'firstName lastName employeeId department position')
            .sort({ payPeriod: -1 });

        // Department filter through employee
        if (department) {
            query = query.populate({
                path: 'employee',
                match: { department }
            });
        }

        const salaries = await query
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Filter out salaries where employee doesn't match department
        const filteredSalaries = department ? 
            salaries.filter(salary => salary.employee !== null) : 
            salaries;

        const total = await Salary.countDocuments(filter);

        // Calculate total amounts
        const totalStats = await Salary.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalBasic: { $sum: '$basicSalary' },
                    totalAllowances: { $sum: '$allowances' },
                    totalDeductions: { $sum: '$deductions' },
                    totalNet: { $sum: '$netSalary' }
                }
            }
        ]);

        res.json({
            salaries: filteredSalaries,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total,
            totals: totalStats[0] || {
                totalBasic: 0,
                totalAllowances: 0,
                totalDeductions: 0,
                totalNet: 0
            }
        });
    } catch (error) {
        console.error('Get salaries error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get employee's own salary history
router.get('/my-salary', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        
        const filter = { employee: req.user._id };
        if (status) filter.status = status;

        const salaries = await Salary.find(filter)
            .populate('employee', 'firstName lastName employeeId department position')
            .sort({ payPeriod: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Salary.countDocuments(filter);

        res.json({
            salaries,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get my salary error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get salary by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const salary = await Salary.findById(req.params.id)
            .populate('employee', 'firstName lastName employeeId department position email phone');

        if (!salary) {
            return res.status(404).json({ message: 'Salary record not found' });
        }

        // Check if employee is accessing their own salary or admin
        if (req.user.role !== 'admin' && salary.employee._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Access denied' });
        }

        res.json(salary);
    } catch (error) {
        console.error('Get salary by ID error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create salary record (Admin only)
router.post('/', adminAuth, async (req, res) => {
    try {
        const { employee, basicSalary, allowances, deductions, payPeriod, status } = req.body;

        // Check if employee exists and is active
        const employeeData = await User.findOne({ 
            _id: employee, 
            isActive: true 
        });

        if (!employeeData) {
            return res.status(400).json({ message: 'Employee not found or inactive' });
        }

        // Check for duplicate salary record for same employee and pay period
        const existingSalary = await Salary.findOne({
            employee,
            payPeriod: new Date(payPeriod)
        });

        if (existingSalary) {
            return res.status(400).json({ 
                message: 'Salary record already exists for this employee and pay period' 
            });
        }

        const salary = new Salary({
            employee,
            basicSalary,
            allowances: allowances || 0,
            deductions: deductions || 0,
            payPeriod: new Date(payPeriod),
            status: status || 'pending'
        });

        await salary.save();
        await salary.populate('employee', 'firstName lastName employeeId department position');

        res.status(201).json(salary);
    } catch (error) {
        console.error('Create salary error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Validation error', 
                errors: Object.values(error.errors).map(e => e.message) 
            });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// Update salary record (Admin only)
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const { basicSalary, allowances, deductions, payPeriod, status } = req.body;

        const salary = await Salary.findByIdAndUpdate(
            req.params.id,
            {
                basicSalary,
                allowances,
                deductions,
                ...(payPeriod && { payPeriod: new Date(payPeriod) }),
                ...(status && { status })
            },
            { new: true, runValidators: true }
        ).populate('employee', 'firstName lastName employeeId department position');

        if (!salary) {
            return res.status(404).json({ message: 'Salary record not found' });
        }

        res.json(salary);
    } catch (error) {
        console.error('Update salary error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Validation error', 
                errors: Object.values(error.errors).map(e => e.message) 
            });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete salary record (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const salary = await Salary.findByIdAndDelete(req.params.id);

        if (!salary) {
            return res.status(404).json({ message: 'Salary record not found' });
        }

        res.json({ message: 'Salary record deleted successfully' });
    } catch (error) {
        console.error('Delete salary error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Process salaries for multiple employees (Admin only)
router.post('/process-batch', adminAuth, async (req, res) => {
    try {
        const { employees, payPeriod, basicSalary, allowances, deductions, status } = req.body;

        if (!employees || !Array.isArray(employees) || employees.length === 0) {
            return res.status(400).json({ message: 'Employees array is required' });
        }

        const payPeriodDate = new Date(payPeriod);
        const results = {
            successful: [],
            failed: []
        };

        for (const employeeId of employees) {
            try {
                // Check if salary already exists for this period
                const existingSalary = await Salary.findOne({
                    employee: employeeId,
                    payPeriod: payPeriodDate
                });

                if (existingSalary) {
                    results.failed.push({
                        employee: employeeId,
                        error: 'Salary record already exists for this period'
                    });
                    continue;
                }

                // Get employee data
                const employee = await User.findById(employeeId);
                if (!employee || !employee.isActive) {
                    results.failed.push({
                        employee: employeeId,
                        error: 'Employee not found or inactive'
                    });
                    continue;
                }

                // Use employee's base salary if not provided
                const employeeBasicSalary = basicSalary || employee.salary || 0;

                const salary = new Salary({
                    employee: employeeId,
                    basicSalary: employeeBasicSalary,
                    allowances: allowances || 0,
                    deductions: deductions || 0,
                    payPeriod: payPeriodDate,
                    status: status || 'pending'
                });

                await salary.save();
                results.successful.push({
                    employee: employeeId,
                    salaryId: salary._id,
                    netSalary: salary.netSalary
                });

            } catch (error) {
                results.failed.push({
                    employee: employeeId,
                    error: error.message
                });
            }
        }

        res.json({
            message: `Processed ${results.successful.length} salaries successfully, ${results.failed.length} failed`,
            results
        });
    } catch (error) {
        console.error('Process batch salaries error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update salary status (Admin only)
router.put('/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;

        if (!['pending', 'paid', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const salary = await Salary.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        ).populate('employee', 'firstName lastName employeeId department position');

        if (!salary) {
            return res.status(404).json({ message: 'Salary record not found' });
        }

        res.json(salary);
    } catch (error) {
        console.error('Update salary status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get salary statistics for dashboard
router.get('/stats/overview', auth, async (req, res) => {
    try {
        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        let matchFilter = {
            payPeriod: { $gte: firstDay, $lte: lastDay }
        };

        // If not admin, only show own stats
        if (req.user.role !== 'admin') {
            matchFilter.employee = req.user._id;
        }

        const monthlyStats = await Salary.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: null,
                    totalBasic: { $sum: '$basicSalary' },
                    totalAllowances: { $sum: '$allowances' },
                    totalDeductions: { $sum: '$deductions' },
                    totalNet: { $sum: '$netSalary' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const statusStats = await Salary.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: '$status',
                    totalAmount: { $sum: '$netSalary' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Department-wise statistics (admin only)
        let departmentStats = [];
        if (req.user.role === 'admin') {
            departmentStats = await Salary.aggregate([
                { $match: { payPeriod: { $gte: firstDay, $lte: lastDay } } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'employee',
                        foreignField: '_id',
                        as: 'employee'
                    }
                },
                { $unwind: '$employee' },
                {
                    $group: {
                        _id: '$employee.department',
                        totalNet: { $sum: '$netSalary' },
                        employeeCount: { $addToSet: '$employee' }
                    }
                },
                {
                    $project: {
                        department: '$_id',
                        totalNet: 1,
                        employeeCount: { $size: '$employeeCount' }
                    }
                },
                { $sort: { totalNet: -1 } }
            ]);
        }

        // Yearly trend (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const yearlyTrend = await Salary.aggregate([
            {
                $match: {
                    payPeriod: { $gte: twelveMonthsAgo, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$payPeriod' },
                        month: { $month: '$payPeriod' }
                    },
                    totalNet: { $sum: '$netSalary' },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            },
            {
                $project: {
                    period: {
                        $concat: [
                            { $toString: '$_id.year' },
                            '-',
                            { $toString: '$_id.month' }
                        ]
                    },
                    totalNet: 1,
                    count: 1
                }
            }
        ]);

        const stats = monthlyStats[0] || {
            totalBasic: 0,
            totalAllowances: 0,
            totalDeductions: 0,
            totalNet: 0,
            count: 0
        };

        res.json({
            monthly: stats,
            status: statusStats,
            departments: departmentStats,
            trend: yearlyTrend,
            currency: 'ETB'
        });
    } catch (error) {
        console.error('Get salary stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get payroll summary for a specific period
router.get('/payroll/summary', adminAuth, async (req, res) => {
    try {
        const { payPeriod } = req.query;

        if (!payPeriod) {
            return res.status(400).json({ message: 'Pay period is required' });
        }

        const payPeriodDate = new Date(payPeriod);
        const nextMonth = new Date(payPeriodDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const payrollSummary = await Salary.aggregate([
            {
                $match: {
                    payPeriod: {
                        $gte: payPeriodDate,
                        $lt: nextMonth
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'employee'
                }
            },
            { $unwind: '$employee' },
            {
                $group: {
                    _id: '$employee.department',
                    totalBasic: { $sum: '$basicSalary' },
                    totalAllowances: { $sum: '$allowances' },
                    totalDeductions: { $sum: '$deductions' },
                    totalNet: { $sum: '$netSalary' },
                    employeeCount: { $addToSet: '$employee' }
                }
            },
            {
                $project: {
                    department: '$_id',
                    totalBasic: 1,
                    totalAllowances: 1,
                    totalDeductions: 1,
                    totalNet: 1,
                    employeeCount: { $size: '$employeeCount' },
                    averageSalary: { $divide: ['$totalNet', { $size: '$employeeCount' }] }
                }
            },
            { $sort: { totalNet: -1 } }
        ]);

        const statusSummary = await Salary.aggregate([
            {
                $match: {
                    payPeriod: {
                        $gte: payPeriodDate,
                        $lt: nextMonth
                    }
                }
            },
            {
                $group: {
                    _id: '$status',
                    totalAmount: { $sum: '$netSalary' },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            period: payPeriodDate.toISOString().split('T')[0],
            summary: payrollSummary,
            status: statusSummary,
            currency: 'ETB'
        });
    } catch (error) {
        console.error('Get payroll summary error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Export salary data (Admin only)
router.get('/export/data', adminAuth, async (req, res) => {
    try {
        const { format = 'json', payPeriodStart, payPeriodEnd } = req.query;

        const filter = {};
        if (payPeriodStart || payPeriodEnd) {
            filter.payPeriod = {};
            if (payPeriodStart) filter.payPeriod.$gte = new Date(payPeriodStart);
            if (payPeriodEnd) filter.payPeriod.$lte = new Date(payPeriodEnd);
        }

        const salaries = await Salary.find(filter)
            .populate('employee', 'firstName lastName employeeId department position email')
            .sort({ payPeriod: -1 });

        if (format === 'csv') {
            // Simple CSV export
            const csvData = [
                ['Employee ID', 'Employee Name', 'Department', 'Position', 'Basic Salary', 'Allowances', 'Deductions', 'Net Salary', 'Pay Period', 'Status']
            ];

            salaries.forEach(salary => {
                csvData.push([
                    salary.employee.employeeId,
                    `${salary.employee.firstName} ${salary.employee.lastName}`,
                    salary.employee.department,
                    salary.employee.position,
                    salary.basicSalary,
                    salary.allowances,
                    salary.deductions,
                    salary.netSalary,
                    salary.payPeriod.toISOString().split('T')[0],
                    salary.status
                ]);
            });

            const csvContent = csvData.map(row => row.join(',')).join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=salaries-export.csv');
            return res.send(csvContent);
        }

        // Default JSON export
        res.json({
            exportDate: new Date().toISOString(),
            totalRecords: salaries.length,
            data: salaries
        });

    } catch (error) {
        console.error('Export salary data error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
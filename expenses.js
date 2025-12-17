import express from 'express';
import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import { check, validationResult } from 'express-validator';

const router = express.Router();

// Validation middleware for creating expenses (without expenseCode and createdBy)
const validateExpenseForCreate = [
    check('description').notEmpty().withMessage('Description is required').trim(),
    check('category').isIn(['Direct', 'Indirect', 'Investment', 'Other']).withMessage('Invalid category'),
    check('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    check('department').notEmpty().withMessage('Department is required').trim(),
    check('paidTo').notEmpty().withMessage('Paid To is required').trim(),
    check('paymentMethod').isIn(['cash', 'bank_transfer', 'check', 'credit_card', 'mobile_payment']).withMessage('Invalid payment method'),
    check('date').isISO8601().withMessage('Invalid date format'),
    check('currency').optional().isString().trim(),
    check('budgetCode').optional().isString().trim(),
    check('referenceNumber').optional().isString().trim(),
    check('receiptUrl')
        .optional()
        .custom((value) => {
            if (!value || value.trim() === '') return true;
            try {
                new URL(value);
                return true;
            } catch (error) {
                throw new Error('Invalid URL format');
            }
        })
        .withMessage('Invalid URL format'),
    check('remarks').optional().isString().trim()
];

// Validation middleware for updating expenses
const validateExpenseForUpdate = [
    check('description').optional().notEmpty().withMessage('Description is required').trim(),
    check('category').optional().isIn(['Direct', 'Indirect', 'Investment', 'Other']).withMessage('Invalid category'),
    check('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    check('department').optional().notEmpty().withMessage('Department is required').trim(),
    check('paidTo').optional().notEmpty().withMessage('Paid To is required').trim(),
    check('paymentMethod').optional().isIn(['cash', 'bank_transfer', 'check', 'credit_card', 'mobile_payment']).withMessage('Invalid payment method'),
    check('date').optional().isISO8601().withMessage('Invalid date format'),
    check('currency').optional().isString().trim(),
    check('budgetCode').optional().isString().trim(),
    check('referenceNumber').optional().isString().trim(),
    check('receiptUrl')
        .optional()
        .custom((value) => {
            if (!value || value.trim() === '') return true;
            try {
                new URL(value);
                return true;
            } catch (error) {
                throw new Error('Invalid URL format');
            }
        })
        .withMessage('Invalid URL format'),
    check('remarks').optional().isString().trim()
];

// Helper function to build filter from query parameters
const buildFilter = (query) => {
    const filter = {};
    
    // Text search across multiple fields
    if (query.search) {
        filter.$or = [
            { description: { $regex: query.search, $options: 'i' } },
            { expenseCode: { $regex: query.search, $options: 'i' } },
            { paidTo: { $regex: query.search, $options: 'i' } },
            { referenceNumber: { $regex: query.search, $options: 'i' } }
        ];
    }
    
    // Individual filters
    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;
    if (query.department) filter.department = query.department;
    if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
    
    // Amount range filter
    if (query.minAmount || query.maxAmount) {
        filter.amount = {};
        if (query.minAmount) filter.amount.$gte = parseFloat(query.minAmount);
        if (query.maxAmount) filter.amount.$lte = parseFloat(query.maxAmount);
    }
    
    // Date range filter
    if (query.startDate || query.endDate) {
        filter.date = {};
        if (query.startDate) {
            const startDate = new Date(query.startDate);
            startDate.setHours(0, 0, 0, 0);
            filter.date.$gte = startDate;
        }
        if (query.endDate) {
            const endDate = new Date(query.endDate);
            endDate.setHours(23, 59, 59, 999);
            filter.date.$lte = endDate;
        }
    }
    
    return filter;
};

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

// ==================== GET ALL EXPENSES ====================
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            category, 
            status, 
            department, 
            paymentMethod,
            search,
            minAmount,
            maxAmount,
            startDate,
            endDate,
            sortBy = 'date',
            sortOrder = 'desc'
        } = req.query;
        
        console.log('Fetching expenses with filters:', req.query);
        
        // Build filter object
        const filter = buildFilter(req.query);
        
        // Validate pagination parameters
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        
        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Fetch expenses with pagination
        const expenses = await Expense.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .lean();
        
        // Get total count
        const total = await Expense.countDocuments(filter);
        
        // Calculate total amount
        const totalAmountResult = await Expense.aggregate([
            { $match: filter },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const totalAmount = totalAmountResult[0]?.total || 0;
        
        res.status(200).json({
            success: true,
            data: expenses,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total,
                itemsPerPage: limitNum
            },
            summary: {
                totalAmount,
                averageAmount: total > 0 ? totalAmount / total : 0
            },
            filters: req.query
        });
        
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching expenses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== CREATE EXPENSE ====================
router.post('/', validateExpenseForCreate, async (req, res) => {
    try {
        // Log incoming request for debugging
        console.log('CREATE EXPENSE REQUEST:', req.body);
        
        // Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array().map(err => ({
                    field: err.param,
                    message: err.msg,
                    value: err.value
                }))
            });
        }
        
        // Set default values for new expenses
        const expenseData = {
            ...req.body,
            status: 'pending'
        };
        
        // Validate amount
        if (expenseData.amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be greater than 0'
            });
        }
        
        // Validate date format
        if (expenseData.date) {
            const date = new Date(expenseData.date);
            if (isNaN(date.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format'
                });
            }
            expenseData.date = date;
        }
        
        // Ensure receiptUrl is either valid URL or empty string
        if (expenseData.receiptUrl && expenseData.receiptUrl.trim() === '') {
            expenseData.receiptUrl = '';
        }
        
        // Add createdBy from authenticated user or use a default for development
        if (process.env.NODE_ENV === 'production') {
            // In production, require authenticated user
            if (!req.user?.id) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }
            expenseData.createdBy = req.user.id;
        } else {
            // In development, use a dummy user ID
            expenseData.createdBy = new mongoose.Types.ObjectId();
        }
        
        // Create and save expense
        const expense = new Expense(expenseData);
        await expense.save();
        
        console.log('Expense created successfully:', expense.expenseCode);
        
        res.status(201).json({
            success: true,
            message: 'Expense created successfully',
            data: expense
        });
        
    } catch (error) {
        console.error('Error creating expense:', error);
        
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }));
            return res.status(400).json({
                success: false,
                message: 'Mongoose validation error',
                errors: validationErrors
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Expense code already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error creating expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== GET EXPENSE BY ID ====================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ObjectId
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense ID format'
            });
        }
        
        const expense = await Expense.findById(id);
        
        if (!expense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found'
            });
        }
        
        res.status(200).json({
            success: true,
            data: expense
        });
        
    } catch (error) {
        console.error('Error fetching expense:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== UPDATE EXPENSE ====================
router.put('/:id', validateExpenseForUpdate, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ObjectId
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense ID format'
            });
        }
        
        // Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }
        
        console.log('Updating expense:', id, req.body);
        
        // Check if expense exists
        const existingExpense = await Expense.findById(id);
        if (!existingExpense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found'
            });
        }
        
        // Prevent changing status via PUT (use PATCH /status instead)
        const { status, ...updateData } = req.body;
        
        // Validate date
        if (updateData.date) {
            const date = new Date(updateData.date);
            if (isNaN(date.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format'
                });
            }
            updateData.date = date;
        }
        
        // Ensure receiptUrl is either valid URL or empty string
        if (updateData.receiptUrl && updateData.receiptUrl.trim() === '') {
            updateData.receiptUrl = '';
        }
        
        // Add updatedBy if user is authenticated
        if (req.user?.id) {
            updateData.updatedBy = req.user.id;
        }
        
        // Update expense
        const expense = await Expense.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        console.log('Expense updated successfully:', expense.expenseCode);
        
        res.status(200).json({
            success: true,
            message: 'Expense updated successfully',
            data: expense
        });
        
    } catch (error) {
        console.error('Error updating expense:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error updating expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== DELETE EXPENSE ====================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ObjectId
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense ID format'
            });
        }
        
        console.log('Deleting expense:', id);
        
        const expense = await Expense.findByIdAndDelete(id);
        
        if (!expense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found'
            });
        }
        
        console.log('Expense deleted successfully:', expense.expenseCode);
        
        res.status(200).json({
            success: true,
            message: 'Expense deleted successfully',
            data: {
                id: expense._id,
                expenseCode: expense.expenseCode,
                description: expense.description
            }
        });
        
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== UPDATE EXPENSE STATUS ====================
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;
        
        // Validate ObjectId
        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense ID format'
            });
        }
        
        // Validate status
        const validStatuses = ['pending', 'approved', 'rejected', 'paid'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
            });
        }
        
        console.log('Updating expense status:', id, status);
        
        // Check if expense exists
        const expense = await Expense.findById(id);
        if (!expense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found'
            });
        }
        
        // Prepare update data
        const updateData = { status };
        
        // Add approval info if being approved
        if (status === 'approved') {
            updateData.approvedBy = req.user?.id || null;
            updateData.approvedAt = new Date();
        }
        
        // Add updatedBy if user is authenticated
        if (req.user?.id) {
            updateData.updatedBy = req.user.id;
        }
        
        // Add remarks if provided
        if (remarks) {
            updateData.remarks = expense.remarks 
                ? `${expense.remarks}\n[${new Date().toISOString()}] ${remarks}`
                : `[${new Date().toISOString()}] ${remarks}`;
        }
        
        // Update expense
        const updatedExpense = await Expense.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        console.log('Expense status updated successfully:', updatedExpense.expenseCode, '->', status);
        
        res.status(200).json({
            success: true,
            message: `Expense ${status} successfully`,
            data: updatedExpense
        });
        
    } catch (error) {
        console.error('Error updating expense status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating expense status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== BULK STATUS UPDATE ====================
router.patch('/bulk/status', async (req, res) => {
    try {
        const { expenseIds, status, remarks } = req.body;
        
        // Validate input
        if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'expenseIds must be a non-empty array'
            });
        }
        
        // Validate status
        const validStatuses = ['pending', 'approved', 'rejected', 'paid'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
            });
        }
        
        console.log('Bulk updating status for', expenseIds.length, 'expenses to', status);
        
        // Validate all IDs
        const invalidIds = expenseIds.filter(id => !isValidObjectId(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid expense IDs',
                invalidIds
            });
        }
        
        // Prepare update data
        const updateData = { 
            status,
            updatedBy: req.user?.id || null
        };
        
        // Add approval info if being approved
        if (status === 'approved') {
            updateData.approvedBy = req.user?.id || null;
            updateData.approvedAt = new Date();
        }
        
        // Add remarks if provided
        if (remarks) {
            updateData.$push = {
                remarks: `[${new Date().toISOString()}] Bulk update: ${remarks}`
            };
        }
        
        // Update expenses
        const result = await Expense.updateMany(
            { _id: { $in: expenseIds } },
            updateData
        );
        
        console.log('Bulk status update complete:', result);
        
        res.status(200).json({
            success: true,
            message: `Updated ${result.modifiedCount} expense(s) to ${status}`,
            data: {
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                status
            }
        });
        
    } catch (error) {
        console.error('Error in bulk status update:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating expenses status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== EXPENSE STATISTICS ====================
router.get('/stats/overview', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.date = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                dateFilter.date.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.date.$lte = end;
            }
        }
        
        // Current month as default
        if (!startDate && !endDate) {
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            dateFilter.date = { $gte: firstDay, $lte: lastDay };
        }
        
        // Total expenses for approved/paid
        const totalExpenses = await Expense.aggregate([
            { 
                $match: {
                    ...dateFilter,
                    status: { $in: ['approved', 'paid'] }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        
        // Expenses by category
        const expensesByCategory = await Expense.aggregate([
            { 
                $match: {
                    ...dateFilter,
                    status: { $in: ['approved', 'paid'] }
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 },
                    average: { $avg: '$amount' }
                }
            },
            { $sort: { total: -1 } }
        ]);
        
        // Status distribution
        const statusCounts = await Expense.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    averageAmount: { $avg: '$amount' }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        // Monthly trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const monthlyTrend = await Expense.aggregate([
            {
                $match: {
                    date: { $gte: sixMonthsAgo },
                    status: { $in: ['approved', 'paid'] }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$date' },
                        month: { $month: '$date' }
                    },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            {
                $project: {
                    _id: 0,
                    period: {
                        $concat: [
                            { $toString: '$_id.year' },
                            '-',
                            { $toString: { $lpad: ['$_id.month', 2, '0'] } }
                        ]
                    },
                    total: 1,
                    count: 1
                }
            }
        ]);
        
        // Department-wise expenses
        const expensesByDepartment = await Expense.aggregate([
            { 
                $match: {
                    ...dateFilter,
                    status: { $in: ['approved', 'paid'] }
                }
            },
            {
                $group: {
                    _id: '$department',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } },
            { $limit: 10 }
        ]);
        
        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalAmount: totalExpenses[0]?.total || 0,
                    totalCount: totalExpenses[0]?.count || 0,
                    averageAmount: totalExpenses[0]?.count > 0 
                        ? totalExpenses[0].total / totalExpenses[0].count 
                        : 0
                },
                byCategory: expensesByCategory,
                byStatus: statusCounts,
                monthlyTrend: monthlyTrend,
                byDepartment: expensesByDepartment,
                dateRange: {
                    startDate: dateFilter.date?.$gte || new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                    endDate: dateFilter.date?.$lte || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999)
                }
            }
        });
        
    } catch (error) {
        console.error('Error fetching expense statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching expense statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== EXPENSE SUMMARY BY PERIOD ====================
router.get('/summary/period', async (req, res) => {
    try {
        const { 
            period = 'monthly', 
            year = new Date().getFullYear(),
            limit = 12 
        } = req.query;
        
        let groupFormat;
        let dateFormat;
        
        switch (period) {
            case 'daily':
                groupFormat = { 
                    $dateToString: { 
                        format: "%Y-%m-%d", 
                        date: "$date" 
                    } 
                };
                dateFormat = 'YYYY-MM-DD';
                break;
            case 'weekly':
                groupFormat = { 
                    $dateToString: { 
                        format: "%Y-%W", 
                        date: "$date" 
                    } 
                };
                dateFormat = 'YYYY-WW';
                break;
            case 'monthly':
                groupFormat = { 
                    $dateToString: { 
                        format: "%Y-%m", 
                        date: "$date" 
                    } 
                };
                dateFormat = 'YYYY-MM';
                break;
            case 'yearly':
                groupFormat = { 
                    $dateToString: { 
                        format: "%Y", 
                        date: "$date" 
                    } 
                };
                dateFormat = 'YYYY';
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid period. Must be: daily, weekly, monthly, yearly'
                });
        }
        
        // Calculate date range
        const startDate = new Date(`${year}-01-01`);
        const endDate = new Date(`${year}-12-31`);
        
        const summary = await Expense.aggregate([
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate },
                    status: { $in: ['approved', 'paid'] }
                }
            },
            {
                $group: {
                    _id: groupFormat,
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 },
                    categories: {
                        $push: {
                            category: "$category",
                            amount: "$amount"
                        }
                    }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: parseInt(limit) }
        ]);
        
        // Calculate overall statistics
        const statistics = await Expense.aggregate([
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate },
                    status: { $in: ['approved', 'paid'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" },
                    totalCount: { $sum: 1 },
                    averageAmount: { $avg: "$amount" },
                    maxAmount: { $max: "$amount" },
                    minAmount: { $min: "$amount" },
                    standardDeviation: { $stdDevSamp: "$amount" }
                }
            }
        ]);
        
        res.status(200).json({
            success: true,
            data: {
                period,
                year,
                summary,
                statistics: statistics[0] || {},
                format: dateFormat
            }
        });
        
    } catch (error) {
        console.error('Error fetching period summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching period summary',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== EXPORT EXPENSES ====================
router.get('/export/data', async (req, res) => {
    try {
        const { format = 'json', ...filterParams } = req.query;
        
        // Build filter from query params
        const filter = buildFilter(filterParams);
        
        const expenses = await Expense.find(filter)
            .sort({ date: -1 })
            .lean();
        
        if (format === 'csv') {
            // Convert to CSV
            const headers = [
                'Expense Code',
                'Description',
                'Category',
                'Amount',
                'Currency',
                'Date',
                'Department',
                'Status',
                'Payment Method',
                'Paid To',
                'Reference Number',
                'Approved By',
                'Approved At',
                'Receipt URL',
                'Remarks',
                'Created At',
                'Updated At'
            ];
            
            const csvData = expenses.map(expense => [
                expense.expenseCode,
                `"${expense.description.replace(/"/g, '""')}"`,
                expense.category,
                expense.amount,
                expense.currency,
                new Date(expense.date).toISOString().split('T')[0],
                expense.department,
                expense.status,
                expense.paymentMethod,
                `"${expense.paidTo.replace(/"/g, '""')}"`,
                expense.referenceNumber || '',
                expense.approvedBy || '',
                expense.approvedAt ? new Date(expense.approvedAt).toISOString() : '',
                expense.receiptUrl || '',
                expense.remarks ? `"${expense.remarks.replace(/"/g, '""')}"` : '',
                new Date(expense.createdAt).toISOString(),
                new Date(expense.updatedAt).toISOString()
            ]);
            
            const csv = [
                headers.join(','),
                ...csvData.map(row => row.join(','))
            ].join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
            return res.send(csv);
        }
        
        // Default to JSON
        res.status(200).json({
            success: true,
            data: expenses,
            count: expenses.length,
            exportedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error exporting expenses:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting expenses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== BULK CREATE EXPENSES ====================
router.post('/bulk', async (req, res) => {
    try {
        const expenses = req.body;
        
        if (!Array.isArray(expenses) || expenses.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Request body must be a non-empty array of expenses'
            });
        }
        
        console.log('Creating', expenses.length, 'expenses in bulk');
        
        // Validate each expense
        const validationErrors = [];
        const validExpenses = [];
        
        for (let i = 0; i < expenses.length; i++) {
            const expense = expenses[i];
            
            // Basic validation
            if (!expense.description || !expense.amount || !expense.category || !expense.department) {
                validationErrors.push({
                    index: i,
                    error: 'Missing required fields',
                    data: expense
                });
                continue;
            }
            
            if (expense.amount <= 0) {
                validationErrors.push({
                    index: i,
                    error: 'Amount must be greater than 0',
                    data: expense
                });
                continue;
            }
            
            // Validate receiptUrl if provided
            if (expense.receiptUrl && expense.receiptUrl.trim() !== '') {
                try {
                    new URL(expense.receiptUrl);
                } catch (error) {
                    validationErrors.push({
                        index: i,
                        error: 'Invalid URL in receiptUrl',
                        data: expense
                    });
                    continue;
                }
            }
            
            // Set default values
            validExpenses.push({
                ...expense,
                status: 'pending',
                date: expense.date || new Date(),
                receiptUrl: expense.receiptUrl?.trim() || '',
                createdBy: process.env.NODE_ENV === 'production' 
                    ? (req.user?.id || null)
                    : new mongoose.Types.ObjectId()
            });
        }
        
        if (validExpenses.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid expenses to create',
                errors: validationErrors
            });
        }
        
        // Insert expenses
        const createdExpenses = await Expense.insertMany(validExpenses, { ordered: false });
        
        res.status(201).json({
            success: true,
            message: `Created ${createdExpenses.length} expenses successfully`,
            data: {
                created: createdExpenses.length,
                failed: validationErrors.length,
                errors: validationErrors.length > 0 ? validationErrors : undefined
            }
        });
        
    } catch (error) {
        console.error('Error in bulk expense creation:', error);
        
        if (error.writeErrors) {
            const errors = error.writeErrors.map(err => ({
                index: err.index,
                error: err.errmsg,
                code: err.code
            }));
            
            return res.status(400).json({
                success: false,
                message: 'Some expenses failed to create',
                data: {
                    created: error.nInserted || 0,
                    failed: error.writeErrors.length,
                    errors
                }
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error creating bulk expenses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== GET DASHBOARD METRICS ====================
router.get('/dashboard/metrics', async (req, res) => {
    try {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // Current month metrics
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
        
        // Previous month
        const firstDayOfPrevMonth = new Date(currentYear, currentMonth - 1, 1);
        const lastDayOfPrevMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
        
        // Current month metrics
        const currentMonthMetrics = await Expense.aggregate([
            {
                $match: {
                    date: { $gte: firstDayOfMonth, $lte: lastDayOfMonth },
                    status: { $in: ['approved', 'paid'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    byCategory: { $push: { category: '$category', amount: '$amount' } },
                    byDepartment: { $push: { department: '$department', amount: '$amount' } }
                }
            }
        ]);
        
        // Previous month metrics
        const prevMonthMetrics = await Expense.aggregate([
            {
                $match: {
                    date: { $gte: firstDayOfPrevMonth, $lte: lastDayOfPrevMonth },
                    status: { $in: ['approved', 'paid'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Pending expenses count
        const pendingCount = await Expense.countDocuments({ 
            status: 'pending',
            date: { $gte: firstDayOfMonth, $lte: lastDayOfMonth }
        });
        
        // Top expenses this month
        const topExpenses = await Expense.find({
            date: { $gte: firstDayOfMonth, $lte: lastDayOfMonth },
            status: { $in: ['approved', 'paid'] }
        })
        .sort({ amount: -1 })
        .limit(5)
        .select('expenseCode description amount category department date')
        .lean();
        
        // Calculate growth
        const currentTotal = currentMonthMetrics[0]?.totalAmount || 0;
        const prevTotal = prevMonthMetrics[0]?.totalAmount || 0;
        const growth = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;
        
        res.status(200).json({
            success: true,
            data: {
                currentMonth: {
                    totalAmount: currentTotal,
                    count: currentMonthMetrics[0]?.count || 0,
                    averageAmount: currentMonthMetrics[0]?.count > 0 
                        ? currentTotal / currentMonthMetrics[0].count 
                        : 0,
                    pendingCount
                },
                previousMonth: {
                    totalAmount: prevTotal,
                    count: prevMonthMetrics[0]?.count || 0
                },
                growth: {
                    percentage: growth,
                    trend: growth >= 0 ? 'up' : 'down',
                    amount: currentTotal - prevTotal
                },
                topExpenses,
                dateRange: {
                    currentMonth: {
                        start: firstDayOfMonth,
                        end: lastDayOfMonth
                    },
                    previousMonth: {
                        start: firstDayOfPrevMonth,
                        end: lastDayOfPrevMonth
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard metrics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== HEALTH CHECK ====================
router.get('/health', async (req, res) => {
    try {
        // Check database connection
        await Expense.findOne().limit(1);
        
        res.status(200).json({
            success: true,
            message: 'Expense API is healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            endpoints: [
                'GET / - Get all expenses',
                'POST / - Create expense',
                'GET /:id - Get expense by ID',
                'PUT /:id - Update expense',
                'DELETE /:id - Delete expense',
                'PATCH /:id/status - Update expense status',
                'PATCH /bulk/status - Bulk status update',
                'GET /stats/overview - Get statistics',
                'GET /summary/period - Get period summary',
                'GET /export/data - Export expenses',
                'POST /bulk - Bulk create expenses',
                'GET /dashboard/metrics - Get dashboard metrics'
            ]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Expense API is unhealthy',
            error: error.message,
            database: 'disconnected'
        });
    }
});

export default router;
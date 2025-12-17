import express from 'express';
import PC from '../models/PC.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all petty cash transactions
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, type, status, startDate, endDate } = req.query;
        
        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        const transactions = await PC.find(filter)
            .populate('approvedBy', 'firstName lastName')
            .populate('receivedBy', 'firstName lastName')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ date: -1 });

        const total = await PC.countDocuments(filter);

        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get petty cash transactions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create petty cash transaction
router.post('/', auth, async (req, res) => {
    try {
        const transaction = new PC({
            ...req.body,
            receivedBy: req.user._id
        });

        // Calculate balance after transaction
        const lastTransaction = await PC.findOne().sort({ createdAt: -1 });
        const currentBalance = lastTransaction ? lastTransaction.balanceAfter : 0;
        
        if (req.body.type === 'receipt') {
            transaction.balanceAfter = currentBalance + req.body.amount;
        } else if (req.body.type === 'payment') {
            transaction.balanceAfter = currentBalance - req.body.amount;
        }

        await transaction.save();
        await transaction.populate('receivedBy', 'firstName lastName');
        await transaction.populate('approvedBy', 'firstName lastName');

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Create petty cash transaction error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve petty cash transaction
router.put('/:id/approve', adminAuth, async (req, res) => {
    try {
        const transaction = await PC.findByIdAndUpdate(
            req.params.id,
            {
                status: 'approved',
                approvedBy: req.user._id
            },
            { new: true, runValidators: true }
        )
        .populate('receivedBy', 'firstName lastName')
        .populate('approvedBy', 'firstName lastName');

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json(transaction);
    } catch (error) {
        console.error('Approve petty cash error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get petty cash balance
router.get('/balance/current', auth, async (req, res) => {
    try {
        const lastTransaction = await PC.findOne({ status: 'approved' }).sort({ createdAt: -1 });
        const currentBalance = lastTransaction ? lastTransaction.balanceAfter : 0;

        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const monthlyStats = await PC.aggregate([
            {
                $match: {
                    date: { $gte: firstDay, $lte: lastDay },
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: '$type',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const receipts = monthlyStats.find(stat => stat._id === 'receipt') || { totalAmount: 0 };
        const payments = monthlyStats.find(stat => stat._id === 'payment') || { totalAmount: 0 };

        res.json({
            currentBalance,
            monthlyReceipts: receipts.totalAmount,
            monthlyPayments: payments.totalAmount,
            netFlow: receipts.totalAmount - payments.totalAmount
        });
    } catch (error) {
        console.error('Get petty cash balance error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get petty cash statistics
router.get('/stats/overview', auth, async (req, res) => {
    try {
        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const categoryStats = await PC.aggregate([
            {
                $match: {
                    date: { $gte: firstDay, $lte: lastDay },
                    status: 'approved',
                    type: 'payment'
                }
            },
            {
                $group: {
                    _id: '$category',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);

        const pendingApprovals = await PC.countDocuments({ status: 'pending' });

        const dailyTransactions = await PC.aggregate([
            {
                $match: {
                    date: { $gte: firstDay, $lte: lastDay },
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                    totalAmount: { $sum: '$amount' },
                    receiptAmount: {
                        $sum: { $cond: [{ $eq: ['$type', 'receipt'] }, '$amount', 0] }
                    },
                    paymentAmount: {
                        $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            categoryStats,
            pendingApprovals,
            dailyTransactions
        });
    } catch (error) {
        console.error('Get petty cash stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
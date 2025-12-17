import express from 'express';
import Income from '../models/Income.js';

const router = express.Router();

// Get all incomes
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, category, status, startDate, endDate } = req.query;
        
        const filter = {};
        if (category) filter.category = category;
        if (status) filter.status = status;
        
        // Date range filter
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        const incomes = await Income.find(filter)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ date: -1 });

        const total = await Income.countDocuments(filter);

        // Calculate total amount
        const totalAmount = await Income.aggregate([
            { $match: filter },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        res.json({
            incomes,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total,
            totalAmount: totalAmount[0]?.total || 0
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create income
router.post('/', async (req, res) => {
    try {
        const income = new Income(req.body);
        await income.save();
        res.status(201).json(income);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get income statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        // Monthly income
        const monthlyIncome = await Income.aggregate([
            {
                $match: {
                    date: { $gte: firstDay, $lte: lastDay },
                    status: 'received'
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Income by category
        const incomeByCategory = await Income.aggregate([
            {
                $match: {
                    date: { $gte: firstDay, $lte: lastDay },
                    status: 'received'
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        res.json({
            monthlyTotal: monthlyIncome[0]?.total || 0,
            incomeByCategory
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
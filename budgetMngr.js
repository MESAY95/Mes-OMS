import express from 'express';
import BudgetMngr from '../models/BudgetMngr.js';

const router = express.Router();

// Get all budgets
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, status, department, fiscalYear, budgetType } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (department) filter.department = department;
        if (fiscalYear) filter.fiscalYear = fiscalYear;
        if (budgetType) filter.budgetType = budgetType;

        const budgets = await BudgetMngr.find(filter)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ fiscalYear: -1, department: 1 });

        const total = await BudgetMngr.countDocuments(filter);

        res.json({
            budgets,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get budgets error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create budget
router.post('/', async (req, res) => {
    try {
        const budget = new BudgetMngr(req.body);

        await budget.save();

        res.status(201).json(budget);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Budget code already exists' });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// Update budget
router.put('/:id', async (req, res) => {
    try {
        const budget = await BudgetMngr.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        res.json(budget);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve budget
router.put('/:id/approve', async (req, res) => {
    try {
        const budget = await BudgetMngr.findByIdAndUpdate(
            req.params.id,
            {
                status: 'approved',
                approvedAt: new Date()
            },
            { new: true, runValidators: true }
        );

        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        res.json(budget);
    } catch (error) {
        console.error('Approve budget error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update budget spending
router.put('/:id/spending', async (req, res) => {
    try {
        const { spentAmount, category } = req.body;

        const budget = await BudgetMngr.findById(req.params.id);
        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        // Update overall spending
        budget.spentAmount += spentAmount;

        // Update category spending if provided
        if (category) {
            const categoryIndex = budget.categories.findIndex(cat => cat.category === category);
            if (categoryIndex !== -1) {
                budget.categories[categoryIndex].spent += spentAmount;
                budget.categories[categoryIndex].remaining = budget.categories[categoryIndex].allocated - budget.categories[categoryIndex].spent;
            }
        }

        await budget.save();

        res.json(budget);
    } catch (error) {
        console.error('Update budget spending error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get budget statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const currentYear = new Date().getFullYear().toString();

        const budgetStats = await BudgetMngr.aggregate([
            {
                $match: {
                    fiscalYear: currentYear,
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: null,
                    totalBudget: { $sum: '$allocatedAmount' },
                    totalSpent: { $sum: '$spentAmount' },
                    totalRemaining: { $sum: '$remainingAmount' }
                }
            }
        ]);

        const departmentStats = await BudgetMngr.aggregate([
            {
                $match: {
                    fiscalYear: currentYear,
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: '$department',
                    allocated: { $sum: '$allocatedAmount' },
                    spent: { $sum: '$spentAmount' },
                    remaining: { $sum: '$remainingAmount' }
                }
            },
            { $sort: { allocated: -1 } }
        ]);

        const typeStats = await BudgetMngr.aggregate([
            {
                $match: {
                    fiscalYear: currentYear,
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: '$budgetType',
                    allocated: { $sum: '$allocatedAmount' },
                    spent: { $sum: '$spentAmount' }
                }
            }
        ]);

        res.json({
            overall: budgetStats[0] || { totalBudget: 0, totalSpent: 0, totalRemaining: 0 },
            byDepartment: departmentStats,
            byType: typeStats
        });
    } catch (error) {
        console.error('Get budget stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
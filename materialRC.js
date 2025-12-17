import express from 'express';
import MaterialRC from '../models/MaterialRC.js';
import Material from '../models/Material.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all material receive/consume transactions
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, type, department, startDate, endDate } = req.query;
        
        const filter = {};
        if (type) filter.type = type;
        if (department) filter.department = department;
        
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        const transactions = await MaterialRC.find(filter)
            .populate('material', 'name code unit category')
            .populate('receivedBy', 'firstName lastName')
            .populate('consumedBy', 'firstName lastName')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ date: -1 });

        const total = await MaterialRC.countDocuments(filter);

        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get material RC error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create material receive/consume transaction
router.post('/', auth, async (req, res) => {
    try {
        const transaction = new MaterialRC({
            ...req.body,
            ...(req.body.type === 'receive' && { receivedBy: req.user._id }),
            ...(req.body.type === 'consume' && { consumedBy: req.user._id })
        });

        await transaction.save();
        await transaction.populate('material', 'name code unit');
        await transaction.populate('receivedBy', 'firstName lastName');
        await transaction.populate('consumedBy', 'firstName lastName');

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Create material RC error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get material consumption by department
router.get('/stats/consumption', auth, async (req, res) => {
    try {
        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const consumptionStats = await MaterialRC.aggregate([
            {
                $match: {
                    type: 'consume',
                    date: { $gte: firstDay, $lte: lastDay },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$department',
                    totalQuantity: { $sum: '$quantity' },
                    totalValue: { $sum: '$totalValue' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalValue: -1 } }
        ]);

        const materialConsumption = await MaterialRC.aggregate([
            {
                $match: {
                    type: 'consume',
                    date: { $gte: firstDay, $lte: lastDay },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$material',
                    totalQuantity: { $sum: '$quantity' },
                    totalValue: { $sum: '$totalValue' }
                }
            },
            {
                $lookup: {
                    from: 'materials',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'material'
                }
            },
            { $unwind: '$material' },
            { $sort: { totalValue: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            consumptionByDepartment: consumptionStats,
            topConsumedMaterials: materialConsumption
        });
    } catch (error) {
        console.error('Get consumption stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
import express from 'express';
import ProductQ from '../models/ProductQ.js';
import Product from '/models/Product.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all product quality checks
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, overallStatus, product } = req.query;
        
        const filter = {};
        if (overallStatus) filter.overallStatus = overallStatus;
        if (product) filter.product = product;

        const qualityChecks = await ProductQ.find(filter)
            .populate('product', 'name code unit category')
            .populate('testedBy', 'firstName lastName')
            .populate('approvedBy', 'firstName lastName')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ testedAt: -1 });

        const total = await ProductQ.countDocuments(filter);

        res.json({
            qualityChecks,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get product quality checks error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create product quality check
router.post('/', auth, async (req, res) => {
    try {
        const qualityCheck = new ProductQ({
            ...req.body,
            testedBy: req.user._id
        });

        await qualityCheck.save();
        await qualityCheck.populate('product', 'name code unit');
        await qualityCheck.populate('testedBy', 'firstName lastName');

        res.status(201).json(qualityCheck);
    } catch (error) {
        console.error('Create product quality check error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get product quality statistics
router.get('/stats/quality', auth, async (req, res) => {
    try {
        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const qualityStats = await ProductQ.aggregate([
            {
                $match: {
                    testedAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: '$overallStatus',
                    count: { $sum: 1 },
                    totalTested: { $sum: '$quantityTested' },
                    totalAccepted: { $sum: '$quantityAccepted' }
                }
            }
        ]);

        const productPerformance = await ProductQ.aggregate([
            {
                $match: {
                    testedAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: '$product',
                    totalChecks: { $sum: 1 },
                    approvedChecks: {
                        $sum: { $cond: [{ $eq: ['$overallStatus', 'approved'] }, 1, 0] }
                    },
                    totalTested: { $sum: '$quantityTested' },
                    totalAccepted: { $sum: '$quantityAccepted' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $addFields: {
                    approvalRate: { $multiply: [{ $divide: ['$approvedChecks', '$totalChecks'] }, 100] },
                    acceptanceRate: { $multiply: [{ $divide: ['$totalAccepted', '$totalTested'] }, 100] }
                }
            },
            { $sort: { acceptanceRate: -1 } }
        ]);

        res.json({
            qualityStats,
            productPerformance
        });
    } catch (error) {
        console.error('Get product quality stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
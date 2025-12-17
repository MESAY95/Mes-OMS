import express from 'express';
import MaterialQ from '../models/MaterialQ.js';
import Material from '../models/Material.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all material quality checks
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, overallStatus, material } = req.query;
        
        const filter = {};
        if (overallStatus) filter.overallStatus = overallStatus;
        if (material) filter.material = material;

        const qualityChecks = await MaterialQ.find(filter)
            .populate('material', 'name code unit category')
            .populate('supplier', 'name code')
            .populate('testedBy', 'firstName lastName')
            .populate('approvedBy', 'firstName lastName')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ testedAt: -1 });

        const total = await MaterialQ.countDocuments(filter);

        res.json({
            qualityChecks,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get material quality checks error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create material quality check
router.post('/', auth, async (req, res) => {
    try {
        const qualityCheck = new MaterialQ({
            ...req.body,
            testedBy: req.user._id
        });

        await qualityCheck.save();
        await qualityCheck.populate('material', 'name code unit');
        await qualityCheck.populate('supplier', 'name code');
        await qualityCheck.populate('testedBy', 'firstName lastName');

        res.status(201).json(qualityCheck);
    } catch (error) {
        console.error('Create material quality check error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve/reject material quality
router.put('/:id/approve', adminAuth, async (req, res) => {
    try {
        const { overallStatus, comments } = req.body;

        const qualityCheck = await MaterialQ.findByIdAndUpdate(
            req.params.id,
            {
                overallStatus,
                approvedBy: req.user._id,
                approvedAt: new Date(),
                ...(comments && { comments })
            },
            { new: true, runValidators: true }
        )
        .populate('material', 'name code unit')
        .populate('supplier', 'name code')
        .populate('testedBy', 'firstName lastName')
        .populate('approvedBy', 'firstName lastName');

        if (!qualityCheck) {
            return res.status(404).json({ message: 'Quality check not found' });
        }

        res.json(qualityCheck);
    } catch (error) {
        console.error('Approve material quality error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get material quality statistics
router.get('/stats/quality', auth, async (req, res) => {
    try {
        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const qualityStats = await MaterialQ.aggregate([
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

        const supplierPerformance = await MaterialQ.aggregate([
            {
                $match: {
                    testedAt: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: '$supplier',
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
                    from: 'suppliers',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'supplier'
                }
            },
            { $unwind: '$supplier' },
            {
                $addFields: {
                    approvalRate: { $multiply: [{ $divide: ['$approvedChecks', '$totalChecks'] }, 100] },
                    acceptanceRate: { $multiply: [{ $divide: ['$totalAccepted', '$totalTested'] }, 100] }
                }
            },
            { $sort: { approvalRate: -1 } }
        ]);

        res.json({
            qualityStats,
            supplierPerformance
        });
    } catch (error) {
        console.error('Get material quality stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
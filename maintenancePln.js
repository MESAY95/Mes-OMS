import express from 'express';
import MaintenancePln from '../models/MaintenancePln.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all maintenance plans
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, maintenanceType } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (maintenanceType) filter.maintenanceType = maintenanceType;

        const maintenancePlans = await MaintenancePln.find(filter)
            .populate('assignedTo', 'firstName lastName')
            .populate('createdBy', 'firstName lastName')
            .populate('approvedBy', 'firstName lastName')
            .populate('requiredSpares.spare', 'name code currentStock')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ nextMaintenanceDate: 1 });

        const total = await MaintenancePln.countDocuments(filter);

        res.json({
            maintenancePlans,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get maintenance plans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create maintenance plan
router.post('/', adminAuth, async (req, res) => {
    try {
        const maintenancePlan = new MaintenancePln({
            ...req.body,
            createdBy: req.user._id
        });

        await maintenancePlan.save();
        await maintenancePlan.populate('assignedTo', 'firstName lastName');
        await maintenancePlan.populate('createdBy', 'firstName lastName');
        await maintenancePlan.populate('requiredSpares.spare', 'name code');

        res.status(201).json(maintenancePlan);
    } catch (error) {
        console.error('Create maintenance plan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update maintenance plan
router.put('/:id', auth, async (req, res) => {
    try {
        const maintenancePlan = await MaintenancePln.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        )
        .populate('assignedTo', 'firstName lastName')
        .populate('requiredSpares.spare', 'name code');

        if (!maintenancePlan) {
            return res.status(404).json({ message: 'Maintenance plan not found' });
        }

        res.json(maintenancePlan);
    } catch (error) {
        console.error('Update maintenance plan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve maintenance plan
router.put('/:id/approve', adminAuth, async (req, res) => {
    try {
        const maintenancePlan = await MaintenancePln.findByIdAndUpdate(
            req.params.id,
            {
                approvedBy: req.user._id,
                status: 'active'
            },
            { new: true, runValidators: true }
        )
        .populate('assignedTo', 'firstName lastName')
        .populate('approvedBy', 'firstName lastName');

        if (!maintenancePlan) {
            return res.status(404).json({ message: 'Maintenance plan not found' });
        }

        res.json(maintenancePlan);
    } catch (error) {
        console.error('Approve maintenance plan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get overdue maintenance plans
router.get('/overdue', auth, async (req, res) => {
    try {
        const overduePlans = await MaintenancePln.find({
            status: 'active',
            nextMaintenanceDate: { $lt: new Date() }
        })
        .populate('assignedTo', 'firstName lastName')
        .populate('requiredSpares.spare', 'name code currentStock')
        .sort({ nextMaintenanceDate: 1 });

        res.json(overduePlans);
    } catch (error) {
        console.error('Get overdue maintenance plans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get maintenance plan statistics
router.get('/stats/overview', auth, async (req, res) => {
    try {
        const planStats = await MaintenancePln.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const typeStats = await MaintenancePln.aggregate([
            {
                $group: {
                    _id: '$maintenanceType',
                    count: { $sum: 1 }
                }
            }
        ]);

        const frequencyStats = await MaintenancePln.aggregate([
            {
                $group: {
                    _id: '$frequency',
                    count: { $sum: 1 }
                }
            }
        ]);

        const upcomingMaintenance = await MaintenancePln.countDocuments({
            status: 'active',
            nextMaintenanceDate: { 
                $gte: new Date(), 
                $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
            }
        });

        res.json({
            planStats,
            typeStats,
            frequencyStats,
            upcomingMaintenance
        });
    } catch (error) {
        console.error('Get maintenance plan stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
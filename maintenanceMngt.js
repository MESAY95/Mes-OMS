import express from 'express';
import MaintenanceMngt from '../models/MaintenanceMngt.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all maintenance requests
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, maintenanceType, priority } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (maintenanceType) filter.maintenanceType = maintenanceType;
        if (priority) filter.priority = priority;

        const maintenanceRequests = await MaintenanceMngt.find(filter)
            .populate('reportedBy', 'firstName lastName')
            .populate('assignedTo', 'firstName lastName')
            .populate('verifiedBy', 'firstName lastName')
            .populate('sparePartsUsed.spare', 'name code unitPrice')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ reportedDate: -1 });

        const total = await MaintenanceMngt.countDocuments(filter);

        res.json({
            maintenanceRequests,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get maintenance requests error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create maintenance request
router.post('/', auth, async (req, res) => {
    try {
        const maintenanceRequest = new MaintenanceMngt({
            ...req.body,
            reportedBy: req.user._id
        });

        await maintenanceRequest.save();
        await maintenanceRequest.populate('reportedBy', 'firstName lastName');
        await maintenanceRequest.populate('assignedTo', 'firstName lastName');

        res.status(201).json(maintenanceRequest);
    } catch (error) {
        console.error('Create maintenance request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update maintenance request
router.put('/:id', auth, async (req, res) => {
    try {
        const maintenanceRequest = await MaintenanceMngt.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        )
        .populate('reportedBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName')
        .populate('sparePartsUsed.spare', 'name code unitPrice');

        if (!maintenanceRequest) {
            return res.status(404).json({ message: 'Maintenance request not found' });
        }

        res.json(maintenanceRequest);
    } catch (error) {
        console.error('Update maintenance request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Complete maintenance request
router.put('/:id/complete', auth, async (req, res) => {
    try {
        const { actualHours, sparePartsUsed, laborCost, rootCause, correctiveAction } = req.body;

        const maintenanceRequest = await MaintenanceMngt.findByIdAndUpdate(
            req.params.id,
            {
                status: 'completed',
                completedDate: new Date(),
                actualHours,
                sparePartsUsed,
                laborCost,
                rootCause,
                correctiveAction
            },
            { new: true, runValidators: true }
        )
        .populate('reportedBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName')
        .populate('sparePartsUsed.spare', 'name code unitPrice');

        if (!maintenanceRequest) {
            return res.status(404).json({ message: 'Maintenance request not found' });
        }

        res.json(maintenanceRequest);
    } catch (error) {
        console.error('Complete maintenance request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify maintenance completion
router.put('/:id/verify', adminAuth, async (req, res) => {
    try {
        const maintenanceRequest = await MaintenanceMngt.findByIdAndUpdate(
            req.params.id,
            {
                verifiedBy: req.user._id,
                verifiedAt: new Date()
            },
            { new: true, runValidators: true }
        )
        .populate('reportedBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName')
        .populate('verifiedBy', 'firstName lastName');

        if (!maintenanceRequest) {
            return res.status(404).json({ message: 'Maintenance request not found' });
        }

        res.json(maintenanceRequest);
    } catch (error) {
        console.error('Verify maintenance error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get maintenance statistics
router.get('/stats/overview', auth, async (req, res) => {
    try {
        const currentMonth = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const maintenanceStats = await MaintenanceMngt.aggregate([
            {
                $match: {
                    reportedDate: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: '$maintenanceType',
                    count: { $sum: 1 },
                    totalCost: { $sum: '$totalCost' },
                    totalHours: { $sum: '$actualHours' }
                }
            }
        ]);

        const statusStats = await MaintenanceMngt.aggregate([
            {
                $match: {
                    reportedDate: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const equipmentStats = await MaintenanceMngt.aggregate([
            {
                $match: {
                    reportedDate: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: '$equipment',
                    count: { $sum: 1 },
                    totalCost: { $sum: '$totalCost' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const totalDowntime = await MaintenanceMngt.aggregate([
            {
                $match: {
                    status: 'completed',
                    reportedDate: { $gte: firstDay, $lte: lastDay }
                }
            },
            {
                $group: {
                    _id: null,
                    totalDowntime: { $sum: '$downtimeHours' }
                }
            }
        ]);

        res.json({
            maintenanceStats,
            statusStats,
            equipmentStats,
            totalDowntime: totalDowntime[0]?.totalDowntime || 0
        });
    } catch (error) {
        console.error('Get maintenance stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
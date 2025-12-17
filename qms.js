import express from 'express';
import QMS from '../models/QMS.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all QMS documents
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, documentType, status, department } = req.query;
        
        const filter = {};
        if (documentType) filter.documentType = documentType;
        if (status) filter.status = status;
        if (department) filter.department = department;

        const documents = await QMS.find(filter)
            .populate('owner', 'firstName lastName')
            .populate('approver', 'firstName lastName')
            .populate('changeHistory.changedBy', 'firstName lastName')
            .populate('trainedEmployees', 'firstName lastName')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ effectiveDate: -1 });

        const total = await QMS.countDocuments(filter);

        res.json({
            documents,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get QMS documents error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create QMS document
router.post('/', adminAuth, async (req, res) => {
    try {
        const document = new QMS({
            ...req.body,
            owner: req.user._id
        });

        await document.save();
        await document.populate('owner', 'firstName lastName');

        res.status(201).json(document);
    } catch (error) {
        console.error('Create QMS document error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update QMS document
router.put('/:id', auth, async (req, res) => {
    try {
        const document = await QMS.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        )
        .populate('owner', 'firstName lastName')
        .populate('approver', 'firstName lastName');

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.json(document);
    } catch (error) {
        console.error('Update QMS document error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve QMS document
router.put('/:id/approve', adminAuth, async (req, res) => {
    try {
        const document = await QMS.findByIdAndUpdate(
            req.params.id,
            {
                status: 'approved',
                approver: req.user._id,
                approvedAt: new Date()
            },
            { new: true, runValidators: true }
        )
        .populate('owner', 'firstName lastName')
        .populate('approver', 'firstName lastName');

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.json(document);
    } catch (error) {
        console.error('Approve QMS document error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add change history
router.post('/:id/changes', auth, async (req, res) => {
    try {
        const { version, changeDescription } = req.body;

        const document = await QMS.findByIdAndUpdate(
            req.params.id,
            {
                $push: {
                    changeHistory: {
                        version,
                        changeDescription,
                        changedBy: req.user._id,
                        changedAt: new Date()
                    }
                }
            },
            { new: true, runValidators: true }
        )
        .populate('owner', 'firstName lastName')
        .populate('changeHistory.changedBy', 'firstName lastName');

        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.json(document);
    } catch (error) {
        console.error('Add change history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get QMS statistics
router.get('/stats/overview', auth, async (req, res) => {
    try {
        const documentStats = await QMS.aggregate([
            {
                $group: {
                    _id: '$documentType',
                    count: { $sum: 1 },
                    approved: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                    },
                    draft: {
                        $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
                    }
                }
            }
        ]);

        const departmentStats = await QMS.aggregate([
            {
                $group: {
                    _id: '$department',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const complianceStats = await QMS.aggregate([
            {
                $group: {
                    _id: '$complianceStatus',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            documentStats,
            departmentStats,
            complianceStats
        });
    } catch (error) {
        console.error('Get QMS stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
import express from 'express';
import Spare from '../models/Spare.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all spare parts
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, category, equipment, lowStock } = req.query;
        
        const filter = { isActive: true };
        if (category) filter.category = category;
        if (equipment) filter.equipment = equipment;
        if (lowStock === 'true') {
            filter.$expr = { $lte: ['$currentStock', '$minStock'] };
        }

        const spares = await Spare.find(filter)
            .populate('supplier', 'name code contactPerson')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ name: 1 });

        const total = await Spare.countDocuments(filter);

        res.json({
            spares,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Get spares error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create spare part
router.post('/', adminAuth, async (req, res) => {
    try {
        const spare = new Spare(req.body);
        await spare.save();
        await spare.populate('supplier', 'name code contactPerson');

        res.status(201).json(spare);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Spare part code already exists' });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// Update spare part
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const spare = await Spare.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('supplier', 'name code contactPerson');

        if (!spare) {
            return res.status(404).json({ message: 'Spare part not found' });
        }

        res.json(spare);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get low stock spares
router.get('/inventory/low-stock', auth, async (req, res) => {
    try {
        const lowStockSpares = await Spare.find({
            isActive: true,
            $expr: { $lte: ['$currentStock', '$minStock'] }
        }).populate('supplier', 'name code contactPerson');

        res.json(lowStockSpares);
    } catch (error) {
        console.error('Get low stock spares error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get spare part usage statistics
router.get('/stats/usage', auth, async (req, res) => {
    try {
        const MaintenanceMngt = mongoose.model('MaintenanceMngt');
        
        const spareUsage = await MaintenanceMngt.aggregate([
            { $unwind: '$sparePartsUsed' },
            {
                $group: {
                    _id: '$sparePartsUsed.spare',
                    totalUsed: { $sum: '$sparePartsUsed.quantity' },
                    totalCost: { $sum: '$sparePartsUsed.totalCost' },
                    maintenanceCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'spares',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'spare'
                }
            },
            { $unwind: '$spare' },
            { $sort: { totalUsed: -1 } },
            { $limit: 10 }
        ]);

        res.json(spareUsage);
    } catch (error) {
        console.error('Get spare usage stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;

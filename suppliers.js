import express from 'express';
import Supplier from '../models/Supplier.js';
import { auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all suppliers
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } }
            ];
        }

        const suppliers = await Supplier.find(filter)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ name: 1 });

        const total = await Supplier.countDocuments(filter);

        res.json({
            suppliers,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create supplier (Admin only)
router.post('/', adminAuth, async (req, res) => {
    try {
        const supplier = new Supplier(req.body);
        await supplier.save();
        res.status(201).json(supplier);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Supplier code already exists' });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// Update supplier (Admin only)
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const supplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        res.json(supplier);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get supplier performance
router.get('/:id/performance', auth, async (req, res) => {
    try {
        // This would typically aggregate data from purchase orders and material receipts
        const supplier = await Supplier.findById(req.params.id);
        
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        // Mock performance data - in real app, calculate from actual transactions
        const performance = {
            onTimeDelivery: 95, // percentage
            qualityRating: 4.2, // out of 5
            totalOrders: supplier.totalOrders,
            totalAmount: supplier.totalAmount,
            avgOrderValue: supplier.totalOrders > 0 ? supplier.totalAmount / supplier.totalOrders : 0
        };

        res.json(performance);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
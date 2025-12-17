import express from 'express';
import Customer from '../models/Customer.js';

const router = express.Router();

// Get all customers
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, type, status, search } = req.query;
        
        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const customers = await Customer.find(filter)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ name: 1 });

        const total = await Customer.countDocuments(filter);

        res.json({
            customers,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create customer
router.post('/', async (req, res) => {
    try {
        const customer = new Customer(req.body);
        await customer.save();
        res.status(201).json(customer);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Customer code already exists' });
        }
        res.status(500).json({ message: 'Server error' });
    }
});

// Update customer
router.put('/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json(customer);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get customer sales history
router.get('/:id/sales-history', async (req, res) => {
    try {
        const Sale = mongoose.model('Sale');
        const sales = await Sale.find({ customer: req.params.id })
            .populate('items.product', 'name code')
            .sort({ saleDate: -1 })
            .limit(10);

        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
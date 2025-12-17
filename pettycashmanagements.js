import express from 'express';
import PettyCashManagement from '../models/PettyCashManagement.js';
import CompanyManagement from '../models/CompanyManagement.js';

const router = express.Router();

// Get all petty cash transactions
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            activity, 
            action,
            PCPV, 
            startDate, 
            endDate 
        } = req.query;
        
        const filter = {};
        if (activity) filter.activity = activity;
        if (action) filter.action = { $regex: action, $options: 'i' };
        if (PCPV) filter.PCPV = { $regex: PCPV, $options: 'i' };
        
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        // Sort by date ascending (oldest first, current entries at bottom)
        const transactions = await PettyCashManagement.find(filter)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ date: 1 });

        const total = await PettyCashManagement.countDocuments(filter);

        const totals = await PettyCashManagement.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalDebit: {
                        $sum: {
                            $cond: [{ $eq: ['$activity', 'Debit'] }, '$amount', 0]
                        }
                    },
                    totalCredit: {
                        $sum: {
                            $cond: [{ $eq: ['$activity', 'Credit'] }, '$amount', 0]
                        }
                    }
                }
            }
        ]);

        const result = totals[0] || { totalDebit: 0, totalCredit: 0 };
        const balance = result.totalCredit - result.totalDebit;

        // Get company management data
        const companyManagement = await CompanyManagement.findOne({ status: 'Active' });

        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total,
            totals: {
                totalDebit: result.totalDebit,
                totalCredit: result.totalCredit,
                balance: balance
            },
            companyManagement: companyManagement || {}
        });
    } catch (error) {
        console.error('Error fetching petty cash transactions:', error);
        res.status(500).json({ 
            message: 'Error fetching transactions',
            error: error.message 
        });
    }
});

// Create petty cash transaction
router.post('/', async (req, res) => {
    try {
        // Force currency to ETB
        const transactionData = {
            ...req.body,
            currency: 'ETB'
        };

        const transaction = new PettyCashManagement(transactionData);
        await transaction.save();
        
        res.status(201).json(transaction);
    } catch (error) {
        console.error('Error creating transaction:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Validation error',
                errors: error.errors 
            });
        }
        
        res.status(500).json({ 
            message: 'Error creating transaction',
            error: error.message 
        });
    }
});

// Get transaction by ID
router.get('/:id', async (req, res) => {
    try {
        const transaction = await PettyCashManagement.findById(req.params.id);
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ 
            message: 'Error fetching transaction',
            error: error.message 
        });
    }
});

// Update transaction
router.put('/:id', async (req, res) => {
    try {
        // Force currency to ETB on update
        const updateData = {
            ...req.body,
            currency: 'ETB'
        };

        const transaction = await PettyCashManagement.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json(transaction);
    } catch (error) {
        console.error('Error updating transaction:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Validation error',
                errors: error.errors 
            });
        }
        
        res.status(500).json({ 
            message: 'Error updating transaction',
            error: error.message 
        });
    }
});

// Delete transaction
router.delete('/:id', async (req, res) => {
    try {
        const transaction = await PettyCashManagement.findByIdAndDelete(req.params.id);

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ 
            message: 'Error deleting transaction',
            error: error.message 
        });
    }
});

// Get company management info
router.get('/company/info', async (req, res) => {
    try {
        const companyManagement = await CompanyManagement.findOne({ status: 'Active' });
        
        if (!companyManagement) {
            return res.status(404).json({ message: 'No active company found' });
        }

        res.json(companyManagement);
    } catch (error) {
        console.error('Error fetching company info:', error);
        res.status(500).json({ 
            message: 'Error fetching company info',
            error: error.message 
        });
    }
});

// Export data
router.get('/export/data', async (req, res) => {
    try {
        const { activity, action, PCPV, startDate, endDate } = req.query;
        
        const filter = {};
        if (activity) filter.activity = activity;
        if (action) filter.action = { $regex: action, $options: 'i' };
        if (PCPV) filter.PCPV = { $regex: PCPV, $options: 'i' };
        
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        // Sort by date ascending for export as well
        const transactions = await PettyCashManagement.find(filter).sort({ date: 1 });

        const csvData = transactions.map(transaction => ({
            Date: transaction.date.toISOString().split('T')[0],
            Activity: transaction.activity,
            Action: transaction.action,
            PCPV: transaction.PCPV,
            'Payment Description': transaction.paymentDescription,
            'Amount (ETB)': transaction.amount,
            'Prepared By': transaction.preparedBy,
            'Checked By': transaction.checkedBy,
            'Approved By': transaction.approvedBy,
            Remarks: transaction.remarks
        }));

        res.json(csvData);
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ 
            message: 'Error exporting data',
            error: error.message 
        });
    }
});

export default router;
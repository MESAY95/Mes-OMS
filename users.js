import express from 'express';
import User from '../models/User.js';
import { userAuth as auth, adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all users (Admin only)
router.get('/', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 10, department, search } = req.query;
        
        const filter = { isActive: true };
        if (department) filter.department = department;
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(filter)
            .select('-password')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(filter);

        res.json({
            users,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user (Admin only)
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const { firstName, lastName, department, position, phone, salary, isActive } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { firstName, lastName, department, position, phone, salary, isActive },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete user (Admin only - soft delete)
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deactivated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user count for dashboard
router.get('/count', adminAuth, async (req, res) => {
    try {
        const count = await User.countDocuments({ isActive: true });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Add this to your backend employees routes
router.get('/check-employee-id/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const existingEmployee = await User.findOne({ 
      employeeId: employeeId.toUpperCase().trim() 
    });
    
    res.json({
      success: true,
      available: !existingEmployee,
      employeeId: employeeId.toUpperCase().trim()
    });
  } catch (error) {
    console.error('Check employee ID error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error checking employee ID' 
    });
  }
});

router.get('/suggest-employee-id/:department', async (req, res) => {
  try {
    const { department } = req.params;
    const { pattern } = req.query;
    
    const suggestion = await User.suggestEmployeeId(department, pattern);
    
    res.json({
      success: true,
      suggestion
    });
  } catch (error) {
    console.error('Suggest employee ID error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error suggesting employee ID' 
    });
  }
});

export default router;
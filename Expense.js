import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
    expenseCode: {
        type: String,
        required: false, // Changed from true to false since it's auto-generated
        unique: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Direct', 'Indirect', 'Investment', 'Other']
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
        set: v => parseFloat(v.toFixed(2))
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    department: {
        type: String,
        required: true
    },
    budgetCode: {
        type: String,
        ref: 'BudgetMngr'
    },
    paidTo: {
        type: String,
        required: true,
        trim: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'check', 'credit_card', 'mobile_payment'],
        default: 'cash'
    },
    referenceNumber: {
        type: String,
        trim: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'paid'],
        default: 'pending',
        index: true
    },
    receiptUrl: {
        type: String,
        validate: {
            validator: function(v) {
                if (!v || v.trim() === '') return true;
                try {
                    new URL(v);
                    return true;
                } catch (error) {
                    return false;
                }
            },
            message: 'Receipt URL must be a valid URL or empty'
        }
    },
    remarks: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: process.env.NODE_ENV === 'production' // Only required in production
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for formatted date
expenseSchema.virtual('formattedDate').get(function() {
    return this.date.toISOString().split('T')[0];
});

// Virtual for formatted amount
expenseSchema.virtual('formattedAmount').get(function() {
    return new Intl.NumberFormat('en-ET', {
        style: 'currency',
        currency: this.currency
    }).format(this.amount);
});

// Pre-save middleware to generate expense code
expenseSchema.pre('save', async function(next) {
    // Generate expense code if not present or is new
    if (!this.expenseCode) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        
        // Get count for this month
        const startOfMonth = new Date(year, now.getMonth(), 1);
        const endOfMonth = new Date(year, now.getMonth() + 1, 0);
        
        const count = await mongoose.model('Expense').countDocuments({
            date: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        });
        
        this.expenseCode = `EXP-${year}${month}-${String(count + 1).padStart(4, '0')}`;
    }
    
    // Ensure amount is stored with 2 decimal places
    if (this.amount) {
        this.amount = parseFloat(this.amount.toFixed(2));
    }
    
    // Set createdBy if not provided (for development/testing)
    if (!this.createdBy && process.env.NODE_ENV !== 'production') {
        try {
            // Try to get a user from the database
            const User = mongoose.model('User');
            const user = await User.findOne();
            if (user) {
                this.createdBy = user._id;
            } else {
                // Create a dummy ObjectId for development
                this.createdBy = new mongoose.Types.ObjectId();
            }
        } catch (error) {
            // If User model doesn't exist, use a dummy ObjectId
            this.createdBy = new mongoose.Types.ObjectId();
        }
    }
    
    next();
});

// Pre-validate middleware to ensure expenseCode is generated before validation
expenseSchema.pre('validate', async function(next) {
    // Ensure expenseCode exists before validation
    if (!this.expenseCode) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        
        const startOfMonth = new Date(year, now.getMonth(), 1);
        const endOfMonth = new Date(year, now.getMonth() + 1, 0);
        
        const count = await mongoose.model('Expense').countDocuments({
            date: {
                $gte: startOfMonth,
                $lte: endOfMonth
            }
        });
        
        this.expenseCode = `EXP-${year}${month}-${String(count + 1).padStart(4, '0')}`;
    }
    
    next();
});

// Indexes for better query performance
expenseSchema.index({ expenseCode: 1 });
expenseSchema.index({ date: 1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ department: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ createdBy: 1 });
expenseSchema.index({ date: -1, status: 1 });
expenseSchema.index({ department: 1, category: 1 });

// Static method to get expenses by date range
expenseSchema.statics.findByDateRange = function(startDate, endDate) {
    return this.find({
        date: {
            $gte: startDate,
            $lte: endDate
        }
    });
};

// Instance method to approve expense
expenseSchema.methods.approve = function(userId, remarks = '') {
    this.status = 'approved';
    this.approvedBy = userId;
    this.approvedAt = new Date();
    if (remarks) {
        this.remarks = remarks;
    }
    return this.save();
};

// Instance method to mark as paid
expenseSchema.methods.markAsPaid = function(remarks = '') {
    this.status = 'paid';
    if (remarks) {
        this.remarks = this.remarks ? `${this.remarks}\n${remarks}` : remarks;
    }
    return this.save();
};

export default mongoose.model('Expense', expenseSchema);
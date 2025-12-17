import mongoose from 'mongoose';

const budgetMngrSchema = new mongoose.Schema({
    budgetCode: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    budgetType: {
        type: String,
        enum: ['operational', 'capital', 'project', 'departmental'],
        required: true
    },
    fiscalYear: {
        type: String,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    allocatedAmount: {
        type: Number,
        default: 0
    },
    spentAmount: {
        type: Number,
        default: 0
    },
    remainingAmount: {
        type: Number,
        default: 0
    },
    startDate: Date,
    endDate: Date,
    status: {
        type: String,
        enum: ['draft', 'submitted', 'approved', 'rejected', 'active', 'closed'],
        default: 'draft'
    },
    preparedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    categories: [{
        category: String,
        allocated: Number,
        spent: Number,
        remaining: Number
    }],
    remarks: String
}, {
    timestamps: true
});

// Calculate remaining amount before saving
budgetMngrSchema.pre('save', function(next) {
    this.remainingAmount = this.allocatedAmount - this.spentAmount;
    next();
});

budgetMngrSchema.index({ budgetCode: 1 });
budgetMngrSchema.index({ department: 1 });
budgetMngrSchema.index({ fiscalYear: 1 });

export default mongoose.model('BudgetMngr', budgetMngrSchema);
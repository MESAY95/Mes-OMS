import mongoose from 'mongoose';

const salarySchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    basicSalary: {
        type: Number,
        required: true
    },
    allowances: {
        type: Number,
        default: 0
    },
    deductions: {
        type: Number,
        default: 0
    },
    netSalary: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    payPeriod: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'cancelled'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Calculate net salary before saving
salarySchema.pre('save', function(next) {
    this.netSalary = this.basicSalary + this.allowances - this.deductions;
    next();
});

export default mongoose.model('Salary', salarySchema);
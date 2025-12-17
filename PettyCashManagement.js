import mongoose from 'mongoose';

const pettyCashManagementSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    activity: {
        type: String,
        required: true,
        enum: ['Debit', 'Credit']
    },
    action: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    PCPV: {
        type: String,
        required: true,
        trim: true
    },
    paymentDescription: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'ETB',
        enum: ['ETB'] // Only ETB allowed
    },
    attachment: {
        type: String,
        trim: true
    },
    preparedBy: {
        type: String,
        required: true,
        trim: true
    },
    checkedBy: {
        type: String,
        trim: true
    },
    approvedBy: {
        type: String,
        trim: true
    },
    remarks: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

pettyCashManagementSchema.pre('save', async function(next) {
    if (!this.PCPV) {
        const count = await mongoose.model('PettyCashManagement').countDocuments();
        this.PCPV = `PCPV-${Date.now()}-${count + 1}`;
    }
    // Ensure currency is always ETB
    this.currency = 'ETB';
    next();
});

pettyCashManagementSchema.index({ date: 1 });
pettyCashManagementSchema.index({ PCPV: 1 });
pettyCashManagementSchema.index({ activity: 1 });
pettyCashManagementSchema.index({ action: 1 });

pettyCashManagementSchema.virtual('signedAmount').get(function() {
    return this.activity === 'Debit' ? -this.amount : this.amount;
});

export default mongoose.model('PettyCashManagement', pettyCashManagementSchema);
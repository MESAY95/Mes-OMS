import mongoose from 'mongoose';

const incomeSchema = new mongoose.Schema({
    incomeCode: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    date: {
        type: Date,
        required: true
    },
    receivedFrom: String,
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'check', 'credit_card', 'mobile_payment'],
        default: 'cash'
    },
    referenceNumber: String,
    invoiceNumber: String,
    status: {
        type: String,
        enum: ['pending', 'received', 'cancelled'],
        default: 'pending'
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    receivedAt: Date,
    remarks: String
}, {
    timestamps: true
});

incomeSchema.index({ incomeCode: 1 });
incomeSchema.index({ date: 1 });
incomeSchema.index({ category: 1 });

export default mongoose.model('Income', incomeSchema);
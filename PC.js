import mongoose from 'mongoose';

const pcSchema = new mongoose.Schema({
    transactionCode: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['receipt', 'payment'],
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
    description: String,
    category: String,
    receivedFrom: String,
    paidTo: String,
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed'],
        default: 'pending'
    },
    receiptNumber: String,
    balanceAfter: Number,
    remarks: String
}, {
    timestamps: true
});

pcSchema.index({ transactionCode: 1 });
pcSchema.index({ date: 1 });
pcSchema.index({ type: 1 });

export default mongoose.model('PC', pcSchema);
import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    type: {
        type: String,
        enum: ['individual', 'corporate', 'government'],
        default: 'individual'
    },
    contactPerson: String,
    email: String,
    phone: String,
    mobile: String,
    address: String,
    city: String,
    country: String,
    taxNumber: String,
    paymentTerms: String,
    creditLimit: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    currentBalance: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'blocked'],
        default: 'active'
    },
    category: String,
    salesRepresentative: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastPurchaseDate: Date,
    totalPurchases: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    },
    remarks: String
}, {
    timestamps: true
});

customerSchema.index({ code: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ type: 1 });
customerSchema.index({ status: 1 });

export default mongoose.model('Customer', customerSchema);
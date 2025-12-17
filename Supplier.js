import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
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
    contactPerson: String,
    email: String,
    phone: String,
    mobile: String,
    address: String,
    city: String,
    country: String,
    taxNumber: String,
    paymentTerms: String,
    bankDetails: {
        bankName: String,
        accountNumber: String,
        accountName: String
    },
    productsSupplied: [String],
    rating: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    lastOrderDate: Date,
    totalOrders: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    remarks: String
}, {
    timestamps: true
});

supplierSchema.index({ code: 1 });
supplierSchema.index({ name: 1 });
supplierSchema.index({ status: 1 });

export default mongoose.model('Supplier', supplierSchema);
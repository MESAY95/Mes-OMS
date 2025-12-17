import mongoose from 'mongoose';

const productQSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    batchNumber: String,
    productionDate: Date,
    quantityTested: Number,
    quantityAccepted: Number,
    quantityRejected: Number,
    testParameters: [{
        parameter: String,
        standard: String,
        actual: String,
        status: {
            type: String,
            enum: ['pass', 'fail', 'conditional']
        }
    }],
    overallStatus: {
        type: String,
        enum: ['approved', 'rejected', 'conditional'],
        required: true
    },
    testedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    testedAt: {
        type: Date,
        default: Date.now
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String,
    correctiveAction: String,
    customerFeedback: String,
    remarks: String
}, {
    timestamps: true
});

// Calculate acceptance rate
productQSchema.virtual('acceptanceRate').get(function() {
    if (this.quantityTested === 0) return 0;
    return (this.quantityAccepted / this.quantityTested) * 100;
});

productQSchema.index({ product: 1, testedAt: -1 });
productQSchema.index({ overallStatus: 1 });

export default mongoose.model('ProductQ', productQSchema);
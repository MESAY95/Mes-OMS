import mongoose from 'mongoose';

const materialQSchema = new mongoose.Schema({
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: true
    },
    batchNumber: String,
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier'
    },
    receivedDate: Date,
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
    remarks: String
}, {
    timestamps: true
});

// Calculate acceptance rate
materialQSchema.virtual('acceptanceRate').get(function() {
    if (this.quantityTested === 0) return 0;
    return (this.quantityAccepted / this.quantityTested) * 100;
});

materialQSchema.index({ material: 1, testedAt: -1 });
materialQSchema.index({ overallStatus: 1 });

export default mongoose.model('MaterialQ', materialQSchema);
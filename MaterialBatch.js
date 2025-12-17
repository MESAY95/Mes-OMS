import mongoose from 'mongoose';

const materialBatchSchema = new mongoose.Schema({
    material: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Material',
        required: true
    },
    batchNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    unitPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    totalValue: {
        type: Number,
        default: 0
    },
    manufacturingDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'depleted', 'reserved'],
        default: 'active'
    },
    // Additional batch tracking fields
    receivedDate: {
        type: Date,
        default: Date.now
    },
    supplier: String,
    qualityStatus: {
        type: String,
        enum: ['approved', 'pending', 'rejected', 'quarantine'],
        default: 'approved'
    },
    location: String, // Storage location
    shelfNumber: String,
    remarks: String,
    // Track batch movements
    lastTransaction: {
        type: Date,
        default: Date.now
    },
    transactionCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Calculate total value before saving
materialBatchSchema.pre('save', function(next) {
    this.totalValue = this.quantity * this.unitPrice;
    next();
});

// Update status based on quantity, expiry date, and quality status
materialBatchSchema.pre('save', function(next) {
    const now = new Date();
    
    // Check if expired
    if (this.expiryDate && this.expiryDate < now) {
        this.status = 'expired';
    } 
    // Check if depleted
    else if (this.quantity <= 0) {
        this.status = 'depleted';
    }
    // Check if in quarantine
    else if (this.qualityStatus === 'quarantine' || this.qualityStatus === 'rejected') {
        this.status = 'reserved';
    }
    // Otherwise active
    else {
        this.status = 'active';
    }
    
    // Update last transaction date if quantity changes
    if (this.isModified('quantity')) {
        this.lastTransaction = new Date();
        this.transactionCount += 1;
    }
    
    next();
});

// Virtual for days until expiry
materialBatchSchema.virtual('daysUntilExpiry').get(function() {
    if (!this.expiryDate) return null;
    const now = new Date();
    const expiry = new Date(this.expiryDate);
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for batch age
materialBatchSchema.virtual('batchAge').get(function() {
    const now = new Date();
    const created = new Date(this.receivedDate);
    const diffTime = now - created;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// Method to check if batch is near expiry
materialBatchSchema.methods.isNearExpiry = function(daysThreshold = 30) {
    if (!this.expiryDate) return false;
    const daysUntilExpiry = this.daysUntilExpiry;
    return daysUntilExpiry >= 0 && daysUntilExpiry <= daysThreshold;
};

// Method to reserve batch quantity
materialBatchSchema.methods.reserveQuantity = async function(quantity) {
    if (this.quantity < quantity) {
        throw new Error(`Insufficient quantity. Available: ${this.quantity}, Requested: ${quantity}`);
    }
    this.quantity -= quantity;
    this.status = 'reserved';
    return await this.save();
};

// Method to release reserved quantity
materialBatchSchema.methods.releaseQuantity = async function(quantity) {
    this.quantity += quantity;
    this.status = 'active';
    return await this.save();
};

// Static method to find batches near expiry
materialBatchSchema.statics.findNearExpiry = function(daysThreshold = 30) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
    
    return this.find({
        expiryDate: {
            $lte: thresholdDate,
            $gte: new Date() // Not expired yet
        },
        quantity: { $gt: 0 }
    }).populate('material');
};

// Static method to find low stock batches
materialBatchSchema.statics.findLowStock = function(minQuantity = 10) {
    return this.find({
        quantity: { $lte: minQuantity, $gt: 0 }
    }).populate('material');
};

// Static method to get batch summary for a material
materialBatchSchema.statics.getMaterialBatchSummary = async function(materialId) {
    const batches = await this.find({ material: materialId });
    
    const summary = {
        totalBatches: batches.length,
        activeBatches: batches.filter(b => b.status === 'active').length,
        expiredBatches: batches.filter(b => b.status === 'expired').length,
        depletedBatches: batches.filter(b => b.status === 'depleted').length,
        reservedBatches: batches.filter(b => b.status === 'reserved').length,
        totalQuantity: batches.reduce((sum, batch) => sum + batch.quantity, 0),
        totalValue: batches.reduce((sum, batch) => sum + batch.totalValue, 0),
        nearExpiry: batches.filter(batch => batch.isNearExpiry(30)).length
    };
    
    return summary;
};

// Static method to generate batch number
materialBatchSchema.statics.generateBatchNumber = function(materialCode, date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${materialCode}-${day}${month}${year}`.toUpperCase();
};

// Static method to get available batches for a material (for issue transactions)
materialBatchSchema.statics.getAvailableBatches = function(materialId) {
    return this.find({
        material: materialId,
        quantity: { $gt: 0 },
        $or: [
            { status: 'active' },
            { status: { $exists: false } } // Include batches without status field
        ]
    }).populate('material').sort({ batchNumber: 1 });
};

// Static method to update batch stock (used by MaterialRI)
materialBatchSchema.statics.updateBatchStock = async function(materialId, batchNumber, quantityChange, operationType) {
    const batch = await this.findOne({
        material: materialId,
        batchNumber: batchNumber
    });

    if (!batch) {
        throw new Error(`Batch ${batchNumber} not found for material`);
    }

    if (operationType === 'receive') {
        batch.quantity += quantityChange;
    } else if (operationType === 'issue') {
        if (batch.quantity < quantityChange) {
            throw new Error(`Insufficient stock in batch ${batchNumber}. Available: ${batch.quantity}, Requested: ${quantityChange}`);
        }
        batch.quantity -= quantityChange;
    }

    await batch.save();
    return batch;
};

// Instance method to get batch transaction history
materialBatchSchema.methods.getTransactionHistory = async function() {
    const MaterialRI = mongoose.model('MaterialRI');
    return await MaterialRI.find({
        material: this.material,
        batchNumber: this.batchNumber
    }).sort({ date: -1, createdAt: -1 });
};

// Static method to get batch by number with material details
materialBatchSchema.statics.getBatchDetails = async function(batchNumber) {
    return await this.findOne({ batchNumber })
        .populate('material');
};

// Indexes for performance
materialBatchSchema.index({ material: 1, batchNumber: 1 }, { unique: true });
materialBatchSchema.index({ expiryDate: 1 });
materialBatchSchema.index({ status: 1 });
materialBatchSchema.index({ quantity: 1 });
materialBatchSchema.index({ receivedDate: 1 });
materialBatchSchema.index({ lastTransaction: 1 });
materialBatchSchema.index({ 
    material: 1, 
    status: 1, 
    quantity: 1 
});
// Compound index for common queries
materialBatchSchema.index({ 
    status: 1, 
    expiryDate: 1, 
    quantity: 1 
});
// Index for batch number searches
materialBatchSchema.index({ batchNumber: 1 });

// Ensure virtual fields are serialized
materialBatchSchema.set('toJSON', { virtuals: true });
materialBatchSchema.set('toObject', { virtuals: true });

export default mongoose.model('MaterialBatch', materialBatchSchema);
import mongoose from 'mongoose';

const spareSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true,
        unique: true
    },
    category: String,
    description: String,
    equipment: String,
    currentStock: {
        type: Number,
        default: 0,
        min: 0
    },
    minStock: {
        type: Number,
        default: 0,
        min: 0
    },
    maxStock: {
        type: Number,
        default: 0,
        min: 0
    },
    unitPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier'
    },
    location: String,
    shelfLife: Number, // in months
    lastOrderDate: Date,
    nextOrderDate: Date,
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Check if stock needs reorder
spareSchema.virtual('needsReorder').get(function() {
    return this.currentStock <= this.minStock;
});

// Calculate total value
spareSchema.virtual('totalValue').get(function() {
    return this.currentStock * this.unitPrice;
});

spareSchema.index({ code: 1 });
spareSchema.index({ equipment: 1 });
spareSchema.index({ isActive: 1 });

export default mongoose.model('Spare', spareSchema);
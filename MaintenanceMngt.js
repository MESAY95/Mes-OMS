import mongoose from 'mongoose';

const maintenanceMngtSchema = new mongoose.Schema({
    equipment: {
        type: String,
        required: true
    },
    equipmentCode: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    maintenanceType: {
        type: String,
        enum: ['preventive', 'corrective', 'predictive', 'breakdown'],
        required: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reportedDate: {
        type: Date,
        default: Date.now
    },
    problemDescription: String,
    assignedTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    scheduledDate: Date,
    startDate: Date,
    completedDate: Date,
    status: {
        type: String,
        enum: ['reported', 'assigned', 'in_progress', 'completed', 'cancelled'],
        default: 'reported'
    },
    actualHours: Number,
    estimatedHours: Number,
    sparePartsUsed: [{
        spare: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Spare'
        },
        quantity: Number,
        unitCost: Number,
        totalCost: Number
    }],
    laborCost: Number,
    totalCost: Number,
    downtimeHours: Number,
    rootCause: String,
    correctiveAction: String,
    preventiveAction: String,
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: Date,
    remarks: String
}, {
    timestamps: true
});

// Calculate total cost before saving
maintenanceMngtSchema.pre('save', function(next) {
    let sparePartsCost = 0;
    if (this.sparePartsUsed && this.sparePartsUsed.length > 0) {
        sparePartsCost = this.sparePartsUsed.reduce((total, part) => {
            return total + (part.totalCost || 0);
        }, 0);
    }
    
    this.totalCost = sparePartsCost + (this.laborCost || 0);
    next();
});

maintenanceMngtSchema.index({ equipmentCode: 1 });
maintenanceMngtSchema.index({ status: 1 });
maintenanceMngtSchema.index({ maintenanceType: 1 });

export default mongoose.model('MaintenanceMngt', maintenanceMngtSchema);
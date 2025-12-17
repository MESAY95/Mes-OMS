import mongoose from 'mongoose';

const maintenancePlnSchema = new mongoose.Schema({
    equipment: {
        type: String,
        required: true
    },
    equipmentCode: {
        type: String,
        required: true
    },
    maintenanceType: {
        type: String,
        enum: ['preventive', 'predictive', 'calibration'],
        required: true
    },
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'],
        required: true
    },
    frequencyValue: Number, // e.g., 30 for 30 days
    lastMaintenanceDate: Date,
    nextMaintenanceDate: Date,
    estimatedHours: Number,
    assignedTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    requiredSpares: [{
        spare: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Spare'
        },
        quantity: Number
    }],
    checklist: [{
        item: String,
        standard: String,
        tolerance: String
    }],
    status: {
        type: String,
        enum: ['active', 'inactive', 'completed', 'overdue'],
        default: 'active'
    },
    isRecurring: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    remarks: String
}, {
    timestamps: true
});

// Calculate next maintenance date
maintenancePlnSchema.pre('save', function(next) {
    if (this.lastMaintenanceDate && this.frequencyValue) {
        const nextDate = new Date(this.lastMaintenanceDate);
        switch (this.frequency) {
            case 'daily':
                nextDate.setDate(nextDate.getDate() + this.frequencyValue);
                break;
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + (this.frequencyValue * 7));
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + this.frequencyValue);
                break;
            case 'quarterly':
                nextDate.setMonth(nextDate.getMonth() + (this.frequencyValue * 3));
                break;
            case 'half_yearly':
                nextDate.setMonth(nextDate.getMonth() + (this.frequencyValue * 6));
                break;
            case 'yearly':
                nextDate.setFullYear(nextDate.getFullYear() + this.frequencyValue);
                break;
        }
        this.nextMaintenanceDate = nextDate;
    }
    next();
});

maintenancePlnSchema.index({ equipmentCode: 1 });
maintenancePlnSchema.index({ nextMaintenanceDate: 1 });
maintenancePlnSchema.index({ status: 1 });

export default mongoose.model('MaintenancePln', maintenancePlnSchema);
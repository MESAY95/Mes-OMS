import mongoose from 'mongoose';

const ProductionScheduleSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  productName: {
    type: String,
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Products',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1']
  },
  lineCode: {
    type: String,
    required: true
  },
  lineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Line',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'delayed', 'cancelled'],
    default: 'scheduled'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  assignedTo: {
    type: String,
    required: true
  },
  assignedEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  plannedHours: {
    type: Number,
    required: true,
    min: [0, 'Planned hours cannot be negative']
  },
  actualHours: {
    type: Number,
    default: 0,
    min: [0, 'Actual hours cannot be negative']
  },
  timeFrame: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annual'],
    default: 'daily'
  },
  parentPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductionPlan'
  },
  yearRange: {
    type: String,
    enum: ['2024-2025', '2025-2026', '2026-2027', '2027-2028', '2028-2029', '2029-2030'],
    default: '2025-2026'
  },
  constraints: {
    materialAvailable: { type: Boolean, default: true },
    machineAvailable: { type: Boolean, default: true },
    laborAvailable: { type: Boolean, default: true },
    capacityAvailable: { type: Boolean, default: true },
    notes: { type: String, default: '' }
  },
  completionRate: {
    type: Number,
    default: 0,
    min: [0, 'Completion rate cannot be negative'],
    max: [100, 'Completion rate cannot exceed 100%']
  },
  actualStartDate: {
    type: Date
  },
  actualEndDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
ProductionScheduleSchema.index({ orderId: 1 });
ProductionScheduleSchema.index({ lineId: 1 });
ProductionScheduleSchema.index({ startDate: 1 });
ProductionScheduleSchema.index({ endDate: 1 });
ProductionScheduleSchema.index({ status: 1 });
ProductionScheduleSchema.index({ productId: 1 });
ProductionScheduleSchema.index({ yearRange: 1 });

// Pre-save middleware to validate dates
ProductionScheduleSchema.pre('save', function(next) {
  if (this.startDate && this.endDate && this.startDate >= this.endDate) {
    return next(new Error('End date must be after start date'));
  }
  
  // Auto-calculate completion rate if actual hours are provided
  if (this.actualHours > 0 && this.plannedHours > 0) {
    this.completionRate = Math.min((this.actualHours / this.plannedHours) * 100, 100);
  }
  
  next();
});

// Virtual for duration in days
ProductionScheduleSchema.virtual('durationDays').get(function() {
  if (!this.startDate || !this.endDate) return 0;
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to check if schedule is overdue
ProductionScheduleSchema.methods.isOverdue = function() {
  if (this.status === 'completed' || this.status === 'cancelled') return false;
  return new Date() > this.endDate;
};

// Static method to find schedules by line and date range
ProductionScheduleSchema.statics.findByLineAndDateRange = function(lineId, startDate, endDate) {
  return this.find({
    lineId: lineId,
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
      { startDate: { $gte: startDate, $lte: endDate } }
    ]
  });
};

export default mongoose.model('ProductionSchedule', ProductionScheduleSchema, 'productionschedules');
import mongoose from 'mongoose';

const CapacitySchema = new mongoose.Schema({
  productionLine: {
    type: String,
    required: true,
    unique: true,
    enum: ['Line 1', 'Line 2', 'Line 3', 'Line 4']
  },
  maxCapacity: {
    type: Number,
    required: true,
    default: 100
  },
  currentUtilization: {
    type: Number,
    default: 0
  },
  availableHours: {
    type: Number,
    default: 160
  },
  scheduledHours: {
    type: Number,
    default: 0
  },
  maintenanceSchedule: [{
    startDate: Date,
    endDate: Date,
    reason: String
  }],
  efficiency: {
    type: Number,
    default: 85
  }
}, {
  timestamps: true
});

export default mongoose.model('Capacity', CapacitySchema);
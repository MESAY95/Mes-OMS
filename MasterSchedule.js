import mongoose from 'mongoose';

const MasterScheduleSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  quarterlyTargets: {
    Q1: { type: Number, default: 0 },
    Q2: { type: Number, default: 0 },
    Q3: { type: Number, default: 0 },
    Q4: { type: Number, default: 0 }
  },
  monthlyTargets: [{
    month: String,
    target: Number,
    actual: { type: Number, default: 0 }
  }],
  weeklyTargets: [{
    week: String,
    target: Number,
    actual: { type: Number, default: 0 }
  }]
}, {
  timestamps: true
});

export default mongoose.model('MasterSchedule', MasterScheduleSchema);
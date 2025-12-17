// models/ProductionPlan.js
import mongoose from 'mongoose';

const ProductionPlanSchema = new mongoose.Schema({
  planId: {
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
    ref: 'Product',
    required: true
  },
  annualQuantity: {
    type: Number,
    required: true
  },
  yearRange: {
    type: String,
    enum: ['2024-2025', '2025-2026', '2026-2027'],
    required: true
  },
  quarterlyBreakdown: [{
    quarter: { type: Number, required: true },
    quantity: { type: Number, required: true },
    months: [{
      month: { type: Number, required: true },
      quantity: { type: Number, required: true },
      weeks: [{
        week: { type: Number, required: true },
        quantity: { type: Number, required: true },
        days: [{
          date: { type: Date, required: true },
          quantity: { type: Number, required: true }
        }]
      }]
    }]
  }],
  status: {
    type: String,
    enum: ['draft', 'approved', 'in-progress', 'completed'],
    default: 'draft'
  },
  lineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Line'
  },
  capacityRequirements: {
    totalHoursRequired: { type: Number },
    availableHours: { type: Number },
    utilizationRate: { type: Number }
  }
}, {
  timestamps: true
});

export default mongoose.model('ProductionPlan', ProductionPlanSchema);
import mongoose from 'mongoose';

const InventoryPlanSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['Product', 'Material'],
    required: true
  },
  item: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  fiscalYear: {
    type: Number,
    required: true,
    min: 2000,
    max: 2100
  },
  month: {
    type: String,
    enum: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    required: true
  },
  balanceType: {
    type: String,
    enum: ['Opening Balance', 'Closing Balance'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  note: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound index to ensure unique inventory plans per period
InventoryPlanSchema.index({ category: 1, item: 1, fiscalYear: 1, month: 1, balanceType: 1 }, { unique: true });

export default mongoose.model('InventoryPlan', InventoryPlanSchema);
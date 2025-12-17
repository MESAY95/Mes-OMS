import mongoose from 'mongoose';

const materialROSSchema = new mongoose.Schema({
  Material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  Unit: { type: String, required: true },
  MinimumStockLevel: { type: Number, required: true },
  MaximumStockLevel: { type: Number, required: true },
  DangerStockLevel: { type: Number, required: true },
  AvailableStock: { type: Number, required: true },
  ReorderPoint: { type: Number, required: true },
  Status: { type: String, enum: ['Active', 'Out of Stock', 'Danger Level'], default: 'Active' }
});

export default mongoose.model('MaterialROS', materialROSSchema);
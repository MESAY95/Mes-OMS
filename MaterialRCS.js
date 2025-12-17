import mongoose from 'mongoose';

const materialRCSSchema = new mongoose.Schema({
  Date: { type: Date, default: Date.now },
  Material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  Batch: { type: String, required: true },
  Unit: { type: String, required: true },
  Quantity: { type: Number, required: true },
  Type: { type: String, enum: ['Receive', 'Consume'] },
  Note: { type: String },
  DocNo: { type: String }
});

export default mongoose.model('MaterialRCS', materialRCSSchema);
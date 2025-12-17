import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  Product: { type: String, required: true },
  ProductCode: { type: String, required: true },
  PackSize: { type: Number, required: true },
  Unit: { type: String, required: true },
  ProductPrice: { type: Number, required: true },
  ReorderQuantity: { type: Number, required: true },
  MinimumStock: { type: Number, required: true },
  MaximumStock: { type: Number, required: true },
  MinimumLeadTime: { type: Number, required: true },
  MaximumLeadTime: { type: Number, required: true },
  Status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, {
  timestamps: true
});

// Indexes for performance
productSchema.index({ ProductCode: 1 });
productSchema.index({ Status: 1 });
productSchema.index({ Product: 'text' });

export default mongoose.model('Products', productSchema);
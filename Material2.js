import mongoose from 'mongoose';

const material2Schema = new mongoose.Schema({
  Material: { type: String, required: true },
  MaterialCode: { type: String, required: true },
  PackSize: { type: Number, required: true },
  Unit: { type: String, required: true },
  UnitPrice: { type: Number, required: true },
  ReorderQuantity: { type: Number, required: true },
  MinimumConsumption: { type: Number, required: true },
  MaximumConsumption: { type: Number, required: true },
  MinimumLeadTime: { type: Number, required: true },
  MaximumLeadTime: { type: Number, required: true },
  Status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, {
  timestamps: true // Optional: adds createdAt and updatedAt fields
});

// Optional: Add index for better query performance
material2Schema.index({ MaterialCode: 1 });
material2Schema.index({ Status: 1 });

export default mongoose.model('Materials', material2Schema);
import mongoose from 'mongoose';

const MaterialCostSchema = new mongoose.Schema({
  product: {
    type: String,
    required: true
  },
  productUnit: {
    type: String,
    required: true
  },
  material: {
    type: String,
    required: true
  },
  materialUnit: {
    type: String,
    required: true
  },
  materialPrice: {
    type: Number,
    required: true,
    min: 0
  },
  priceIncrement: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0
  },
  note: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound index to ensure unique product-material combinations
MaterialCostSchema.index({ product: 1, material: 1 }, { unique: true });

// Pre-save middleware to calculate total cost
MaterialCostSchema.pre('save', function(next) {
  this.totalCost = this.materialPrice + (this.materialPrice * this.priceIncrement / 100);
  next();
});

export default mongoose.model('MaterialCost', MaterialCostSchema);
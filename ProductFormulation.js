import mongoose from 'mongoose';

const ProductFormulationSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  materialName: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  materialUnit: {
    type: String,
    required: true,
    trim: true
  },
  lossFactor: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    validate: {
      validator: function(v) {
        return v >= 0 && v <= 100;
      },
      message: 'Loss factor must be between 0 and 100'
    }
  },
  // Add effective quantity field for calculations
  effectiveQuantity: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  }
}, {
  timestamps: true
});

// Calculate effective quantity before saving
ProductFormulationSchema.pre('save', function(next) {
  const lossMultiplier = 1 + (this.lossFactor / 100);
  this.effectiveQuantity = this.quantity * lossMultiplier;
  next();
});

// Calculate effective quantity before updating
ProductFormulationSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.quantity !== undefined || update.lossFactor !== undefined) {
    const quantity = update.quantity || this._update.quantity;
    const lossFactor = update.lossFactor || this._update.lossFactor || 0;
    const lossMultiplier = 1 + (lossFactor / 100);
    this.set({ effectiveQuantity: quantity * lossMultiplier });
  }
  next();
});

// Index to ensure unique combination of productName and materialName
ProductFormulationSchema.index({ productName: 1, materialName: 1 }, { unique: true });

export default mongoose.model('ProductFormulation', ProductFormulationSchema);
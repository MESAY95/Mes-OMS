import mongoose from 'mongoose';

const infoPricingSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: 500
  },
  // Change from enum to ObjectId reference
  productType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product type is required']
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material'
  },
  value: {
    type: Number,
    required: [true, 'Value is required'],
    min: [0, 'Value cannot be negative'],
    set: v => parseFloat(v.toFixed(4))
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    trim: true,
    maxlength: 10
  },
  remark: {
    type: String,
    default: '',
    trim: true,
    maxlength: 1000
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Raw Material', 'Packaging', 'Labor', 'Overhead', 'Transport', 'Utility', 'Other']
  },
  calculationRules: {
    allocationFactor: { type: Number, default: 1.0 },
    wasteFactor: { type: Number, default: 1.0 },
    usageRate: { type: Number, default: 1.0 },
    isFixedCost: { type: Boolean, default: false }
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  auditTrail: {
    createdBy: { type: String, default: 'system' },
    lastModifiedBy: String,
    lastModifiedAt: Date
  }
}, {
  timestamps: true
});

// Update indexes
infoPricingSchema.index({ productType: 1, category: 1, isActive: 1 });
infoPricingSchema.index({ materialId: 1 });
infoPricingSchema.index({ effectiveDate: -1 });
infoPricingSchema.index({ category: 1, isActive: 1 });

// Update static methods to work with ObjectId
infoPricingSchema.statics.getActiveByProductType = function(productTypeId) {
  return this.find({ 
    productType: productTypeId, 
    isActive: true,
    effectiveDate: { $lte: new Date() },
    $or: [
      { expiryDate: { $exists: false } },
      { expiryDate: { $gte: new Date() } }
    ]
  })
  .populate('productType', 'name sku category')
  .populate('materialId', 'name sku category unit currentPrice')
  .sort({ category: 1, description: 1 });
};

// Update duplicate check method
infoPricingSchema.statics.checkDuplicate = function(productTypeId, description, category, effectiveDate) {
  return this.findOne({
    productType: productTypeId,
    description: { $regex: new RegExp(`^${description}$`, 'i') },
    category,
    effectiveDate,
    isActive: true
  });
};

const InfoPricing = mongoose.model('InfoPricing', infoPricingSchema);
export default InfoPricing;
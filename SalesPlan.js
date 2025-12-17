import mongoose from 'mongoose';

const SalesPlanSchema = new mongoose.Schema({
  // ✅ FIXED: Store product name only (no ObjectId reference)
  productName: {
    type: String,
    required: [true, 'Product name is required']
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    default: 'Unit'
  },
  // UPDATED: Fiscal Year as String in range format (e.g., "2025-2026")
  fiscalYear: {
    type: String,
    required: [true, 'Fiscal year is required'],
    validate: {
      validator: function(v) {
        // Validate format like "2024-2025", "2025-2026", etc.
        return /^\d{4}-\d{4}$/.test(v) && 
               parseInt(v.split('-')[1]) === parseInt(v.split('-')[0]) + 1;
      },
      message: 'Fiscal year must be in format "YYYY-YYYY" where second year is first year + 1 (e.g., "2025-2026")'
    }
  },
  month: {
    type: String,
    required: [true, 'Month is required'],
    enum: {
      values: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      message: '{VALUE} is not a valid month'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['Active', 'Inactive'],
      message: '{VALUE} is not a valid status'
    },
    default: 'Active'
  },
  note: {
    type: String,
    default: '',
    maxlength: [500, 'Note cannot exceed 500 characters']
  },
  targetQuantity: {
    type: Number,
    required: [true, 'Target quantity is required'],
    min: [0, 'Target quantity cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Target quantity must be an integer'
    }
  }
}, {
  timestamps: true
});

// ✅ FIXED: Use proper compound index without planId
SalesPlanSchema.index({ productName: 1, fiscalYear: 1, month: 1, status: 1 });

// Index for better query performance
SalesPlanSchema.index({ fiscalYear: 1, month: 1 });
SalesPlanSchema.index({ productName: 1, status: 1 });
SalesPlanSchema.index({ fiscalYear: 1, productName: 1 });

// ✅ FIXED: Virtual for display name
SalesPlanSchema.virtual('displayName').get(function() {
  return `${this.fiscalYear} - ${this.month} - ${this.productName}`;
});

// ✅ FIXED: Pre-save middleware - enhanced validation
SalesPlanSchema.pre('save', function(next) {
  // Ensure unit is never empty
  if (!this.unit || this.unit.trim() === '') {
    this.unit = 'Unit';
    console.warn('⚠️ No unit provided, using default: Unit');
  }
  
  // Validate target quantity
  if (this.targetQuantity < 0) {
    const err = new Error('Target quantity cannot be negative');
    return next(err);
  }
  
  // ✅ ENHANCED: Log the ID generation with more details
  if (this.isNew) {
    console.log('🆕 Creating new sales plan with auto-generated ID:', {
      productName: this.productName,
      fiscalYear: this.fiscalYear,
      month: this.month,
      targetQuantity: this.targetQuantity
    });
  }
  
  next();
});

// ✅ ENHANCED: Static method to get dashboard statistics with better error handling
SalesPlanSchema.statics.getDashboardStats = async function(fiscalYear = null) {
  try {
    const matchStage = fiscalYear ? { fiscalYear, status: 'Active' } : { status: 'Active' };
    
    const stats = await this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalTarget: { $sum: '$targetQuantity' }
        }
      }
    ]);

    const totalStats = await this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalPlans: { $sum: 1 },
          totalTarget: { $sum: '$targetQuantity' },
          activePlans: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          }
        }
      }
    ]);

    return {
      success: true,
      byStatus: stats,
      overall: totalStats[0] || { 
        totalPlans: 0, 
        totalTarget: 0, 
        activePlans: 0 
      }
    };
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    throw error;
  }
};

// ✅ NEW: Instance method for formatted response
SalesPlanSchema.methods.toFormattedJSON = function() {
  const salesPlan = this.toObject();
  salesPlan.displayName = this.displayName;
  salesPlan.id = salesPlan._id;
  delete salesPlan.__v;
  return salesPlan;
};

export default mongoose.model('SalesPlan', SalesPlanSchema);
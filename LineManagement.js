import mongoose from 'mongoose';

const LineSchema = new mongoose.Schema({
  lineCode: {
    type: String,
    required: [true, 'Line code is required'],
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [20, 'Line code cannot exceed 20 characters']
  },
  lineName: {
    type: String,
    required: [true, 'Line name is required'],
    trim: true,
    maxlength: [100, 'Line name cannot exceed 100 characters']
  },
  description: {
    type: String,
    default: '',
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  capacity: {
    hourlyCapacity: { 
      type: Number, 
      required: [true, 'Hourly capacity is required'],
      min: [0, 'Hourly capacity must be positive'],
      max: [1000000, 'Hourly capacity too large']
    },
    dailyCapacity: { 
      type: Number, 
      required: [true, 'Daily capacity is required'],
      min: [0, 'Daily capacity must be positive'],
      max: [10000000, 'Daily capacity too large']
    },
    weeklyCapacity: { 
      type: Number, 
      required: [true, 'Weekly capacity is required'],
      min: [0, 'Weekly capacity must be positive'],
      max: [50000000, 'Weekly capacity too large']
    },
    monthlyCapacity: { 
      type: Number, 
      required: [true, 'Monthly capacity is required'],
      min: [0, 'Monthly capacity must be positive'],
      max: [200000000, 'Monthly capacity too large']
    }
  },
  operationalHours: {
    shiftsPerDay: { 
      type: Number, 
      default: 2,
      min: [1, 'Minimum 1 shift per day'],
      max: [3, 'Maximum 3 shifts per day']
    },
    hoursPerShift: { 
      type: Number, 
      default: 8,
      min: [4, 'Minimum 4 hours per shift'],
      max: [12, 'Maximum 12 hours per shift']
    },
    workingDaysPerWeek: { 
      type: Number, 
      default: 5,
      min: [1, 'Minimum 1 working day per week'],
      max: [7, 'Maximum 7 working days per week']
    }
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'maintenance'],
      message: 'Status must be active, inactive, or maintenance'
    },
    default: 'active'
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Products',
    validate: {
      validator: async function(v) {
        // Skip validation if product array is empty
        if (!v || v.length === 0) return true;
        
        // Handle both single ID and array of IDs
        const productIds = Array.isArray(v) ? v : [v];
        
        for (const productId of productIds) {
          if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.error('Invalid product ID format:', productId);
            return false;
          }
          
          try {
            const product = await mongoose.model('Products').findById(productId);
            if (!product) {
              console.error('Product not found:', productId);
              return false;
            }
            
            // Check if product status is 'Active'
            if (product.Status !== 'Active') {
              console.error('Product is not active:', productId, product.Status);
              return false;
            }
          } catch (error) {
            console.error('Error validating product:', productId, error);
            return false;
          }
        }
        return true;
      },
      message: 'Invalid product ID format, product not found, or product is not active'
    }
  }]
}, {
  timestamps: true
});

// Indexes for better performance
LineSchema.index({ lineCode: 1 });
LineSchema.index({ status: 1 });
LineSchema.index({ lineName: 1 });
LineSchema.index({ products: 1 });

// Pre-save middleware to ensure lineCode is uppercase
LineSchema.pre('save', function(next) {
  if (this.lineCode) {
    this.lineCode = this.lineCode.toUpperCase().trim();
  }
  if (this.lineName) {
    this.lineName = this.lineName.trim();
  }
  if (this.description) {
    this.description = this.description.trim();
  }
  next();
});

// Virtual for populated products
LineSchema.virtual('productDetails', {
  ref: 'Products',
  localField: 'products',
  foreignField: '_id'
});

// Method to calculate capacity based on operational hours
LineSchema.methods.calculateCapacity = function() {
  const dailyHours = this.operationalHours.shiftsPerDay * this.operationalHours.hoursPerShift;
  const weeklyHours = dailyHours * this.operationalHours.workingDaysPerWeek;
  const monthlyHours = weeklyHours * 4; // Approximate 4 weeks per month
  
  return {
    hourlyCapacity: this.capacity.hourlyCapacity,
    dailyCapacity: this.capacity.hourlyCapacity * dailyHours,
    weeklyCapacity: this.capacity.hourlyCapacity * weeklyHours,
    monthlyCapacity: this.capacity.hourlyCapacity * monthlyHours
  };
};

// Static method to find active lines
LineSchema.statics.findActive = function() {
  return this.find({ status: 'active' }).populate('products');
};

// Instance method to check if line can produce product
LineSchema.methods.canProduceProduct = function(productId) {
  return this.products.some(product => 
    product._id ? product._id.toString() === productId : product.toString() === productId
  );
};

export default mongoose.model('Line', LineSchema, 'lines');
import mongoose from 'mongoose';

const departmentManagementSchema = new mongoose.Schema({
  departmentName: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  departmentCode: { 
    type: String, 
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: 20
  },
  description: {
    type: String,
    maxlength: 500
  },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive'], 
    default: 'Active' 
  }
}, {
  timestamps: true
});

// Indexes for better performance
departmentManagementSchema.index({ departmentCode: 1 });
departmentManagementSchema.index({ status: 1 });
departmentManagementSchema.index({ departmentName: 1 });

// Pre-save middleware to ensure departmentCode is uppercase
departmentManagementSchema.pre('save', function(next) {
  if (this.departmentCode) {
    this.departmentCode = this.departmentCode.toUpperCase();
  }
  next();
});

export default mongoose.model('DepartmentManagement', departmentManagementSchema, 'departmentmanagements');
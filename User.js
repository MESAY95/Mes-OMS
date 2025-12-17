// backend/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Basic Information - REQUIRED FIELDS
  employeeId: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true,
    match: [/^[A-Z0-9]{3,20}$/, 'Employee ID must be 3-20 characters containing only letters and numbers']
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
    match: [/^[a-zA-Z\s\u1200-\u135A]+$/, 'Name can only contain letters and spaces']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },

  // Role and Department - REQUIRED FIELDS
  role: {
    type: String,
    enum: {
      values: ['super_admin', 'admin', 'manager', 'employee'],
      message: 'Role must be super_admin, admin, manager, or employee'
    },
    default: 'employee'
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    enum: {
      values: ['HR', 'Supply Chain', 'Production', 'Quality', 'Technique', 'Finance', 'Sales', 'IT'],
      message: 'Invalid department'
    }
  },
  position: {
    type: String,
    required: [true, 'Position is required'],
    trim: true,
    maxlength: [100, 'Position cannot exceed 100 characters']
  },

  // Personal Information - REQUIRED FIELD
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^(\+251|0)(9|7)\d{8}$/, 'Please enter a valid Ethiopian phone number']
  },

  // Salary Information - REQUIRED FIELD (from error message)
  salary: {
    basicSalary: {
      type: Number,
      required: [true, 'Basic salary is required'],
      min: [0, 'Basic salary cannot be negative']
    },
    allowances: {
      housing: { type: Number, default: 0, min: 0 },
      transportation: { type: Number, default: 0, min: 0 },
      food: { type: Number, default: 0, min: 0 },
      other: { type: Number, default: 0, min: 0 }
    },
    deductions: {
      tax: { type: Number, default: 0, min: 0 },
      pension: { type: Number, default: 0, min: 0 },
      other: { type: Number, default: 0, min: 0 }
    },
    currency: {
      type: String,
      default: 'ETB',
      enum: ['ETB', 'USD']
    }
  },

  // Emergency Contact - REQUIRED FIELDS (from error message)
  emergencyContact: {
    name: {
      type: String,
      required: [true, 'Emergency contact name is required'],
      trim: true,
      maxlength: 100
    },
    relationship: {
      type: String,
      required: [true, 'Emergency contact relationship is required'],
      trim: true,
      maxlength: 50
    },
    phone: {
      type: String,
      required: [true, 'Emergency contact phone is required'],
      trim: true,
      match: [/^(\+251|0)(9|7)\d{8}$/, 'Please enter a valid Ethiopian phone number']
    }
  },

  // Employment Information
  employmentType: {
    type: String,
    enum: ['Full-Time', 'Part-Time', 'Contract', 'Temporary', 'Intern'],
    default: 'Full-Time'
  },
  hireDate: {
    type: Date,
    default: Date.now
  },

  // Additional personal information (optional)
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(dob) {
        return !dob || dob < new Date();
      },
      message: 'Date of birth must be in the past'
    }
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    trim: true
  },
  address: {
    street: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 50 },
    state: { type: String, trim: true, maxlength: 50 },
    zipCode: { type: String, trim: true, maxlength: 20 }
  },

  // System and Status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },

  // Documents and Media
  profileImage: {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true }
  },

  // Reporting and Hierarchy
  reportsTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return this.name;
});

// Virtual for total salary (basic + allowances)
userSchema.virtual('totalSalary').get(function() {
  const basic = this.salary?.basicSalary || 0;
  const allowances = this.salary?.allowances ? 
    (this.salary.allowances.housing || 0) +
    (this.salary.allowances.transportation || 0) +
    (this.salary.allowances.food || 0) +
    (this.salary.allowances.other || 0) : 0;
  
  return basic + allowances;
});

// Virtual for net salary (total salary - deductions)
userSchema.virtual('netSalary').get(function() {
  const total = this.totalSalary;
  const deductions = this.salary?.deductions ?
    (this.salary.deductions.tax || 0) +
    (this.salary.deductions.pension || 0) +
    (this.salary.deductions.other || 0) : 0;
  
  return total - deductions;
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ employeeId: 1 });
userSchema.index({ department: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Pre-save middleware to uppercase employeeId
userSchema.pre('save', function(next) {
  if (this.isModified('employeeId') && this.employeeId) {
    this.employeeId = this.employeeId.toUpperCase().trim();
  }
  next();
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Static method to suggest employee ID based on department
userSchema.statics.suggestEmployeeId = async function(department) {
  const departmentCodes = {
    'HR': 'HR',
    'Supply Chain': 'SC',
    'Production': 'PRD',
    'Quality': 'QA',
    'Technique': 'TECH',
    'Finance': 'FIN',
    'Sales': 'SALES',
    'IT': 'IT'
  };

  const prefix = departmentCodes[department] || 'EMP';
  const year = new Date().getFullYear().toString().slice(-2);

  // Find the next sequential number for this department
  const latestEmployee = await this.findOne(
    { 
      department: department,
      employeeId: new RegExp(`^${prefix}`)
    },
    { employeeId: 1 },
    { sort: { employeeId: -1 } }
  );

  let sequence = 1;
  if (latestEmployee && latestEmployee.employeeId) {
    const matches = latestEmployee.employeeId.match(/\d+$/);
    if (matches) {
      sequence = parseInt(matches[0], 10) + 1;
    }
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
};

// Method to check permissions
userSchema.methods.hasPermission = function(permission) {
  const permissions = {
    super_admin: ['all'],
    admin: ['read_all', 'write_all', 'delete_all', 'manage_users', 'manage_system', 'view_reports'],
    manager: ['read_department', 'write_department', 'manage_team', 'approve_leave', 'view_team_reports'],
    employee: ['read_own', 'write_own', 'request_leave', 'view_salary']
  };
  
  const userPermissions = permissions[this.role] || permissions.employee;
  return userPermissions.includes('all') || userPermissions.includes(permission);
};

export default mongoose.model('User', userSchema);
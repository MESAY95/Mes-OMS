import mongoose from 'mongoose';

const companyManagementSchema = new mongoose.Schema({
  companyName: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  address: {
    street: { type: String, required: true, trim: true, maxlength: 255 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    zipCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 100, default: 'Ethiopia' }
  },
  contact: {
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 100 },
    website: { type: String, trim: true, maxlength: 100 }
  },
  additionalInfo: {
    taxId: { type: String, trim: true, maxlength: 50 },
    registrationNumber: { type: String, trim: true, maxlength: 50 },
    establishedYear: { type: Number, min: 1900, max: new Date().getFullYear() }
  },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive'], 
    default: 'Active' 
  }
}, {
  timestamps: true,
  collection: 'companyManagements'
});

// Compound index for better query performance
companyManagementSchema.index({ companyName: 1, status: 1 });
companyManagementSchema.index({ 'address.city': 1, 'address.country': 1 });

// Virtual for full address
companyManagementSchema.virtual('fullAddress').get(function() {
  return `${this.address.street}, ${this.address.city}, ${this.address.state} ${this.address.zipCode}, ${this.address.country}`;
});

// Ensure virtual fields are serialized
companyManagementSchema.set('toJSON', { virtuals: true });

export default mongoose.model('CompanyManagement', companyManagementSchema);
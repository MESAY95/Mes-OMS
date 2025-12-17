import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    ref: 'Employee'
  },
  employeeName: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  checkIn: {
    type: Date,
    required: true
  },
  checkOut: {
    type: Date
  },
  totalHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late', 'Half-day', 'On Leave'],
    default: 'Present'
  },
  leaveType: {
    type: String,
    enum: ['Sick Leave', 'Casual Leave', 'Emergency Leave', 'Annual Leave', 'Maternity Leave', 'Paternity Leave', 'None'],
    default: 'None'
  },
  notes: {
    type: String
  },
  overtime: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: String,
    default: 'System'
  }
}, {
  timestamps: true
});

// Compound index to ensure one attendance record per employee per day
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

// Virtual for calculating total hours
attendanceSchema.virtual('calculatedHours').get(function() {
  if (this.checkIn && this.checkOut) {
    const diff = this.checkOut - this.checkIn;
    return (diff / (1000 * 60 * 60)).toFixed(2); // Convert milliseconds to hours
  }
  return 0;
});

// Method to calculate overtime (assuming standard 8-hour work day)
attendanceSchema.methods.calculateOvertime = function() {
  if (this.totalHours > 8) {
    return this.totalHours - 8;
  }
  return 0;
};

export default mongoose.model('Attendance', attendanceSchema);
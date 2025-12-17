import mongoose from 'mongoose';

const qmsSchema = new mongoose.Schema({
    documentType: {
        type: String,
        enum: ['policy', 'procedure', 'work_instruction', 'form', 'record'],
        required: true
    },
    documentNumber: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    version: {
        type: String,
        required: true
    },
    effectiveDate: {
        type: Date,
        required: true
    },
    reviewDate: Date,
    status: {
        type: String,
        enum: ['draft', 'under_review', 'approved', 'obsolete'],
        default: 'draft'
    },
    department: {
        type: String,
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    fileUrl: String,
    description: String,
    changeHistory: [{
        version: String,
        changeDescription: String,
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        changedAt: Date
    }],
    trainingRequired: {
        type: Boolean,
        default: false
    },
    trainedEmployees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    complianceStatus: {
        type: String,
        enum: ['compliant', 'non_compliant', 'under_review'],
        default: 'compliant'
    },
    auditFindings: [{
        finding: String,
        severity: {
            type: String,
            enum: ['minor', 'major', 'critical']
        },
        correctiveAction: String,
        dueDate: Date,
        status: {
            type: String,
            enum: ['open', 'in_progress', 'closed']
        }
    }]
}, {
    timestamps: true
});

qmsSchema.index({ documentNumber: 1 });
qmsSchema.index({ documentType: 1 });
qmsSchema.index({ status: 1 });
qmsSchema.index({ department: 1 });

export default mongoose.model('QMS', qmsSchema);
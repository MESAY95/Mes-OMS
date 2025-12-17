/**
 * Application constants
 */

// Department names
export const DEPARTMENTS = {
    HR: 'HR',
    SUPPLY_CHAIN: 'Supply Chain',
    PRODUCTION: 'Production',
    QUALITY: 'Quality',
    TECHNIQUE: 'Technique',
    FINANCE: 'Finance',
    SALES: 'Sales'
};

// Leave types
export const LEAVE_TYPES = {
    SICK: 'sick',
    VACATION: 'vacation',
    PERSONAL: 'personal',
    MATERNITY: 'maternity',
    PATERNITY: 'paternity',
    OTHER: 'other'
};

// Leave status
export const LEAVE_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

// Salary status
export const SALARY_STATUS = {
    PENDING: 'pending',
    PAID: 'paid',
    CANCELLED: 'cancelled'
};

// Material/Product transaction types
export const TRANSACTION_TYPES = {
    RECEIVE: 'receive',
    ISSUE: 'issue',
    CONSUME: 'consume',
    PRODUCTION: 'production',
    TRANSFER: 'transfer'
};

// Maintenance types
export const MAINTENANCE_TYPES = {
    PREVENTIVE: 'preventive',
    CORRECTIVE: 'corrective',
    PREDICTIVE: 'predictive',
    BREAKDOWN: 'breakdown'
};

// Maintenance status
export const MAINTENANCE_STATUS = {
    REPORTED: 'reported',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// Production status
export const PRODUCTION_STATUS = {
    SCHEDULED: 'scheduled',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    DELAYED: 'delayed',
    CANCELLED: 'cancelled'
};

// Quality status
export const QUALITY_STATUS = {
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CONDITIONAL: 'conditional'
};

// Budget status
export const BUDGET_STATUS = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ACTIVE: 'active',
    CLOSED: 'closed'
};

// Payment methods
export const PAYMENT_METHODS = {
    CASH: 'cash',
    BANK_TRANSFER: 'bank_transfer',
    CHECK: 'check',
    CREDIT_CARD: 'credit_card',
    MOBILE_PAYMENT: 'mobile_payment'
};

// Currency
export const CURRENCY = {
    CODE: 'ETB',
    SYMBOL: 'Br',
    NAME: 'Ethiopian Birr'
};

// Pagination defaults
export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100
};

// File upload constraints
export const FILE_UPLOAD = {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES: 5,
    ALLOWED_TYPES: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
};

// Date formats
export const DATE_FORMATS = {
    DISPLAY: 'DD/MM/YYYY',
    DISPLAY_DATETIME: 'DD/MM/YYYY HH:mm',
    DATABASE: 'YYYY-MM-DD',
    DATABASE_DATETIME: 'YYYY-MM-DD HH:mm:ss'
};

// Response messages
export const MESSAGES = {
    // Success messages
    SUCCESS: 'Operation completed successfully',
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',
    
    // Error messages
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Validation failed',
    SERVER_ERROR: 'Internal server error'
};

// HTTP status codes
export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    SERVER_ERROR: 500
};
// config.js
/**
 * Application configuration
 */
const config = {
    // Server configuration
    server: {
        port: process.env.PORT || 5000,
        environment: process.env.NODE_ENV || 'development',
        baseUrl: process.env.BASE_URL || 'http://localhost:5000',
        corsOptions: {
            origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }
    },
    
    // Database configuration
    database: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/mesayoperations2',
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
            minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 2,
            serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
            socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT_MS) || 45000,
            connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
            retryWrites: true,
            w: 'majority'
        },
        // Database connection retry configuration
        retryOptions: {
            maxRetries: parseInt(process.env.DB_MAX_RETRIES) || 5,
            retryDelay: parseInt(process.env.DB_RETRY_DELAY_MS) || 5000
        }
    },
    
    // Security configuration
    security: {
        jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
        jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10,
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
        corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        // Session configuration
        sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-key-change-this',
        sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE_MS) || 24 * 60 * 60 * 1000, // 24 hours
        // Password policy
        passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
        passwordRequireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
        passwordRequireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
        passwordRequireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
        passwordRequireSymbols: process.env.PASSWORD_REQUIRE_SYMBOLS === 'true',
        // API key configuration
        apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
        allowedApiKeys: (process.env.ALLOWED_API_KEYS || '').split(',').filter(Boolean)
    },
    
    // File upload configuration
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
        maxFiles: parseInt(process.env.MAX_FILES) || 5,
        uploadPath: process.env.UPLOAD_PATH || './uploads',
        tempPath: process.env.TEMP_UPLOAD_PATH || './temp',
        allowedMimeTypes: [
            // Images
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/gif',
            'image/webp',
            'image/svg+xml',
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv',
            // Archives
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/x-tar',
            'application/gzip'
        ],
        imageQuality: parseInt(process.env.IMAGE_QUALITY) || 85,
        thumbnailSize: {
            width: parseInt(process.env.THUMBNAIL_WIDTH) || 200,
            height: parseInt(process.env.THUMBNAIL_HEIGHT) || 200
        },
        // Cleanup configuration
        cleanupInterval: parseInt(process.env.UPLOAD_CLEANUP_INTERVAL_MS) || 24 * 60 * 60 * 1000, // 24 hours
        tempFileMaxAge: parseInt(process.env.TEMP_FILE_MAX_AGE_MS) || 2 * 60 * 60 * 1000 // 2 hours
    },
    
    // Email configuration (for future use)
    email: {
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        username: process.env.EMAIL_USERNAME,
        password: process.env.EMAIL_PASSWORD,
        from: process.env.EMAIL_FROM || 'noreply@mesayoperations.com',
        replyTo: process.env.EMAIL_REPLY_TO,
        // Templates configuration
        templates: {
            welcome: 'welcome-email',
            resetPassword: 'reset-password',
            leaveApproved: 'leave-approved',
            leaveRejected: 'leave-rejected',
            notification: 'notification'
        },
        // Rate limiting
        maxEmailsPerDay: parseInt(process.env.MAX_EMAILS_PER_DAY) || 1000,
        // Queue configuration
        queueEnabled: process.env.EMAIL_QUEUE_ENABLED === 'true',
        queueName: process.env.EMAIL_QUEUE_NAME || 'email-queue',
        queueWorkers: parseInt(process.env.EMAIL_QUEUE_WORKERS) || 3
    },
    
    // Application settings
    app: {
        name: 'MESAY Operations Management System',
        version: process.env.APP_VERSION || '1.0.0',
        description: 'Comprehensive MERN stack operation management system',
        currency: process.env.APP_CURRENCY || 'ETB',
        timezone: process.env.APP_TIMEZONE || 'Africa/Addis_Ababa',
        dateFormat: process.env.DATE_FORMAT || 'DD/MM/YYYY',
        datetimeFormat: process.env.DATETIME_FORMAT || 'DD/MM/YYYY HH:mm:ss',
        timeFormat: process.env.TIME_FORMAT || 'HH:mm:ss',
        // Pagination defaults
        defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE) || 20,
        maxPageSize: parseInt(process.env.MAX_PAGE_SIZE) || 100,
        // Logging
        logLevel: process.env.LOG_LEVEL || 'info',
        logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
        // Maintenance mode
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
        maintenanceMessage: process.env.MAINTENANCE_MESSAGE || 'System is under maintenance. Please try again later.',
        // Cache configuration
        cacheEnabled: process.env.CACHE_ENABLED !== 'false',
        cacheTTL: parseInt(process.env.CACHE_TTL_MS) || 5 * 60 * 1000, // 5 minutes
        // Performance
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000,
        compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false'
    },
    
    // Departments configuration
    departments: {
        list: ['HR', 'Supply Chain', 'Production', 'Quality', 'Technique', 'Finance', 'Sales', 'Admin', 'IT'],
        colors: {
            'HR': '#FF6B6B',
            'Supply Chain': '#4ECDC4', 
            'Production': '#45B7D1',
            'Quality': '#96CEB4',
            'Technique': '#FECA57',
            'Finance': '#FF9FF3',
            'Sales': '#54A0FF',
            'Admin': '#5F27CD',
            'IT': '#00D2D3'
        },
        permissions: {
            'HR': ['employees', 'leaves', 'attendance', 'payroll'],
            'Supply Chain': ['materials', 'suppliers', 'purchasing', 'inventory'],
            'Production': ['products', 'formulations', 'production', 'quality'],
            'Quality': ['qc', 'standards', 'testing', 'compliance'],
            'Technique': ['maintenance', 'equipment', 'repairs', 'calibration'],
            'Finance': ['accounts', 'budget', 'invoicing', 'reports'],
            'Sales': ['customers', 'orders', 'quotations', 'delivery'],
            'Admin': ['settings', 'users', 'roles', 'audit'],
            'IT': ['system', 'backup', 'security', 'support']
        }
    },
    
    // Leave types configuration
    leaveTypes: {
        sick: { 
            name: 'Sick Leave',
            maxDays: parseInt(process.env.LEAVE_SICK_MAX_DAYS) || 30, 
            requiresDocument: true,
            requiresApproval: true,
            approvalLevels: 2,
            color: '#FF6B6B',
            description: 'For medical reasons with doctor\'s note'
        },
        vacation: { 
            name: 'Annual Leave',
            maxDays: parseInt(process.env.LEAVE_VACATION_MAX_DAYS) || 21, 
            requiresDocument: false,
            requiresApproval: true,
            approvalLevels: 2,
            color: '#4ECDC4',
            description: 'Paid annual vacation leave',
            advanceNoticeDays: parseInt(process.env.LEAVE_VACATION_ADVANCE_NOTICE) || 14
        },
        personal: { 
            name: 'Personal Leave',
            maxDays: parseInt(process.env.LEAVE_PERSONAL_MAX_DAYS) || 7, 
            requiresDocument: false,
            requiresApproval: true,
            approvalLevels: 1,
            color: '#45B7D1',
            description: 'For personal emergencies or commitments'
        },
        maternity: { 
            name: 'Maternity Leave',
            maxDays: parseInt(process.env.LEAVE_MATERNITY_MAX_DAYS) || 120, 
            requiresDocument: true,
            requiresApproval: true,
            approvalLevels: 3,
            color: '#FF9FF3',
            description: 'Maternity leave for expecting mothers',
            eligibilityMonths: parseInt(process.env.LEAVE_MATERNITY_ELIGIBILITY) || 12
        },
        paternity: { 
            name: 'Paternity Leave',
            maxDays: parseInt(process.env.LEAVE_PATERNITY_MAX_DAYS) || 15, 
            requiresDocument: true,
            requiresApproval: true,
            approvalLevels: 2,
            color: '#54A0FF',
            description: 'Paternity leave for new fathers'
        },
        other: { 
            name: 'Other Leave',
            maxDays: parseInt(process.env.LEAVE_OTHER_MAX_DAYS) || 5, 
            requiresDocument: false,
            requiresApproval: true,
            approvalLevels: 1,
            color: '#FECA57',
            description: 'Other types of leave not covered above'
        }
    },
    
    // User roles and permissions
    roles: {
        admin: {
            level: 100,
            permissions: ['*'], // All permissions
            description: 'System Administrator'
        },
        manager: {
            level: 80,
            permissions: ['read:*', 'write:*', 'delete:*', 'approve:*'],
            description: 'Department Manager'
        },
        supervisor: {
            level: 60,
            permissions: ['read:*', 'write:own', 'delete:own', 'approve:limited'],
            description: 'Team Supervisor'
        },
        employee: {
            level: 40,
            permissions: ['read:own', 'write:own', 'delete:own'],
            description: 'Regular Employee'
        },
        viewer: {
            level: 20,
            permissions: ['read:limited'],
            description: 'Read-only access'
        },
        guest: {
            level: 0,
            permissions: ['read:public'],
            description: 'Guest access only'
        }
    },
    
    // Audit logging configuration
    audit: {
        enabled: process.env.AUDIT_ENABLED !== 'false',
        logLevels: ['info', 'warn', 'error', 'security'],
        retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS) || 365,
        sensitiveFields: ['password', 'token', 'secret', 'key', 'ssn', 'credit_card'],
        ipTracking: process.env.AUDIT_IP_TRACKING !== 'false',
        userAgentTracking: process.env.AUDIT_USER_AGENT_TRACKING !== 'false'
    },
    
    // Notification configuration
    notifications: {
        enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
        channels: {
            email: process.env.NOTIFY_EMAIL === 'true',
            push: process.env.NOTIFY_PUSH === 'true',
            sms: process.env.NOTIFY_SMS === 'true',
            inApp: process.env.NOTIFY_IN_APP !== 'false'
        },
        defaultPreferences: {
            leaveApproval: true,
            leaveStatusChange: true,
            documentUpload: true,
            systemAnnouncements: true,
            securityAlerts: true,
            dailyDigest: false
        },
        retryAttempts: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.NOTIFICATION_RETRY_DELAY_MS) || 5000
    },
    
    // Backup configuration
    backup: {
        enabled: process.env.BACKUP_ENABLED === 'true',
        schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
        storagePath: process.env.BACKUP_STORAGE_PATH || './backups',
        encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
        compressionLevel: parseInt(process.env.BACKUP_COMPRESSION_LEVEL) || 6,
        // Cloud storage options
        cloudEnabled: process.env.BACKUP_CLOUD_ENABLED === 'true',
        cloudProvider: process.env.BACKUP_CLOUD_PROVIDER || 'aws', // aws, google, azure
        cloudBucket: process.env.BACKUP_CLOUD_BUCKET
    },
    
    // Monitoring and metrics
    monitoring: {
        enabled: process.env.MONITORING_ENABLED === 'true',
        metricsPort: parseInt(process.env.METRICS_PORT) || 9090,
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS) || 30000,
        alertThresholds: {
            cpu: parseFloat(process.env.ALERT_CPU_THRESHOLD) || 80,
            memory: parseFloat(process.env.ALERT_MEMORY_THRESHOLD) || 85,
            disk: parseFloat(process.env.ALERT_DISK_THRESHOLD) || 90,
            responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_THRESHOLD_MS) || 5000,
            errorRate: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD) || 5
        }
    }
};

/**
 * Validate required environment variables
 */
export const validateEnvironment = () => {
    const required = ['MONGODB_URI'];
    
    // Only require JWT secret in production
    if (process.env.NODE_ENV === 'production') {
        required.push('JWT_SECRET');
    }
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing.join(', '));
        console.error('💡 Please set these variables in your .env file or environment');
        process.exit(1);
    }
    
    console.log('✅ Environment variables validated successfully');
};

/**
 * Get configuration for current environment
 */
export const getConfig = () => {
    return config;
};

/**
 * Check if running in production
 */
export const isProduction = () => {
    return config.server.environment === 'production';
};

/**
 * Check if running in development
 */
export const isDevelopment = () => {
    return config.server.environment === 'development';
};

/**
 * Check if running in test environment
 */
export const isTest = () => {
    return config.server.environment === 'test';
};

/**
 * Get database URI based on environment
 */
export const getDatabaseURI = () => {
    if (isTest()) {
        return process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/mesayoperations_test';
    }
    return config.database.uri;
};

/**
 * Get upload configuration
 */
export const getUploadConfig = () => {
    return {
        ...config.upload,
        // Add environment-specific overrides
        maxFileSize: isProduction() 
            ? parseInt(process.env.MAX_FILE_SIZE_PROD) || config.upload.maxFileSize 
            : config.upload.maxFileSize,
        uploadPath: isProduction()
            ? process.env.UPLOAD_PATH_PROD || config.upload.uploadPath
            : config.upload.uploadPath
    };
};

/**
 * Get email configuration
 */
export const getEmailConfig = () => {
    return {
        ...config.email,
        // In development, use mailtrap or similar if configured
        ...(isDevelopment() && process.env.MAILTRAP_USERNAME && {
            host: 'smtp.mailtrap.io',
            port: 2525,
            username: process.env.MAILTRAP_USERNAME,
            password: process.env.MAILTRAP_PASSWORD,
            secure: false
        })
    };
};

/**
 * Get security configuration
 */
export const getSecurityConfig = () => {
    const securityConfig = { ...config.security };
    
    // In production, enforce stronger security
    if (isProduction()) {
        securityConfig.passwordMinLength = Math.max(securityConfig.passwordMinLength, 12);
        securityConfig.passwordRequireUppercase = true;
        securityConfig.passwordRequireLowercase = true;
        securityConfig.passwordRequireNumbers = true;
        securityConfig.passwordRequireSymbols = true;
        securityConfig.rateLimitMaxRequests = Math.min(securityConfig.rateLimitMaxRequests, 100);
    }
    
    return securityConfig;
};

/**
 * Get application URL for current environment
 */
export const getAppUrl = () => {
    if (isProduction()) {
        return process.env.APP_URL || config.server.baseUrl;
    }
    return config.server.baseUrl;
};

/**
 * Get frontend URL for CORS
 */
export const getFrontendUrl = () => {
    if (isProduction()) {
        return process.env.FRONTEND_URL || 'http://localhost:3000';
    }
    return config.server.corsOptions.origin;
};

/**
 * Get CORS options
 */
export const getCorsOptions = () => {
    const origin = getFrontendUrl();
    
    // In development, allow all origins for easier testing
    if (isDevelopment()) {
        return {
            ...config.server.corsOptions,
            origin: true, // Allow all origins in development
            credentials: true
        };
    }
    
    return {
        ...config.server.corsOptions,
        origin: origin,
        credentials: true
    };
};

/**
 * Get configuration for specific module
 */
export const getModuleConfig = (moduleName) => {
    const moduleConfigs = {
        auth: {
            jwtSecret: config.security.jwtSecret,
            jwtExpiresIn: config.security.jwtExpiresIn,
            bcryptRounds: config.security.bcryptRounds,
            passwordPolicy: {
                minLength: config.security.passwordMinLength,
                requireUppercase: config.security.passwordRequireUppercase,
                requireLowercase: config.security.passwordRequireLowercase,
                requireNumbers: config.security.passwordRequireNumbers,
                requireSymbols: config.security.passwordRequireSymbols
            }
        },
        database: {
            uri: getDatabaseURI(),
            options: config.database.options,
            retryOptions: config.database.retryOptions
        },
        server: {
            port: config.server.port,
            environment: config.server.environment,
            corsOptions: getCorsOptions(),
            compressionEnabled: config.app.compressionEnabled,
            requestTimeout: config.app.requestTimeout
        },
        logging: {
            level: config.app.logLevel,
            retentionDays: config.app.logRetentionDays,
            auditEnabled: config.audit.enabled
        },
        monitoring: config.monitoring.enabled ? config.monitoring : null
    };
    
    return moduleConfigs[moduleName] || null;
};

/**
 * Export configuration validation on module load
 */
validateEnvironment();

export default config;
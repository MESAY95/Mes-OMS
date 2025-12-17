/**
 * Request logging middleware
 */
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip} - User-Agent: ${req.get('User-Agent')}`);
    
    // Log request body (excluding sensitive fields)
    if (req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = { ...req.body };
        
        // Remove sensitive fields from logs
        const sensitiveFields = ['password', 'token', 'authorization', 'creditCard', 'cvv'];
        sensitiveFields.forEach(field => {
            if (sanitizedBody[field]) {
                sanitizedBody[field] = '***HIDDEN***';
            }
        });
        
        console.log('Request Body:', JSON.stringify(sanitizedBody, null, 2));
    }
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
        const duration = Date.now() - start;
        
        // Log response
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${duration}ms`);
        
        // Log response data for errors
        if (res.statusCode >= 400) {
            try {
                const responseData = JSON.parse(data);
                console.log('Error Response:', JSON.stringify(responseData, null, 2));
            } catch (e) {
                console.log('Response:', data);
            }
        }
        
        originalSend.call(this, data);
    };
    
    next();
};

/**
 * Performance monitoring middleware
 */
export const performanceMonitor = (req, res, next) => {
    req._startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - req._startTime;
        const status = res.statusCode;
        
        // Log slow requests
        if (duration > 1000) { // More than 1 second
            console.warn(`[PERFORMANCE] Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`);
        }
        
        // Track metrics (you can send this to a monitoring service)
        const metrics = {
            method: req.method,
            path: req.path,
            statusCode: status,
            duration: duration,
            timestamp: new Date().toISOString()
        };
        
        // Here you can send metrics to your monitoring system
        // e.g., sendToMetricsService(metrics);
    });
    
    next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req, res, next) => {
    // Remove server identification
    res.removeHeader('X-Powered-By');
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
};
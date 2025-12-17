/**
 * Base controller with common functionality
 */
export class BaseController {
    /**
     * Success response
     */
    static success(res, data = null, message = 'Operation completed successfully', statusCode = 200) {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Error response
     */
    static error(res, message = 'An error occurred', statusCode = 500, errors = null) {
        const response = {
            success: false,
            message,
            timestamp: new Date().toISOString()
        };

        if (errors) {
            response.errors = errors;
        }

        return res.status(statusCode).json(response);
    }

    /**
     * Not found response
     */
    static notFound(res, resource = 'Resource') {
        return this.error(res, `${resource} not found`, 404);
    }

    /**
     * Validation error response
     */
    static validationError(res, errors) {
        return this.error(res, 'Validation failed', 400, errors);
    }

    /**
     * Handle async operations with error catching
     */
    static async handleAsync(operation, res, successMessage = 'Operation completed successfully') {
        try {
            const result = await operation();
            return this.success(res, result, successMessage);
        } catch (error) {
            console.error('Controller error:', error);
            return this.error(res, error.message, error.statusCode || 500);
        }
    }

    /**
     * Pagination helper
     */
    static getPaginationOptions(query) {
        const page = Math.max(parseInt(query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(query.limit) || 10, 1), 100);
        const skip = (page - 1) * limit;

        return { page, limit, skip };
    }

    /**
     * Filter helper
     */
    static buildFilter(query, allowedFilters) {
        const filter = {};
        
        allowedFilters.forEach(filterKey => {
            if (query[filterKey] !== undefined && query[filterKey] !== '') {
                // Handle special cases
                if (filterKey === 'search') {
                    // Search across multiple fields
                    filter.$or = [
                        { name: { $regex: query[filterKey], $options: 'i' } },
                        { code: { $regex: query[filterKey], $options: 'i' } },
                        { description: { $regex: query[filterKey], $options: 'i' } }
                    ];
                } else if (filterKey.endsWith('Date')) {
                    // Date range filtering
                    if (query[filterKey]) {
                        filter[filterKey] = { $gte: new Date(query[filterKey]) };
                    }
                } else {
                    filter[filterKey] = query[filterKey];
                }
            }
        });

        return filter;
    }
}
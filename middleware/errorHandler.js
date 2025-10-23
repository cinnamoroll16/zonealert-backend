// middleware/errorHandler.js

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Firebase errors
    if (err.code?.startsWith('auth/')) {
        return res.status(401).json({
            success: false,
            message: 'Authentication error',
            error: err.message
        });
    }

    // Firestore errors
    if (err.code === 'permission-denied') {
        return res.status(403).json({
            success: false,
            message: 'Permission denied',
            error: 'You do not have permission to perform this action'
        });
    }

    if (err.code === 'not-found') {
        return res.status(404).json({
            success: false,
            message: 'Resource not found',
            error: err.message
        });
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: Object.values(err.errors).map(e => ({
                field: e.path,
                message: e.message
            }))
        });
    }

    // MongoDB/Mongoose errors (if applicable)
    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'Duplicate key error',
            error: 'A record with this value already exists'
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
            error: err.message
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired',
            error: 'Please login again'
        });
    }

    // Rate limiting errors
    if (err.status === 429) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests',
            error: 'Please try again later'
        });
    }

    // Default error
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? 'Internal server error' : message,
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not Found Handler
 */
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

module.exports = {
    errorHandler,
    asyncHandler,
    notFound
};
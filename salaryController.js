import Salary from '../models/Salary.js';
import { BaseController } from './BaseController.js';

export class SalaryController extends BaseController {
    /**
     * Get all salaries with pagination and filtering
     */
    static async getSalaries(req, res) {
        try {
            const { page, limit, skip } = this.getPaginationOptions(req.query);
            const { status, payPeriodStart, payPeriodEnd } = req.query;

            // Build filter
            const filter = {};
            
            if (status) filter.status = status;
            
            // Date range filter
            if (payPeriodStart || payPeriodEnd) {
                filter.payPeriod = {};
                if (payPeriodStart) filter.payPeriod.$gte = new Date(payPeriodStart);
                if (payPeriodEnd) filter.payPeriod.$lte = new Date(payPeriodEnd);
            }

            const salaries = await Salary.find(filter)
                .sort({ payPeriod: -1 })
                .skip(skip)
                .limit(limit);

            const total = await Salary.countDocuments(filter);

            // Calculate totals
            const totalStats = await Salary.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        totalBasic: { $sum: '$basicSalary' },
                        totalAllowances: { $sum: '$allowances' },
                        totalDeductions: { $sum: '$deductions' },
                        totalNet: { $sum: '$netSalary' }
                    }
                }
            ]);

            return this.success(res, {
                salaries: salaries,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                },
                totals: totalStats[0] || {
                    totalBasic: 0,
                    totalAllowances: 0,
                    totalDeductions: 0,
                    totalNet: 0
                }
            }, 'Salaries retrieved successfully');

        } catch (error) {
            console.error('Get salaries error:', error);
            return this.error(res, 'Failed to retrieve salaries');
        }
    }

    /**
     * Create salary record
     */
    static async createSalary(req, res) {
        try {
            const { basicSalary, allowances, deductions, payPeriod, status } = req.body;

            // Check for duplicate salary record
            const existingSalary = await Salary.findOne({
                payPeriod: new Date(payPeriod)
            });

            if (existingSalary) {
                return this.error(res, 'Salary record already exists for this pay period', 409);
            }

            const salary = new Salary({
                basicSalary,
                allowances: allowances || 0,
                deductions: deductions || 0,
                payPeriod: new Date(payPeriod),
                status: status || 'pending'
            });

            await salary.save();

            return this.success(res, salary, 'Salary record created successfully', 201);

        } catch (error) {
            console.error('Create salary error:', error);
            
            if (error.name === 'ValidationError') {
                const errors = Object.values(error.errors).map(err => ({
                    field: err.path,
                    message: err.message
                }));
                return this.validationError(res, errors);
            }

            return this.error(res, 'Failed to create salary record');
        }
    }

    /**
     * Process batch salaries
     */
    static async processBatchSalaries(req, res) {
        try {
            const { payPeriod, basicSalary, allowances, deductions, status } = req.body;

            const payPeriodDate = new Date(payPeriod);

            // Check for existing salary
            const existingSalary = await Salary.findOne({
                payPeriod: payPeriodDate
            });

            if (existingSalary) {
                return this.error(res, 'Salary record already exists for this period', 409);
            }

            const salary = new Salary({
                basicSalary: basicSalary || 0,
                allowances: allowances || 0,
                deductions: deductions || 0,
                payPeriod: payPeriodDate,
                status: status || 'pending'
            });

            await salary.save();

            return this.success(res, {
                salaryId: salary._id,
                netSalary: salary.netSalary
            }, 'Salary record created successfully');

        } catch (error) {
            console.error('Process batch salaries error:', error);
            return this.error(res, 'Failed to process salary');
        }
    }

    /**
     * Get salary statistics
     */
    static async getSalaryStatistics(req, res) {
        try {
            const currentMonth = new Date();
            const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

            const matchFilter = {
                payPeriod: { $gte: firstDay, $lte: lastDay }
            };

            const monthlyStats = await Salary.aggregate([
                { $match: matchFilter },
                {
                    $group: {
                        _id: null,
                        totalBasic: { $sum: '$basicSalary' },
                        totalAllowances: { $sum: '$allowances' },
                        totalDeductions: { $sum: '$deductions' },
                        totalNet: { $sum: '$netSalary' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const statusStats = await Salary.aggregate([
                { $match: matchFilter },
                {
                    $group: {
                        _id: '$status',
                        totalAmount: { $sum: '$netSalary' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const stats = monthlyStats[0] || {
                totalBasic: 0,
                totalAllowances: 0,
                totalDeductions: 0,
                totalNet: 0,
                count: 0
            };

            return this.success(res, {
                monthly: stats,
                status: statusStats,
                currency: 'ETB'
            }, 'Salary statistics retrieved successfully');

        } catch (error) {
            console.error('Get salary statistics error:', error);
            return this.error(res, 'Failed to retrieve salary statistics');
        }
    }
}
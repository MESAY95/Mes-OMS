import express from 'express';
import ProductionSchedule from '../models/ProductionSchedule.js';
import ProductionPlan from '../models/ProductionPlan.js';
import Product from '../models/Product.js';
import Employee from '../models/Employee.js';
import Line from '../models/LineManagement.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get all production lines
router.get('/lines', async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    if (status) filter.status = status;
    
    const lines = await Line.find(filter)
      .select('lineCode lineName capacity operationalHours status products')
      .populate('products', 'name productionTime')
      .sort({ lineCode: 1 });
    
    res.json({
      success: true,
      data: lines,
      count: lines.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get all production schedules
router.get('/', async (req, res) => {
  try {
    const { status, lineCode, startDate, endDate, timeFrame, yearRange, productId } = req.query;
    let filter = {};
    if (status) filter.status = status;
    if (lineCode) filter.lineCode = lineCode;
    if (timeFrame) filter.timeFrame = timeFrame;
    if (yearRange) filter.yearRange = yearRange;
    if (productId) filter.productId = productId;
    
    if (startDate && endDate) {
      filter.startDate = { $gte: new Date(startDate) };
      filter.endDate = { $lte: new Date(endDate) };
    } else if (startDate) {
      filter.startDate = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.endDate = { $lte: new Date(endDate) };
    }

    const schedules = await ProductionSchedule.find(filter)
      .populate('productId', 'name productionTime ProductCode')
      .populate('lineId', 'lineCode lineName capacity operationalHours')
      .populate('assignedEmployeeId', 'firstName lastName position')
      .populate('parentPlanId', 'planId planName')
      .sort({ startDate: 1 });
    
    res.json({
      success: true,
      data: schedules,
      count: schedules.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get production schedule by ID
router.get('/:id', async (req, res) => {
  try {
    const schedule = await ProductionSchedule.findById(req.params.id)
      .populate('productId', 'name productionTime ProductCode specifications')
      .populate('lineId', 'lineCode lineName capacity operationalHours status')
      .populate('assignedEmployeeId', 'firstName lastName position department')
      .populate('parentPlanId', 'planId planName description');
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Production schedule not found'
      });
    }

    res.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create a new production schedule
router.post('/', async (req, res) => {
  try {
    // Validate line exists
    const line = await Line.findById(req.body.lineId);
    if (!line) {
      return res.status(404).json({
        success: false,
        message: 'Production line not found'
      });
    }

    // Validate product exists
    const product = await Product.findById(req.body.productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if orderId already exists
    const existingSchedule = await ProductionSchedule.findOne({ orderId: req.body.orderId });
    if (existingSchedule) {
      return res.status(400).json({
        success: false,
        message: 'Order ID already exists'
      });
    }

    const schedule = new ProductionSchedule({
      ...req.body,
      lineCode: line.lineCode,
      productName: product.name
    });

    const newSchedule = await schedule.save();
    
    // Populate the saved schedule
    await newSchedule.populate('productId', 'name productionTime ProductCode');
    await newSchedule.populate('lineId', 'lineCode lineName capacity');
    await newSchedule.populate('assignedEmployeeId', 'firstName lastName');
    
    res.status(201).json({
      success: true,
      data: newSchedule,
      message: 'Production schedule created successfully'
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Update a production schedule
router.put('/:id', async (req, res) => {
  try {
    const schedule = await ProductionSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ 
        success: false,
        message: 'Production schedule not found' 
      });
    }

    // If lineId is being updated, validate the new line
    if (req.body.lineId && req.body.lineId !== schedule.lineId.toString()) {
      const line = await Line.findById(req.body.lineId);
      if (!line) {
        return res.status(404).json({
          success: false,
          message: 'Production line not found'
        });
      }
      req.body.lineCode = line.lineCode;
    }

    // If productId is being updated, validate the new product
    if (req.body.productId && req.body.productId !== schedule.productId.toString()) {
      const product = await Product.findById(req.body.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      req.body.productName = product.name;
    }

    Object.assign(schedule, req.body);
    const updatedSchedule = await schedule.save();
    
    await updatedSchedule.populate('productId', 'name productionTime ProductCode');
    await updatedSchedule.populate('lineId', 'lineCode lineName capacity');
    await updatedSchedule.populate('assignedEmployeeId', 'firstName lastName');
    
    res.json({
      success: true,
      data: updatedSchedule,
      message: 'Production schedule updated successfully'
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Delete a production schedule
router.delete('/:id', async (req, res) => {
  try {
    const schedule = await ProductionSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ 
        success: false,
        message: 'Production schedule not found' 
      });
    }

    await ProductionSchedule.findByIdAndDelete(req.params.id);
    res.json({ 
      success: true,
      message: 'Production schedule deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get compatible lines for a product
router.get('/products/:productId/compatible-lines', async (req, res) => {
  try {
    const { productId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const compatibleLines = await Line.find({
      products: productId,
      status: 'active'
    }).select('lineCode lineName capacity operationalHours description');
    
    res.json({
      success: true,
      data: compatibleLines,
      product: {
        name: product.name,
        productionTime: product.productionTime
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get capacity for specific line and product
router.get('/capacity/:lineId/:productId', async (req, res) => {
  try {
    const { lineId, productId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(lineId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid line ID or product ID'
      });
    }
    
    const line = await Line.findById(lineId);
    const product = await Product.findById(productId);
    
    if (!line || !product) {
      return res.status(404).json({
        success: false,
        message: 'Line or Product not found'
      });
    }

    // Check if product is compatible with line
    const isCompatible = line.products.some(p => 
      p.toString() === productId
    );
    
    if (!isCompatible) {
      return res.status(400).json({
        success: false,
        message: 'Product is not compatible with this production line'
      });
    }

    const dailyHours = line.operationalHours.shiftsPerDay * line.operationalHours.hoursPerShift;
    const productionTimePerUnit = product.productionTime || 1;
    
    const adjustedDailyCapacity = Math.floor(dailyHours / productionTimePerUnit);
    const weeklyCapacity = adjustedDailyCapacity * line.operationalHours.workingDaysPerWeek;
    const monthlyCapacity = weeklyCapacity * 4;

    res.json({
      success: true,
      data: {
        lineCode: line.lineCode,
        lineName: line.lineName,
        productName: product.name,
        standardDailyCapacity: line.capacity.dailyCapacity,
        adjustedDailyCapacity: adjustedDailyCapacity,
        productionTimePerUnit: productionTimePerUnit,
        dailyAvailableHours: dailyHours,
        weeklyCapacity: weeklyCapacity,
        monthlyCapacity: monthlyCapacity,
        operationalHours: line.operationalHours,
        isCompatible: true
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get schedules by line
router.get('/lines/:lineId/schedules', async (req, res) => {
  try {
    const { lineId } = req.params;
    const { startDate, endDate, status } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(lineId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid line ID'
      });
    }
    
    let filter = { lineId: lineId };
    
    if (status) filter.status = status;
    if (startDate && endDate) {
      filter.startDate = { $gte: new Date(startDate) };
      filter.endDate = { $lte: new Date(endDate) };
    }
    
    const schedules = await ProductionSchedule.find(filter)
      .populate('productId', 'name productionTime')
      .populate('assignedEmployeeId', 'firstName lastName')
      .sort({ startDate: 1 });
    
    res.json({
      success: true,
      data: schedules,
      count: schedules.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update schedule status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, actualStartDate, actualEndDate, actualHours } = req.body;
    const schedule = await ProductionSchedule.findById(req.params.id);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Production schedule not found'
      });
    }
    
    const updateData = { status };
    
    if (actualStartDate) updateData.actualStartDate = actualStartDate;
    if (actualEndDate) updateData.actualEndDate = actualEndDate;
    if (actualHours !== undefined) updateData.actualHours = actualHours;
    
    // If status is completed and no actual end date provided, set it to now
    if (status === 'completed' && !actualEndDate) {
      updateData.actualEndDate = new Date();
    }
    
    Object.assign(schedule, updateData);
    const updatedSchedule = await schedule.save();
    
    await updatedSchedule.populate('productId', 'name productionTime');
    await updatedSchedule.populate('lineId', 'lineCode lineName');
    await updatedSchedule.populate('assignedEmployeeId', 'firstName lastName');
    
    res.json({
      success: true,
      data: updatedSchedule,
      message: 'Schedule status updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Master Production Schedule (MPS) Calculation
router.post('/calculate-mps', async (req, res) => {
  try {
    const { annualPlan, lineId, yearRange } = req.body;
    
    const mpsResult = await calculateMPS(annualPlan, lineId, yearRange);
    res.json({
      success: true,
      data: mpsResult
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Capacity Planning Calculation
router.post('/capacity-planning', async (req, res) => {
  try {
    const { lineId, startDate, endDate, quantity, productId } = req.body;
    
    const capacityAnalysis = await calculateCapacity(lineId, startDate, endDate, quantity, productId);
    res.json({
      success: true,
      data: capacityAnalysis
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Generate Detailed Schedule from MPS
router.post('/generate-from-mps', async (req, res) => {
  try {
    const { mpsPlanId, startDate } = req.body;
    
    const detailedSchedules = await generateDetailedSchedule(mpsPlanId, startDate);
    res.json({
      success: true,
      data: detailedSchedules
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Disaggregate Annual Plan
router.post('/disaggregate-plan', async (req, res) => {
  try {
    const { annualQuantity, yearRange, productId, lineId } = req.body;
    
    const disaggregatedPlan = await disaggregateAnnualPlan(annualQuantity, yearRange, productId, lineId);
    res.json({
      success: true,
      data: disaggregatedPlan
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Check Constraints
router.post('/check-constraints', async (req, res) => {
  try {
    const { scheduleId, date } = req.body;
    
    const constraintCheck = await checkProductionConstraints(scheduleId, date);
    res.json({
      success: true,
      data: constraintCheck
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get production plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await ProductionPlan.find({})
      .populate('productId', 'name')
      .populate('lineId', 'lineCode lineName')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// MPS Calculation Functions
const calculateMPS = async (annualPlan, lineId, yearRange) => {
  const { annualQuantity, productId } = annualPlan;
  
  // Get product and line details
  const product = await Product.findById(productId);
  const line = await Line.findById(lineId);
  
  if (!product || !line) {
    throw new Error('Product or Line not found');
  }

  const productionTimePerUnit = product.productionTime || 1;
  const totalHoursRequired = annualQuantity * productionTimePerUnit;
  
  // Calculate available hours based on line operational hours
  const dailyAvailableHours = line.operationalHours.shiftsPerDay * line.operationalHours.hoursPerShift;
  const weeklyAvailableHours = dailyAvailableHours * line.operationalHours.workingDaysPerWeek;
  const annualAvailableHours = weeklyAvailableHours * 52;

  // Check against line capacity
  const maxAnnualCapacity = line.capacity.monthlyCapacity * 12;
  const utilizationRate = (annualQuantity / maxAnnualCapacity) * 100;
  const hoursUtilization = (totalHoursRequired / annualAvailableHours) * 100;

  return {
    totalHoursRequired,
    availableHours: annualAvailableHours,
    utilizationRate: Math.min(utilizationRate, 100),
    hoursUtilization: Math.min(hoursUtilization, 100),
    feasible: annualQuantity <= maxAnnualCapacity && totalHoursRequired <= annualAvailableHours,
    productionTimePerUnit,
    lineCapacity: line.capacity,
    operationalHours: line.operationalHours,
    maxAnnualCapacity
  };
};

// Capacity Planning Calculation
const calculateCapacity = async (lineId, startDate, endDate, quantity, productId) => {
  const line = await Line.findById(lineId);
  if (!line) {
    throw new Error('Line not found');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Calculate total available hours in period
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.ceil(totalDays / 7);
  const workingDays = totalWeeks * line.operationalHours.workingDaysPerWeek;
  const totalAvailableHours = workingDays * line.operationalHours.shiftsPerDay * line.operationalHours.hoursPerShift;

  // Calculate required hours
  const product = await Product.findById(productId);
  const productionTimePerUnit = product?.productionTime || 1;
  const totalRequiredHours = quantity * productionTimePerUnit;

  // Calculate capacity utilization
  const availableUnits = (totalAvailableHours / productionTimePerUnit);
  const capacityUtilization = (quantity / availableUnits) * 100;

  const dailyBreakdown = [];
  const currentDate = new Date(start);
  
  while (currentDate <= end) {
    // Skip weekends if configured
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      const dailyCapacity = line.capacity.dailyCapacity;
      dailyBreakdown.push({
        date: new Date(currentDate),
        availableCapacity: dailyCapacity,
        utilizedCapacity: 0,
        remainingCapacity: dailyCapacity
      });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    totalAvailableHours,
    totalRequiredHours,
    capacityUtilization: Math.min(capacityUtilization, 100),
    feasible: quantity <= availableUnits && totalRequiredHours <= totalAvailableHours,
    dailyBreakdown,
    lineCapacity: line.capacity,
    operationalHours: line.operationalHours
  };
};

// Disaggregate Annual Plan into smaller timeframes
const disaggregateAnnualPlan = async (annualQuantity, yearRange, productId, lineId) => {
  const product = await Product.findById(productId);
  const line = await Line.findById(lineId);
  
  if (!product || !line) {
    throw new Error('Product or Line not found');
  }

  const quarterlyQuantities = [];
  const monthlyQuantities = [];
  
  // Calculate production time required
  const totalProductionTime = annualQuantity * (product.productionTime || 1);
  
  // Consider line capacity constraints
  const maxQuarterlyCapacity = line.capacity.monthlyCapacity * 3;
  const maxMonthlyCapacity = line.capacity.monthlyCapacity;

  // Simple proportional distribution with capacity constraints
  const quarterlyBase = Math.min(annualQuantity / 4, maxQuarterlyCapacity);
  const monthlyBase = Math.min(annualQuantity / 12, maxMonthlyCapacity);

  for (let quarter = 1; quarter <= 4; quarter++) {
    const quarterQuantity = Math.round(quarterlyBase);
    const monthlyBreakdown = [];

    for (let month = (quarter - 1) * 3 + 1; month <= quarter * 3; month++) {
      const monthlyQuantity = Math.round(monthlyBase);
      monthlyBreakdown.push({
        month,
        quantity: monthlyQuantity,
        productionHours: monthlyQuantity * (product.productionTime || 1)
      });
      
      monthlyQuantities.push({
        month,
        quantity: monthlyQuantity,
        productionHours: monthlyQuantity * (product.productionTime || 1)
      });
    }

    quarterlyQuantities.push({
      quarter,
      quantity: quarterQuantity,
      productionHours: quarterQuantity * (product.productionTime || 1),
      months: monthlyBreakdown
    });
  }

  return {
    annualQuantity,
    yearRange,
    totalProductionTime,
    quarterlyBreakdown: quarterlyQuantities,
    monthlyBreakdown: monthlyQuantities,
    product: {
      name: product.name,
      productionTime: product.productionTime
    },
    line: {
      lineCode: line.lineCode,
      capacity: line.capacity
    }
  };
};

// Generate detailed schedule from MPS
const generateDetailedSchedule = async (mpsPlanId, startDate) => {
  const plan = await ProductionPlan.findById(mpsPlanId)
    .populate('productId')
    .populate('lineId');
    
  if (!plan) {
    throw new Error('Production plan not found');
  }

  const detailedSchedules = [];
  let currentDate = new Date(startDate);

  // Generate monthly schedules from the disaggregated plan
  for (const quarter of plan.quarterlyBreakdown) {
    for (const month of quarter.months) {
      if (month.quantity > 0) {
        const schedule = {
          orderId: `MPS-${plan.planId}-${currentDate.getFullYear()}-${month.month.toString().padStart(2, '0')}`,
          productName: plan.productId.name,
          productId: plan.productId._id,
          quantity: month.quantity,
          lineCode: plan.lineId.lineCode,
          lineId: plan.lineId._id,
          startDate: new Date(currentDate),
          endDate: new Date(currentDate.setMonth(currentDate.getMonth() + 1)),
          status: 'scheduled',
          priority: 'medium',
          assignedTo: 'Production Team',
          plannedHours: month.quantity * (plan.productId.productionTime || 1),
          timeFrame: 'monthly',
          yearRange: plan.yearRange,
          parentPlanId: mpsPlanId
        };
        detailedSchedules.push(schedule);
      }
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  // Save all schedules
  const savedSchedules = await ProductionSchedule.insertMany(detailedSchedules);
  return savedSchedules;
};

// Check production constraints
const checkProductionConstraints = async (scheduleId, date) => {
  const schedule = await ProductionSchedule.findById(scheduleId)
    .populate('productId')
    .populate('lineId');
    
  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const checkDate = new Date(date);
  const constraints = {
    materialAvailable: true,
    machineAvailable: true,
    laborAvailable: true,
    capacityAvailable: true,
    issues: []
  };

  // Check line capacity for the date
  const existingSchedules = await ProductionSchedule.find({
    lineId: schedule.lineId,
    startDate: { $lte: checkDate },
    endDate: { $gte: checkDate },
    status: { $in: ['scheduled', 'in-progress'] }
  });

  const totalScheduledQuantity = existingSchedules.reduce((sum, s) => sum + s.quantity, 0);
  const lineCapacity = schedule.lineId.capacity.dailyCapacity;
  
  if (totalScheduledQuantity + schedule.quantity > lineCapacity) {
    constraints.capacityAvailable = false;
    constraints.issues.push(`Line capacity exceeded. Scheduled: ${totalScheduledQuantity}, Capacity: ${lineCapacity}`);
  }

  // Check material availability
  const materialAvailability = await checkMaterialAvailability(schedule.productId, schedule.quantity, checkDate);
  if (!materialAvailability.available) {
    constraints.materialAvailable = false;
    constraints.issues.push(`Material shortage: ${materialAvailability.message}`);
  }

  return constraints;
};

// Helper function for material check
const checkMaterialAvailability = async (productId, quantity, date) => {
  // Simplified material check - integrate with inventory system
  const requiredMaterials = quantity * 1;
  const availableMaterials = 1000;
  
  return {
    available: requiredMaterials <= availableMaterials,
    message: requiredMaterials <= availableMaterials ? 
      'Materials available' : 
      `Insufficient materials. Required: ${requiredMaterials}, Available: ${availableMaterials}`
  };
};

export default router;
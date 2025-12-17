import express from 'express';
import Capacity from '../models/Capacity.js';

const router = express.Router();

// Get all capacity data
router.get('/', async (req, res) => {
  try {
    const capacities = await Capacity.find();
    res.json(capacities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update capacity
router.put('/:id', async (req, res) => {
  try {
    const capacity = await Capacity.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    
    if (!capacity) {
      return res.status(404).json({ message: 'Capacity record not found' });
    }
    
    res.json(capacity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Calculate capacity utilization
router.get('/utilization/calculate', async (req, res) => {
  try {
    // This would calculate current utilization based on active schedules
    // For now, returning mock data
    const utilization = [
      { productionLine: 'Line 1', utilization: 85 },
      { productionLine: 'Line 2', utilization: 92 },
      { productionLine: 'Line 3', utilization: 65 },
      { productionLine: 'Line 4', utilization: 78 }
    ];
    
    res.json(utilization);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
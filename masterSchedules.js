import express from 'express';
import MasterSchedule from '../models/MasterSchedule.js';

const router = express.Router();

// Get master schedule
router.get('/', async (req, res) => {
  try {
    const { year } = req.query;
    const filter = year ? { year: parseInt(year) } : {};
    
    const schedules = await MasterSchedule.find(filter);
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create/update master schedule
router.post('/', async (req, res) => {
  try {
    const { productName, year, quarterlyTargets, monthlyTargets } = req.body;
    
    let schedule = await MasterSchedule.findOne({ productName, year });
    
    if (schedule) {
      schedule.quarterlyTargets = quarterlyTargets;
      schedule.monthlyTargets = monthlyTargets;
    } else {
      schedule = new MasterSchedule({
        productName,
        year,
        quarterlyTargets,
        monthlyTargets
      });
    }
    
    const savedSchedule = await schedule.save();
    res.json(savedSchedule);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
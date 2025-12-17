import express from 'express';
import MaterialROS from '../models/MaterialROS.js';
import ProductROS from '../models/ProductROS.js';

const router = express.Router();

// Get material reorder status
router.get('/materials', async (req, res) => {
  try {
    const reorderStatus = await MaterialROS.find().populate('Material').sort({ Status: 1 });
    res.json(reorderStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get product reorder status
router.get('/products', async (req, res) => {
  try {
    const reorderStatus = await ProductROS.find().populate('Product').sort({ Status: 1 });
    res.json(reorderStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
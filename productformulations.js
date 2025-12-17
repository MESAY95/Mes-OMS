import express from 'express';
import ProductFormulation from '../models/ProductFormulation.js';

const router = express.Router();

// GET /api/productformulations - Get all product formulations
router.get('/', async (req, res) => {
  try {
    const formulations = await ProductFormulation.find().sort({ createdAt: -1 });
    res.json(formulations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/productformulations/:id - Get a single product formulation by ID
router.get('/:id', async (req, res) => {
  try {
    const formulation = await ProductFormulation.findById(req.params.id);
    if (!formulation) {
      return res.status(404).json({ message: 'Product formulation not found' });
    }
    res.json(formulation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/productformulations - Create a new product formulation
router.post('/', async (req, res) => {
  try {
    // Calculate effective quantity
    const lossMultiplier = 1 + ((req.body.lossFactor || 0) / 100);
    const effectiveQuantity = req.body.quantity * lossMultiplier;

    const formulation = new ProductFormulation({
      productName: req.body.productName,
      materialName: req.body.materialName,
      quantity: req.body.quantity,
      materialUnit: req.body.materialUnit,
      lossFactor: req.body.lossFactor || 0,
      effectiveQuantity: effectiveQuantity,
      status: req.body.status || 'Active'
    });

    const newFormulation = await formulation.save();
    res.status(201).json(newFormulation);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'A formulation with this product and material already exists' 
      });
    }
    res.status(400).json({ message: error.message });
  }
});

// PUT /api/productformulations/:id - Update a product formulation
router.put('/:id', async (req, res) => {
  try {
    const formulation = await ProductFormulation.findById(req.params.id);
    if (!formulation) {
      return res.status(404).json({ message: 'Product formulation not found' });
    }

    // Calculate effective quantity if quantity or loss factor is being updated
    let effectiveQuantity = formulation.effectiveQuantity;
    if (req.body.quantity !== undefined || req.body.lossFactor !== undefined) {
      const quantity = req.body.quantity !== undefined ? req.body.quantity : formulation.quantity;
      const lossFactor = req.body.lossFactor !== undefined ? req.body.lossFactor : formulation.lossFactor;
      const lossMultiplier = 1 + (lossFactor / 100);
      effectiveQuantity = quantity * lossMultiplier;
    }

    const updateData = {
      ...(req.body.productName !== undefined && { productName: req.body.productName }),
      ...(req.body.materialName !== undefined && { materialName: req.body.materialName }),
      ...(req.body.quantity !== undefined && { quantity: req.body.quantity }),
      ...(req.body.materialUnit !== undefined && { materialUnit: req.body.materialUnit }),
      ...(req.body.lossFactor !== undefined && { lossFactor: req.body.lossFactor }),
      ...(req.body.status !== undefined && { status: req.body.status }),
      effectiveQuantity: effectiveQuantity
    };

    const updatedFormulation = await ProductFormulation.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json(updatedFormulation);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'A formulation with this product and material already exists' 
      });
    }
    res.status(400).json({ message: error.message });
  }
});

// DELETE /api/productformulations/:id - Delete a product formulation
router.delete('/:id', async (req, res) => {
  try {
    const formulation = await ProductFormulation.findById(req.params.id);
    if (!formulation) {
      return res.status(404).json({ message: 'Product formulation not found' });
    }

    await ProductFormulation.deleteOne({ _id: req.params.id });
    res.json({ message: 'Product formulation deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
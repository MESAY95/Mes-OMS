// import express from 'express';
// import InventoryMS from '../models/InventoryMS.js';
// import InventoryPS from '../models/InventoryPS.js';
// import MaterialROS from '../models/MaterialROS.js';
// import Material from '../models/Material2.js';
// import Product from '../models/Product.js';
// import MaterialRI from '../models/MaterialRI.js';
// import ProductRI from '../models/ProductRI.js';

// const router = express.Router();

// // Get all materials with inventory data
// router.get('/materials', async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 50, 
//       search, 
//       status,
//       sortBy = 'Material',
//       sortOrder = 'asc'
//     } = req.query;

//     // Build filter for materials
//     const materialFilter = { Status: 'Active' };
    
//     if (search) {
//       materialFilter.$or = [
//         { Material: { $regex: search, $options: 'i' } },
//         { MaterialCode: { $regex: search, $options: 'i' } }
//       ];
//     }

//     const sort = {};
//     sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

//     // Get materials with inventory data
//     const materials = await Material.find(materialFilter)
//       .sort(sort)
//       .limit(limit * 1)
//       .skip((page - 1) * limit)
//       .lean();

//     // Get inventory data for these materials
//     const materialIds = materials.map(m => m._id);
//     const inventoryData = await InventoryMS.find({ 
//       Material: { $in: materialIds } 
//     }).lean();

//     // Create a map for quick inventory lookup
//     const inventoryMap = new Map();
//     inventoryData.forEach(item => {
//       inventoryMap.set(item.Material.toString(), item);
//     });

//     // Combine material data with inventory data
//     const enhancedMaterials = materials.map(material => {
//       const inventory = inventoryMap.get(material._id.toString());
//       return {
//         ...material,
//         inventory: inventory || {
//           Quantity: 0,
//           Status: 'Out of Stock',
//           MinimumStock: material.MinimumConsumption,
//           MaximumStock: material.MaximumConsumption,
//           ReorderPoint: material.ReorderQuantity
//         }
//       };
//     });

//     const total = await Material.countDocuments(materialFilter);

//     res.json({
//       materials: enhancedMaterials,
//       totalPages: Math.ceil(total / limit),
//       currentPage: parseInt(page),
//       total
//     });
//   } catch (error) {
//     console.error('Error fetching materials:', error);
//     res.status(500).json({ 
//       message: 'Error fetching materials',
//       error: error.message 
//     });
//   }
// });

// // Get material transactions with material names
// router.get('/material-transactions', async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 50,
//       search,
//       activity
//     } = req.query;

//     const filter = {};
    
//     if (search) {
//       filter.$or = [
//         { Material: { $regex: search, $options: 'i' } },
//         { Batch: { $regex: search, $options: 'i' } },
//         { DocumentNumber: { $regex: search, $options: 'i' } }
//       ];
//     }
    
//     if (activity) {
//       filter.Activity = activity;
//     }

//     const transactions = await MaterialRI.find(filter)
//       .sort({ Date: -1, createdAt: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit)
//       .lean();

//     // Get material names for the transactions
//     const materialNames = [...new Set(transactions.map(t => t.Material))];
//     const materials = await Material.find({ 
//       Material: { $in: materialNames } 
//     }).select('Material MaterialCode').lean();

//     const materialMap = new Map();
//     materials.forEach(m => {
//       materialMap.set(m.Material, m);
//     });

//     // Enhance transactions with material data
//     const enhancedTransactions = transactions.map(transaction => ({
//       ...transaction,
//       materialData: materialMap.get(transaction.Material) || {
//         Material: transaction.Material,
//         MaterialCode: 'N/A'
//       }
//     }));

//     const total = await MaterialRI.countDocuments(filter);

//     res.json({
//       transactions: enhancedTransactions,
//       totalPages: Math.ceil(total / limit),
//       currentPage: parseInt(page),
//       total
//     });
//   } catch (error) {
//     console.error('Error fetching material transactions:', error);
//     res.status(500).json({ 
//       message: 'Error fetching material transactions',
//       error: error.message 
//     });
//   }
// });

// // Get all products
// router.get('/products', async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 50, 
//       search, 
//       status = 'Active'
//     } = req.query;

//     const filter = { Status: status };
    
//     if (search) {
//       filter.$or = [
//         { Product: { $regex: search, $options: 'i' } },
//         { ProductCode: { $regex: search, $options: 'i' } }
//       ];
//     }

//     const products = await Product.find(filter)
//       .sort({ Product: 1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit)
//       .lean();

//     // Get product inventory data
//     const productIds = products.map(p => p._id);
//     const inventoryData = await InventoryPS.find({ 
//       Product: { $in: productIds } 
//     }).lean();

//     const inventoryMap = new Map();
//     inventoryData.forEach(item => {
//       inventoryMap.set(item.Product.toString(), item);
//     });

//     // Combine product data with inventory data
//     const enhancedProducts = products.map(product => {
//       const inventory = inventoryMap.get(product._id.toString());
//       return {
//         ...product,
//         inventory: inventory || {
//           Quantity: 0,
//           Status: 'Out of Stock'
//         }
//       };
//     });

//     const total = await Product.countDocuments(filter);

//     res.json({
//       products: enhancedProducts,
//       totalPages: Math.ceil(total / limit),
//       currentPage: parseInt(page),
//       total
//     });
//   } catch (error) {
//     console.error('Error fetching products:', error);
//     res.status(500).json({ 
//       message: 'Error fetching products',
//       error: error.message 
//     });
//   }
// });

// // Get product transactions with product names
// router.get('/product-transactions', async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 50,
//       search,
//       activity
//     } = req.query;

//     const filter = {};
    
//     if (search) {
//       filter.$or = [
//         { Product: { $regex: search, $options: 'i' } },
//         { Batch: { $regex: search, $options: 'i' } },
//         { DocumentNumber: { $regex: search, $options: 'i' } }
//       ];
//     }
    
//     if (activity) {
//       filter.Activity = activity;
//     }

//     const transactions = await ProductRI.find(filter)
//       .sort({ Date: -1, createdAt: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit)
//       .lean();

//     // Get product names for the transactions
//     const productNames = [...new Set(transactions.map(t => t.Product))];
//     const products = await Product.find({ 
//       Product: { $in: productNames } 
//     }).select('Product ProductCode').lean();

//     const productMap = new Map();
//     products.forEach(p => {
//       productMap.set(p.Product, p);
//     });

//     // Enhance transactions with product data
//     const enhancedTransactions = transactions.map(transaction => ({
//       ...transaction,
//       productData: productMap.get(transaction.Product) || {
//         Product: transaction.Product,
//         ProductCode: 'N/A'
//       }
//     }));

//     const total = await ProductRI.countDocuments(filter);

//     res.json({
//       transactions: enhancedTransactions,
//       totalPages: Math.ceil(total / limit),
//       currentPage: parseInt(page),
//       total
//     });
//   } catch (error) {
//     console.error('Error fetching product transactions:', error);
//     res.status(500).json({ 
//       message: 'Error fetching product transactions',
//       error: error.message 
//     });
//   }
// });

// // Get material reorder status
// router.get('/material-reorder-status', async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 50,
//       status
//     } = req.query;

//     const filter = {};
//     if (status && status !== 'All') {
//       filter.Status = status;
//     }

//     const reorderStatus = await MaterialROS.find(filter)
//       .populate('Material')
//       .sort({ Status: 1, AvailableStock: 1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit)
//       .lean();

//     const total = await MaterialROS.countDocuments(filter);

//     res.json({
//       reorderStatus,
//       totalPages: Math.ceil(total / limit),
//       currentPage: parseInt(page),
//       total
//     });
//   } catch (error) {
//     console.error('Error fetching material reorder status:', error);
//     res.status(500).json({ 
//       message: 'Error fetching material reorder status',
//       error: error.message 
//     });
//   }
// });

// // Calculate and update material reorder status
// router.post('/update-reorder-status', async (req, res) => {
//   try {
//     // First update inventory from transactions
//     await InventoryMS.updateFromTransactions();
    
//     const materials = await Material.find({ Status: 'Active' });
//     const updates = [];
    
//     for (const material of materials) {
//       const inventory = await InventoryMS.findOne({ Material: material._id });
//       const availableStock = inventory ? inventory.Quantity : 0;
      
//       // Calculate reorder points based on consumption and lead time
//       const dangerStockLevel = material.MinimumConsumption * material.MinimumLeadTime;
//       const reorderPoint = material.MaximumConsumption * material.MaximumLeadTime;
//       const maximumStockLevel = reorderPoint * 1.5;
      
//       let status = 'Active';
//       if (availableStock <= 0) {
//         status = 'Out of Stock';
//       } else if (availableStock <= dangerStockLevel) {
//         status = 'Danger Level';
//       } else if (availableStock <= reorderPoint) {
//         status = 'Low Stock';
//       }
      
//       // Update or create reorder status
//       const updateOp = MaterialROS.findOneAndUpdate(
//         { Material: material._id },
//         {
//           Material: material._id,
//           Unit: material.Unit,
//           MinimumStockLevel: material.MinimumConsumption,
//           MaximumStockLevel: maximumStockLevel,
//           DangerStockLevel: dangerStockLevel,
//           AvailableStock: availableStock,
//           ReorderPoint: reorderPoint,
//           Status: status
//         },
//         { upsert: true, new: true }
//       );
      
//       updates.push(updateOp);
//     }
    
//     await Promise.all(updates);
    
//     res.json({ 
//       message: 'Reorder status updated successfully',
//       updated: updates.length
//     });
//   } catch (error) {
//     console.error('Error updating reorder status:', error);
//     res.status(500).json({ 
//       message: 'Error updating reorder status',
//       error: error.message 
//     });
//   }
// });

// // Get dashboard statistics
// router.get('/dashboard', async (req, res) => {
//   try {
//     const [
//       totalMaterials,
//       totalProducts,
//       materialInventory,
//       productInventory,
//       lowStockCount,
//       recentMaterialTransactions,
//       recentProductTransactions
//     ] = await Promise.all([
//       Material.countDocuments({ Status: 'Active' }),
//       Product.countDocuments({ Status: 'Active' }),
//       InventoryMS.aggregate([
//         {
//           $group: {
//             _id: null,
//             totalValue: { $sum: { $multiply: ['$Quantity', '$UnitPrice'] } },
//             totalItems: { $sum: 1 },
//             lowStock: { 
//               $sum: { 
//                 $cond: [{ $lte: ['$Quantity', '$ReorderPoint'] }, 1, 0] 
//               } 
//             },
//             outOfStock: { 
//               $sum: { 
//                 $cond: [{ $eq: ['$Quantity', 0] }, 1, 0] 
//               } 
//             }
//           }
//         }
//       ]),
//       InventoryPS.aggregate([
//         {
//           $group: {
//             _id: null,
//             totalItems: { $sum: 1 },
//             outOfStock: { 
//               $sum: { 
//                 $cond: [{ $eq: ['$Quantity', 0] }, 1, 0] 
//               } 
//             }
//           }
//         }
//       ]),
//       MaterialROS.countDocuments({ 
//         Status: { $in: ['Low Stock', 'Danger Level', 'Out of Stock'] } 
//       }),
//       MaterialRI.find().sort({ Date: -1 }).limit(5).lean(),
//       ProductRI.find().sort({ Date: -1 }).limit(5).lean()
//     ]);

//     const materialStats = materialInventory[0] || { totalValue: 0, totalItems: 0, lowStock: 0, outOfStock: 0 };
//     const productStats = productInventory[0] || { totalItems: 0, outOfStock: 0 };

//     res.json({
//       statistics: {
//         totalMaterials,
//         totalProducts,
//         totalInventoryValue: materialStats.totalValue,
//         lowStockItems: lowStockCount,
//         outOfStockMaterials: materialStats.outOfStock,
//         outOfStockProducts: productStats.outOfStock
//       },
//       recentMaterialTransactions,
//       recentProductTransactions,
//       lastUpdated: new Date()
//     });
//   } catch (error) {
//     console.error('Error fetching dashboard data:', error);
//     res.status(500).json({ 
//       message: 'Error fetching dashboard data',
//       error: error.message 
//     });
//   }
// });

// export default router;
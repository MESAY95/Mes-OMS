// import mongoose from 'mongoose';

// const inventoryMSSchema = new mongoose.Schema({
//   Material: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: 'Materials', 
//     required: true 
//   },
//   MaterialName: { type: String, required: true },
//   MaterialCode: { type: String, required: true },
//   Unit: { type: String, required: true },
//   Quantity: { type: Number, required: true, default: 0 },
//   MinimumStock: { type: Number, required: true, default: 0 },
//   MaximumStock: { type: Number, required: true, default: 0 },
//   ReorderPoint: { type: Number, required: true, default: 0 },
//   Status: { 
//     type: String, 
//     enum: ['Normal', 'Low Stock', 'Out of Stock', 'Over Stock'], 
//     default: 'Normal' 
//   },
//   LastUpdated: { type: Date, default: Date.now }
// }, {
//   timestamps: true,
//   collection: 'inventoryms'
// });

// // Indexes for better performance
// inventoryMSSchema.index({ Material: 1 }, { unique: true });
// inventoryMSSchema.index({ MaterialCode: 1 });
// inventoryMSSchema.index({ Status: 1 });
// inventoryMSSchema.index({ Quantity: 1 });
// inventoryMSSchema.index({ LastUpdated: -1 });

// // Pre-save middleware to update status based on quantity
// inventoryMSSchema.pre('save', function(next) {
//   if (this.Quantity <= 0) {
//     this.Status = 'Out of Stock';
//   } else if (this.Quantity <= this.ReorderPoint) {
//     this.Status = 'Low Stock';
//   } else if (this.Quantity > this.MaximumStock) {
//     this.Status = 'Over Stock';
//   } else {
//     this.Status = 'Normal';
//   }
//   this.LastUpdated = new Date();
//   next();
// });

// // Static method to update inventory from transactions
// inventoryMSSchema.statics.updateFromTransactions = async function() {
//   try {
//     const MaterialRI = mongoose.model('MaterialRI');
//     const Material = mongoose.model('Materials');
    
//     const stockSummary = await MaterialRI.getMaterialStockSummary();
    
//     const bulkOps = [];
    
//     for (const item of stockSummary) {
//       const material = await Material.findOne({ 
//         Material: item.material,
//         Status: 'Active'
//       });
      
//       if (material) {
//         bulkOps.push({
//           updateOne: {
//             filter: { Material: material._id },
//             update: {
//               $set: {
//                 MaterialName: item.material,
//                 MaterialCode: item.materialCode,
//                 Unit: material.Unit,
//                 Quantity: item.currentStock,
//                 MinimumStock: material.MinimumConsumption,
//                 MaximumStock: material.MaximumConsumption * 1.5, // Buffer
//                 ReorderPoint: material.MinimumConsumption * material.MinimumLeadTime,
//                 LastUpdated: new Date()
//               }
//             },
//             upsert: true
//           }
//         });
//       }
//     }
    
//     if (bulkOps.length > 0) {
//       await this.bulkWrite(bulkOps);
//     }
    
//     return { updated: bulkOps.length };
//   } catch (error) {
//     console.error('Error updating inventory from transactions:', error);
//     throw error;
//   }
// };

// export default mongoose.model('InventoryMS', inventoryMSSchema);
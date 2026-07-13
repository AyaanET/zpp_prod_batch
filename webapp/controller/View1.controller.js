sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "zppprodbatch/model/models",     // Updated namespace
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat",
    "sap/ui/export/Spreadsheet",       // <--- ADD THIS
    "sap/ui/export/library"
], function (Controller, Filter, FilterOperator, MessageToast, Fragment, models, MessageBox, DateFormat, Spreadsheet, exportLibrary) {
    "use strict";

    return Controller.extend("zppprodbatch.controller.View1", {

        onInit: function () {
            var oLocalModel = models.createLocalModel();
            this.getView().setModel(oLocalModel, "local");
        },

        onProdOrderChange: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var sProdOrder = oLocalModel.getProperty("/selection/prodOrder");

            if (!sProdOrder) {
                return;
            }

            // Pad the production order to 12 characters as SAP expects it
            var sFormattedProdOrder = sProdOrder.padStart(12, "0");

            // Re-update the formatted value back to the model
            oLocalModel.setProperty("/selection/prodOrder", sFormattedProdOrder);

            this.fetchHeaderDataByProdOrder(sFormattedProdOrder);
        },

        fetchHeaderDataByProdOrder: function (sProdOrder) {
            var oView = this.getView();
            var oModel = oView.getModel(); // Main OData V4 model
            var oLocalModel = oView.getModel("local");

            // Filter strictly by Manufacturing Order
            var aFilters = [
                new Filter("ManufacturingOrder", FilterOperator.EQ, sProdOrder)
            ];

            var oListBinding = oModel.bindList("/ZI_SET_HEADER", null, null, aFilters, {
                $select: "ManufacturingOrder,SalesOrder,SalesOrderItem,MfgOrderPlannedTotalQty,Material,ProductDescription,SFGMAT,SFGDes,BaseUnit,ProductionPlant"
            });

            oView.setBusy(true);
            oListBinding.requestContexts(0, 1).then(function (aContexts) {
                oView.setBusy(false);
                if (aContexts.length === 0) {
                    oLocalModel.setProperty("/selection/salesOrder", "");
                    oLocalModel.setProperty("/selection/salesOrderItem", "");
                    oLocalModel.setProperty("/selection/plant", "");
                    oLocalModel.setProperty("/selection/material", "");
                    oLocalModel.setProperty("/selection/materialDescription", "");
                    MessageToast.show("No header details found for this Production Order.");
                    return;
                }

                var oHeader = aContexts[0].getObject();

                // Populate Local Model with header details
                oLocalModel.setProperty("/selection/salesOrder", oHeader.SalesOrder);
                oLocalModel.setProperty("/selection/salesOrderItem", oHeader.SalesOrderItem);
                // oLocalModel.setProperty("/selection/prodOrdQty", oHeader.MfgOrderPlannedTotalQty);
                oLocalModel.setProperty("/selection/plant", oHeader.ProductionPlant);
                // oLocalModel.setProperty("/selection/unit", oHeader.BaseUnit);
                oLocalModel.setProperty("/selection/material", oHeader.Material);
                oLocalModel.setProperty("/selection/materialDescription", oHeader.ProductDescription);
                // oLocalModel.setProperty("/selection/sfgmat", oHeader.SFGMAT);
                // oLocalModel.setProperty("/selection/sfgdes", oHeader.SFGDes);

                // Make sure fetchBatchesInBackground is defined elsewhere in your controller!
                // if(this._fetchBatchesInBackground) {
                //     this._fetchBatchesInBackground(oHeader.SalesOrder, oHeader.SalesOrderItem, oHeader.SFGMAT);
                // }

            }.bind(this)).catch(function (oError) {
                oView.setBusy(false);
                oLocalModel.setProperty("/selection/salesOrder", "");
                oLocalModel.setProperty("/selection/salesOrderItem", "");
                oLocalModel.setProperty("/selection/plant", "");
                oLocalModel.setProperty("/selection/material", "");
                oLocalModel.setProperty("/selection/materialDescription", "");
                MessageBox.error("Error fetching header details.");
            });
        },

        onSelectionChange: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var oSelection = oLocalModel.getProperty("/selection");

            var sPlant = oSelection.plant;
            var sSalesOrder = oSelection.salesOrder;
            var sSalesOrderItem = oSelection.salesOrderItem;
            var sFromSloc = oSelection.fromSloc;
            var sProdOrder = oSelection.prodOrder;
            if (!sPlant || !sFromSloc || !sProdOrder) {
                if (oLocalModel) {
                    oLocalModel.setProperty("/allBatches", []);
                }
                return;
            }

            this._fetchBatchesInBackground(sPlant, sFromSloc, sSalesOrder, sSalesOrderItem, sProdOrder);
        },
        // ==========================================
        // FROM STORAGE LOCATION LOGIC
        // ==========================================
        onFromSlocSuggest: function (oEvent) {
            var sTerm = oEvent.getParameter("suggestValue");
            var sPlant = this.getView().byId("inputPlant").getValue();
            var aFilters = [];

            if (!sPlant) {
                sap.m.MessageToast.show("Please select a Plant first");
                oEvent.getSource().getBinding("suggestionItems").filter([]);
                return;
            }

            aFilters.push(new Filter("Plant", FilterOperator.EQ, sPlant));
            if (sTerm) {
                aFilters.push(new Filter("StorageLocation", FilterOperator.StartsWith, sTerm));
            }
            oEvent.getSource().getBinding("suggestionItems").filter(aFilters);
        },

        onFromSlocValueHelp: function (oEvent) {
            var oView = this.getView();
            var sPlant = oView.byId("inputPlant").getValue();

            if (!sPlant) {
                sap.m.MessageToast.show("Please select a Plant first");
                return;
            }

            if (!this._oFromSlocDialog) {
                sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "zppprodbatch.view.FromSlocVH",
                    controller: this
                }).then(function (oDialog) {
                    this._oFromSlocDialog = oDialog;
                    oView.addDependent(this._oFromSlocDialog);
                    var oFilter = new Filter("Plant", FilterOperator.EQ, sPlant);
                    this._oFromSlocDialog.getBinding("items").filter([oFilter]);
                    this._oFromSlocDialog.open();
                }.bind(this));
            } else {
                var oFilter = new Filter("Plant", FilterOperator.EQ, sPlant);
                this._oFromSlocDialog.getBinding("items").filter([oFilter]);
                this._oFromSlocDialog.open();
            }
        },

        onFromSlocVHSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var sPlant = this.getView().byId("inputPlant").getValue();
            var aFilters = [new Filter("Plant", FilterOperator.EQ, sPlant)];

            if (sValue) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("StorageLocation", FilterOperator.Contains, sValue),
                        new Filter("StorageLocationName", FilterOperator.Contains, sValue)
                    ],
                    and: false
                }));
            }
            oEvent.getSource().getBinding("items").filter(aFilters);
        },

        onFromSlocVHConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sSloc = oSelectedItem.getCells()[1].getText();
                this.getView().byId("inputFromSloc").setValue(sSloc);

                // Trigger the background fetch since From Sloc changed
                this.onSelectionChange();
            }
        },

        // ==========================================
        // TO STORAGE LOCATION LOGIC
        // ==========================================
        onToSlocSuggest: function (oEvent) {
            var sTerm = oEvent.getParameter("suggestValue");
            var sPlant = this.getView().byId("inputPlant").getValue();
            var aFilters = [];

            if (!sPlant) {
                sap.m.MessageToast.show("Please select a Plant first");
                oEvent.getSource().getBinding("suggestionItems").filter([]);
                return;
            }

            aFilters.push(new Filter("Plant", FilterOperator.EQ, sPlant));
            if (sTerm) {
                aFilters.push(new Filter("StorageLocation", FilterOperator.StartsWith, sTerm));
            }
            oEvent.getSource().getBinding("suggestionItems").filter(aFilters);
        },

        onToSlocValueHelp: function (oEvent) {
            var oView = this.getView();
            var sPlant = oView.byId("inputPlant").getValue();

            if (!sPlant) {
                sap.m.MessageToast.show("Please select a Plant first");
                return;
            }

            if (!this._oToSlocDialog) {
                sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "zppprodbatch.view.ToSlocVH", // Ensure this fragment is created
                    controller: this
                }).then(function (oDialog) {
                    this._oToSlocDialog = oDialog;
                    oView.addDependent(this._oToSlocDialog);
                    var oFilter = new Filter("Plant", FilterOperator.EQ, sPlant);
                    this._oToSlocDialog.getBinding("items").filter([oFilter]);
                    this._oToSlocDialog.open();
                }.bind(this));
            } else {
                var oFilter = new Filter("Plant", FilterOperator.EQ, sPlant);
                this._oToSlocDialog.getBinding("items").filter([oFilter]);
                this._oToSlocDialog.open();
            }
        },

        onToSlocVHSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var sPlant = this.getView().byId("inputPlant").getValue();
            var aFilters = [new Filter("Plant", FilterOperator.EQ, sPlant)];

            if (sValue) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("StorageLocation", FilterOperator.Contains, sValue),
                        new Filter("StorageLocationName", FilterOperator.Contains, sValue)
                    ],
                    and: false
                }));
            }
            oEvent.getSource().getBinding("items").filter(aFilters);
        },

        onToSlocVHConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sSloc = oSelectedItem.getCells()[1].getText();
                this.getView().byId("inputToSloc").setValue(sSloc);
            }
        },

        // ==========================================
        // PRODUCTION ORDER VALUE HELP LOGIC
        // ==========================================
        
        onProdOrderSuggest: function (oEvent) {
            var sTerm = oEvent.getParameter("suggestValue");
            var aFilters = [];

            if (sTerm) {
                // Allows searching while typing
                aFilters.push(new Filter("ManufacturingOrder", FilterOperator.StartsWith, sTerm));
            }
            oEvent.getSource().getBinding("suggestionItems").filter(aFilters);
        },

        onProdOrderValueHelp: function (oEvent) {
            var oView = this.getView();

            if (!this._oProdOrdDialog) {
                sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    name: "zppprodbatch.view.ProdOrdVH", 
                    controller: this
                }).then(function (oDialog) {
                    this._oProdOrdDialog = oDialog;
                    oView.addDependent(this._oProdOrdDialog);
                    
                    this._oProdOrdDialog.open();
                }.bind(this));
            } else {
                this._oProdOrdDialog.open();
            }
        },

       onProdOrdVHSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var aFilters = [];

            if (sValue) {
                // Group the filters and apply the OR condition
                var oCombinedFilter = new Filter({
                    filters: [
                        new Filter("ManufacturingOrder", FilterOperator.Contains, sValue),
                        new Filter("Material", FilterOperator.Contains, sValue),
                        new Filter("ProductDescription", FilterOperator.Contains, sValue)
                    ],
                    and: false // This is the magic property! It means OR.
                });
                
                aFilters.push(oCombinedFilter);
            }
            
            oEvent.getSource().getBinding("items").filter(aFilters);
        },

        onProdOrdVHConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sProdOrder = oSelectedItem.getCells()[0].getText();
                
                // Update the local JSON model
                this.getView().getModel("local").setProperty("/selection/prodOrder", sProdOrder);
                
                // Trigger the existing function to fetch the header details automatically!
                this.onProdOrderChange(); 
            }
        },


        _fetchBatchesInBackground: function (sPlant, sFromSloc, sSalesOrder, sSalesOrderItem, sProdOrder) {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var oModel = oView.getModel(); // Primary OData V4 Model

            console.log("Attempting fetch...", sPlant, sFromSloc, sProdOrder);

            var aFilters = [
                new Filter("ProductionPlant", FilterOperator.EQ, sPlant),
                new Filter("StorageLocation", FilterOperator.EQ, sFromSloc),
                new Filter("ManufacturingOrder", FilterOperator.EQ, sProdOrder)
            ];

            var mParameters = {
                "$select": "Batch,ProductionPlant,StorageLocation,Material,ProductDescription,QTY,Qty311,PendingQty,EntryUnit"
            };

            var oListBinding = oModel.bindList("/ZI_SET_BATCH", null, null, aFilters, mParameters);

            oView.setBusy(true);

            oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                oView.setBusy(false);

                var aAllBatches = aContexts.map(function (oContext) {
                    return oContext.getObject();
                });

                console.log("Fetched batches:", aAllBatches);

                // 1. Update the background cache
                oLocalModel.setProperty("/allBatches", aAllBatches);

                // 2. Fetch the missing 'toSloc' value directly from the model to prevent the crash
                var sToSloc = oLocalModel.getProperty("/selection/toSloc") || "";

                // 3. DIRECTLY APPEND TO THE UI TABLE
                var aTableBatches = aAllBatches.map(function (batch) {
                    return {
                        batch: batch.Batch,
                        material: batch.Material,
                        description: batch.ProductDescription,
                        fromSloc: sFromSloc,
                        toSloc: sToSloc,
                        salesOrder: sSalesOrder,
                        salesOrderItem: sSalesOrderItem,
                        plant: batch.ProductionPlant,

                        // New Fields Mapped from OData
                        issuedQty: batch.QTY,          // Read Only
                        transferredQty: batch.Qty311,       // Read Only
                        pendingQty: batch.PendingQty,   // Read Only

                        // Set the editable Input default to PendingQty
                        qty: batch.PendingQty,

                        uom: batch.EntryUnit
                    };
                });

                // Push the newly formatted array into the table model
                oLocalModel.setProperty("/scannedBatches", aTableBatches);

                this._calculateTotalYield(); // Recalculate yield after appending

                if (aAllBatches.length > 0) {
                    sap.m.MessageToast.show("Success: Appended " + aAllBatches.length + " batches directly to the table.");
                } else {
                    sap.m.MessageToast.show("No batches found for this criteria in the backend.");
                }

            }.bind(this)).catch(function (oError) { // <--- FIXED SYNTAX HERE
                oView.setBusy(false);
                console.error("Fetch failed:", oError);
                sap.m.MessageToast.show("Failed to load batches from SAP.");
            });
        },


        // ==========================================
        // DELETE SELECTED BATCHES
        // ==========================================
        onDeleteBatch: function (oEvent) {
            var oView = this.getView();
            var oTable = oView.byId("batchesTable");
            var oLocalModel = oView.getModel("local");

            var aSelectedContexts = oTable.getSelectedContexts();

            if (aSelectedContexts.length === 0) {
                sap.m.MessageToast.show("Please select at least one batch to delete.");
                return;
            }

            var aScannedBatches = oLocalModel.getProperty("/scannedBatches") || [];

            var aSelectedObjects = aSelectedContexts.map(function (oContext) {
                return oContext.getObject();
            });

            var aRemainingBatches = aScannedBatches.filter(function (oBatch) {
                return aSelectedObjects.indexOf(oBatch) === -1;
            });

            oLocalModel.setProperty("/scannedBatches", aRemainingBatches);
            oTable.removeSelections(true);

            this._calculateTotalYield();
            sap.m.MessageToast.show(aSelectedContexts.length + " batches deleted.");
        },

        _calculateTotalYield: function () {
            var oLocalModel = this.getView().getModel("local");
            var aScannedBatches = oLocalModel.getProperty("/scannedBatches") || [];
            var fTotalQty = 0;

            // Loop through all scanned batches and sum the quantity
            aScannedBatches.forEach(function (oBatch) {
                // Parse float to ensure mathematical addition, not string concatenation
                fTotalQty += parseFloat(oBatch.qty) || 0;
            });

            // Set the total back to the model, rounded to 2 decimal places (optional)
            oLocalModel.setProperty("/selection/yieldQty", fTotalQty.toFixed(3));
        },

        // ==========================================
        // FOOTER BUTTON ACTIONS
        // ==========================================
        onNew: function () {
            var oLocalModel = this.getView().getModel("local");

            oLocalModel.setProperty("/scannedBatches", []);
            oLocalModel.setProperty("/selection/plant", "");
            oLocalModel.setProperty("/selection/salesOrder", "");
            oLocalModel.setProperty("/selection/salesOrderItem", "");
            oLocalModel.setProperty("/selection/fromSloc", "");
            oLocalModel.setProperty("/selection/toSloc", "");
            oLocalModel.setProperty("/selection/remark", "");
            oLocalModel.setProperty("/selection/prodOrder", ""); // NEW: Added for Production Order
            // oLocalModel.setProperty("/selection/yieldQty", "");
            oLocalModel.setProperty("/selection/material", "");
            oLocalModel.setProperty("/selection/materialDescription", "");
            oLocalModel.setProperty("/yieldQty", ""); // Reset yield quantity
            // oLocalModel.setProperty("/selection/toSalesOrder", "");
            // oLocalModel.setProperty("/selection/toSalesOrderItem", "");

            sap.m.MessageToast.show("Screen cleared for new entry.");
        },

        // ==========================================
        // SUBMIT TO BACKEND
        // ==========================================
        onSubmit: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var oODataModel = oView.getModel();

            var oSelection = oLocalModel.getProperty("/selection");
            var aScannedBatches = oLocalModel.getProperty("/scannedBatches") || [];

            if (!oSelection.plant || !oSelection.prodOrder || !oSelection.salesOrder || !oSelection.salesOrderItem ||
                !oSelection.fromSloc || !oSelection.toSloc || !oSelection.postingDate) {

                MessageBox.error("Please fill in all mandatory details before submitting.");
                return;
            }

            if (aScannedBatches.length === 0) {
                MessageBox.error("There are no batches in the table to submit.");
                return;
            }

            for (var i = 0; i < aScannedBatches.length; i++) {
                var oBatch = aScannedBatches[i];
                
                var fQtyToTransfer = parseFloat(oBatch.qty) || 0;
                var fPendingQty = parseFloat(oBatch.pendingQty) || 0;

                if (fQtyToTransfer > fPendingQty) {
                    MessageBox.error(
                        "Error on Batch " + oBatch.batch + ":\n\n" +
                        "Quantity to Transfer (" + fQtyToTransfer + ") cannot be greater than the Pending Quantity (" + fPendingQty + ")."
                    );
                    return; 
                }

                if (fQtyToTransfer <= 0) {
                    MessageBox.error(
                        "Error on Batch " + oBatch.batch + ":\n\n" +
                        "Quantity to Transfer must be greater than zero."
                    );
                    return; 
                }
            }

            var oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
            var sFormattedDate = oDateFormat.format(oSelection.postingDate);
            var sSalesOrder = oSelection.salesOrder.padStart(10, '0');
            var sSalesOrderItem = oSelection.salesOrderItem.padStart(6, '0');
            var sProdOrder = oSelection.prodOrder.padStart(12, '0'); // Pad Production Order to 12 characters

            // Format To fields
            // var sToSalesOrder = oSelection.toSalesOrder ? oSelection.toSalesOrder.padStart(10, '0') : "";
            // var sToSalesOrderItem = oSelection.toSalesOrderItem ? oSelection.toSalesOrderItem.padStart(6, '0') : "";


            var aItemsPayload = aScannedBatches.map(function (oBatch) {
                return {
                    "Material": oBatch.material,
                    "Qty": String(oBatch.qty),
                    "Unit": oBatch.uom,
                    "Batch": oBatch.batch,
                    "FromSalesOrder": sSalesOrder,
                    "FromSalesOrderItem": sSalesOrderItem,
                    "ProdOrder": sProdOrder,
                    "StorlocFrom": oBatch.fromSloc,
                    "StorlocTo": oBatch.toSloc,
                    "MatDes": oBatch.description,
                    "Plant": oSelection.plant,
                    // "ToBatch": oBatch.batchTransfer || ""
                };
            });

            var oPayload = {
                "ProdOrder": sProdOrder,
                "Salesorder": sSalesOrder,
                "Salesorderitem": sSalesOrderItem,
                "Tosalesorder": sSalesOrder,
                "Tosalesorderitem": sSalesOrderItem,
                "Plant": oSelection.plant,
                "PostingDate": sFormattedDate,
                "StorlocFrom": oSelection.fromSloc,
                "StorlocTo": oSelection.toSloc,
                "Remark": oSelection.remark || "",
                "_Item": aItemsPayload
            };

            oView.setBusy(true);

            var oListBinding = oODataModel.bindList("/ZC_PRODBATCH_HD");
            var oContext = oListBinding.create(oPayload);

            oContext.created().then(function () {
                oView.setBusy(false);

                var sMatDoc = oContext.getProperty("MatDoc");
                var sMess = oContext.getProperty("Mess");

                if (sMatDoc && sMatDoc.trim() !== "") {
                    var sMessage = "Material Document " + sMatDoc + " created successfully!";
                    MessageBox.success(sMessage, {
                        onClose: function () {
                            oLocalModel.setProperty("/scannedBatches", []);
                            oLocalModel.setProperty("/selection/plant", "");
                            oLocalModel.setProperty("/selection/salesOrder", "");
                            oLocalModel.setProperty("/selection/salesOrderItem", "");
                            oLocalModel.setProperty("/selection/yieldQty", "");
                            oLocalModel.setProperty("/selection/fromSloc", "");
                            oLocalModel.setProperty("/selection/toSloc", "");
                            oLocalModel.setProperty("/selection/prodOrder", "");
                            oLocalModel.setProperty("/selection/materialDescription", "");
                            oLocalModel.setProperty("/selection/material", "");
                            // oLocalModel.setProperty("/selection/toSalesOrder", "");
                            // oLocalModel.setProperty("/selection/toSalesOrderItem", "");
                            oLocalModel.setProperty("/selection/remark", "");

                            var oPlantInput = oView.byId("inputPlant");
                            if (oPlantInput) {
                                oPlantInput.focus();
                            }
                        }
                    });
                } else {
                    var sBackendError = sMess ? sMess : "Backend failed to generate a Material Document.";
                    MessageBox.error("SAP Business Error: \n\n" + sBackendError);
                }

            }).catch(function (oError) {
                oView.setBusy(false);
                var sErrorMsg = "Failed to post Material Document due to a network/server error.";
                if (oError && oError.message) {
                    sErrorMsg = oError.message;
                }
                MessageBox.error(sErrorMsg);
            });
        },

        // ==========================================
        // EXPORT TO EXCEL LOGIC
        // ==========================================
        onExportExcel: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var aScannedBatches = oLocalModel.getProperty("/scannedBatches");

            if (!aScannedBatches || aScannedBatches.length === 0) {
                sap.m.MessageToast.show("There are no scanned batches to export.");
                return;
            }

            var sToSloc = oLocalModel.getProperty("/selection/toSloc") || "";
            var sFromSloc = oLocalModel.getProperty("/selection/fromSloc") || "";
            var sSalesOrder = oLocalModel.getProperty("/selection/salesOrder") || "";
            var sSalesOrderItem = oLocalModel.getProperty("/selection/salesOrderItem") || "";

            var aExportData = aScannedBatches.map(function (oBatch) {
                var oExportRow = Object.assign({}, oBatch);
                oExportRow.toSloc = sToSloc;
                oExportRow.fromSloc = sFromSloc;
                oExportRow.salesOrder = sSalesOrder;
                oExportRow.salesOrderItem = sSalesOrderItem;
                return oExportRow;
            });

            var aCols = this._createColumnConfig();

            var oSettings = {
                workbook: {
                    columns: aCols,
                    hierarchyLevel: 'Level'
                },

                dataSource: aExportData,

                fileName: 'Confirmation_Items.xlsx',
                worker: false
            };

            var oSheet = new sap.ui.export.Spreadsheet(oSettings);
            oSheet.build().finally(function () {
                oSheet.destroy();
            });
        },

        _createColumnConfig: function () {
            var EdmType = exportLibrary.EdmType;

            return [
                {
                    label: 'Material',
                    property: 'material',
                    type: EdmType.String
                },
                {
                    label: 'Description',
                    property: 'description',
                    type: EdmType.String
                },
                {
                    label: 'Batch',
                    property: 'batch',
                    type: EdmType.String
                },
                {
                    label: 'From Sloc',
                    property: 'fromSloc',
                    type: EdmType.String
                },
                {
                    label: 'To Sloc',
                    property: 'toSloc',
                    type: EdmType.String
                },
                {
                    label: 'Sales Order',
                    property: 'salesOrder',
                    type: EdmType.String
                },
                {
                    label: 'Item',
                    property: 'salesOrderItem',
                    type: EdmType.String
                },

                {
                    label: 'Issued Qty',
                    property: 'issuedQty',
                    type: EdmType.Number
                },
                {
                    label: 'Transferred Qty',
                    property: 'transferredQty',
                    type: EdmType.Number
                },
                {
                    label: 'Pending Qty',
                    property: 'pendingQty',
                    type: EdmType.Number
                },

                {
                    label: 'Qty To Transfer',
                    property: 'qty',
                    type: EdmType.Number
                },
                {
                    label: 'UoM',
                    property: 'uom',
                    type: EdmType.String
                }
            ];
        }
    });
});
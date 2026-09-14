sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "zppprodbatch/model/models",     
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat",
    "sap/ui/export/Spreadsheet",       
    "sap/ui/export/library"
], function (Controller, Filter, FilterOperator, MessageToast, Fragment, models, MessageBox, DateFormat, Spreadsheet, exportLibrary) {
    "use strict";

    return Controller.extend("zppprodbatch.controller.View1", {

        onInit: function () {
            var oLocalModel = models.createLocalModel();
            this.getView().setModel(oLocalModel, "local");
        },

        onEndBitsChange: function (oEvent) {
            var bIsChecked = oEvent.getParameter("state");
            var oLocalModel = this.getView().getModel("local");

            if (bIsChecked) {
                oLocalModel.setProperty("/selection/fromSloc", "CTG1");
                oLocalModel.setProperty("/selection/toSloc", "PP02");
                oLocalModel.setProperty("/selection/remark", "End Bits Transfer");
            } else {
                // Toggle is OFF: Clear the hardcoded value and Lot Number
                oLocalModel.setProperty("/selection/fromSloc", "");
                oLocalModel.setProperty("/selection/lotNumber", "");
                oLocalModel.setProperty("/scannedBatches", []);
                oLocalModel.setProperty("/selection/plant", "");
                oLocalModel.setProperty("/selection/salesOrder", "");
                oLocalModel.setProperty("/selection/salesOrderItem", "");
                oLocalModel.setProperty("/selection/toSloc", "");
                oLocalModel.setProperty("/selection/remark", "");
                oLocalModel.setProperty("/selection/prodOrder", ""); 
                // oLocalModel.setProperty("/selection/yieldQty", "");
                oLocalModel.setProperty("/selection/material", "");
                oLocalModel.setProperty("/selection/materialDescription", "");
                oLocalModel.setProperty("/yieldQty", ""); 
                oLocalModel.setProperty("/selection/productGroup", ""); 


            }

            this.onSelectionChange();
        },

        onProdOrderChange: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var sProdOrder = oLocalModel.getProperty("/selection/prodOrder");

            if (!sProdOrder) {
                return;
            }

            var sFormattedProdOrder = sProdOrder.padStart(12, "0");

            oLocalModel.setProperty("/selection/prodOrder", sFormattedProdOrder);

            this.fetchHeaderDataByProdOrder(sFormattedProdOrder);
        },

        fetchHeaderDataByProdOrder: function (sProdOrder) {
            var oView = this.getView();
            var oModel = oView.getModel();
            var oLocalModel = oView.getModel("local");

            var aFilters = [
                new Filter("ManufacturingOrder", FilterOperator.EQ, sProdOrder)
            ];

            var oListBinding = oModel.bindList("/ZI_SET_HEADER", null, null, aFilters, {
                $select: "ManufacturingOrder,SalesOrder,SalesOrderItem,YY1_LotNumber2_ORD,MfgOrderPlannedTotalQty,Material,ProductDescription,ProductGroup,BaseUnit,ProductionPlant,DeliveryDate,ActualDeliveredQuantity"
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
                    oLocalModel.setProperty("/selection/deliveryDate", "");
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
                oLocalModel.setProperty("/selection/lotNumber", oHeader.YY1_LotNumber2_ORD);
                oLocalModel.setProperty("/selection/productGroup", oHeader.ProductGroup);
                oLocalModel.setProperty("/selection/deliveryDate", oHeader.DeliveryDate);
                oLocalModel.setProperty("/selection/yieldQty", oHeader.ActualDeliveredQuantity);
                // oLocalModel.setProperty("/selection/sfgmat", oHeader.SFGMAT);
                // oLocalModel.setProperty("/selection/sfgdes", oHeader.SFGDes);

                var bIsEndBits = oLocalModel.getProperty("/selection/isEndBits");

                if (bIsEndBits) {
                    this.onSelectionChange();
                }
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
                oLocalModel.setProperty("/selection/lotNumber", "");
                oLocalModel.setProperty("/selection/productGroup", "");
                oLocalModel.setProperty("/selection/deliveryDate", "");
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
            var sYieldQty = oSelection.yieldQty;
            if (!sPlant || !sFromSloc || !sProdOrder) {
                if (oLocalModel) {
                    oLocalModel.setProperty("/allBatches", []);
                }
                return;
            }

            if (sYieldQty <= 0 || sYieldQty === "" || sYieldQty === null) {
                MessageToast.show("Yield Qty is zero, please select a different order");
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
                    name: "zppprodbatch.view.ToSlocVH", 
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
                aFilters.push(new Filter("ManufacturingOrder", FilterOperator.StartsWith, sTerm));
            }
            oEvent.getSource().getBinding("suggestionItems").filter(aFilters);
        },

        onProdOrderValueHelp: function (oEvent) {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var bIsEndBits = oLocalModel.getProperty("/selection/isEndBits");

            if (bIsEndBits) {
                if (!this._oProdOrdDialogEndBits) {
                    sap.ui.core.Fragment.load({
                        id: oView.getId(),
                        name: "zppprodbatch.view.ProdOrderVH",
                        controller: this
                    }).then(function (oDialog) {
                        this._oProdOrdDialogEndBits = oDialog;
                        oView.addDependent(this._oProdOrdDialogEndBits);
                        this._oProdOrdDialogEndBits.open();
                    }.bind(this));
                } else {
                    this._oProdOrdDialogEndBits.open();
                }

            } else {
                if (!this._oProdOrdDialogStandard) {
                    sap.ui.core.Fragment.load({
                        id: oView.getId(),
                        name: "zppprodbatch.view.ProdOrdVH",
                        controller: this
                    }).then(function (oDialog) {
                        this._oProdOrdDialogStandard = oDialog;
                        oView.addDependent(this._oProdOrdDialogStandard);
                        this._oProdOrdDialogStandard.open();
                    }.bind(this));
                } else {
                    this._oProdOrdDialogStandard.open();
                }
            }
        },

        onProdOrdVHSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var aFilters = [];

            if (sValue) {
                var oCombinedFilter = new Filter({
                    filters: [
                        new Filter("ManufacturingOrder", FilterOperator.Contains, sValue),
                        new Filter("Material", FilterOperator.Contains, sValue),
                        new Filter("ProductDescription", FilterOperator.Contains, sValue)
                    ],
                    and: false 
                });

                aFilters.push(oCombinedFilter);
            }

            oEvent.getSource().getBinding("items").filter(aFilters);
        },

        onProdOrdVHConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                var sProdOrder = oSelectedItem.getCells()[0].getText();

                this.getView().getModel("local").setProperty("/selection/prodOrder", sProdOrder);

                this.onProdOrderChange();
            }
        },

        // ==========================================
        // REMARK F4 VALUE HELP LOGIC
        // ==========================================
        onRemarkValueHelp: function (oEvent) {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var bIsEndBits = oLocalModel.getProperty("/selection/isEndBits");

            var sProductGroup = oLocalModel.getProperty("/selection/productGroup") || "";

            if (sProductGroup === "SFG03") {
                sProductGroup = "SFG02";
            }

            if (bIsEndBits) {
                return;
            }

            var oFilter = new sap.ui.model.Filter({
                filters: [
                    new sap.ui.model.Filter("ProductGroup", sap.ui.model.FilterOperator.EQ, sProductGroup),
                    new sap.ui.model.Filter("ProductGroup", sap.ui.model.FilterOperator.EQ, "")
                ],
                and: false // "OR" instead of "AND"
            });

            if (!this._oRemarkDialog) {
                sap.ui.core.Fragment.load({
                    id: oView.getId(),
                    confirm: this.onRemarkVHConfirm.bind(this),
                    name: "zppprodbatch.view.RemarkVH",
                    controller: this
                }).then(function (oDialog) {
                    this._oRemarkDialog = oDialog;
                    oView.addDependent(this._oRemarkDialog);

                    this._oRemarkDialog.getBinding("items").filter([oFilter]);
                    this._oRemarkDialog.open();
                }.bind(this));
            } else {
                this._oRemarkDialog.getBinding("items").filter([oFilter]);
                this._oRemarkDialog.open();
            }
        },

        onRemarkVHSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var aFilters = [];

            if (sValue) {
                var sUpperValue = sValue.toUpperCase();

                var aOrFilters = [
                    new sap.ui.model.Filter("Operation", sap.ui.model.FilterOperator.Contains, sValue),
                    new sap.ui.model.Filter("Operation", sap.ui.model.FilterOperator.Contains, sUpperValue),
                    new sap.ui.model.Filter("ProductGroup", sap.ui.model.FilterOperator.Contains, sValue),
                    new sap.ui.model.Filter("ProductGroup", sap.ui.model.FilterOperator.Contains, sUpperValue),
                    new sap.ui.model.Filter("MasterName", sap.ui.model.FilterOperator.Contains, sValue),
                    new sap.ui.model.Filter("MasterName", sap.ui.model.FilterOperator.Contains, sUpperValue)
                ];

                if (sValue.length <= 4) {
                    aOrFilters.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sUpperValue));
                    aOrFilters.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sValue));
                }

                aFilters.push(new sap.ui.model.Filter({
                    filters: aOrFilters,
                    and: false
                }));
            }

            oEvent.getSource().getBinding("items").filter(aFilters);
        },

        onRemarkVHConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oLocalModel = this.getView().getModel("local");

            if (oSelectedItem) {
                var sSelectedRemark = oSelectedItem.getCells()[3].getText(); 
                
                oLocalModel.setProperty("/selection/remark", sSelectedRemark);
            }
        },

        onBatchValueHelp: function (oEvent) {
            var oInput = oEvent.getSource();
            var oRowContext = oInput.getBindingContext("local");
            var oLocalModel = this.getView().getModel("local");

            this._sBatchUpdatePath = oRowContext.getPath();

            var sMaterial = oRowContext.getProperty("material");
            var sPlant = oLocalModel.getProperty("/selection/plant");
            var sFromSloc = oLocalModel.getProperty("/selection/fromSloc");
            var sSalesOrder = oLocalModel.getProperty("/selection/salesOrder");
            var sSalesOrderItem = oLocalModel.getProperty("/selection/salesOrderItem");
            var sLotNumber = oLocalModel.getProperty("/selection/lotNumber");
            var sEndBits = oLocalModel.getProperty("/selection/isEndBits");

            if (!this._oBatchDialog) {
                this._oBatchDialog = new sap.m.TableSelectDialog({
                    title: "Select Batch",
                    confirm: this.onBatchDialogConfirm.bind(this),
                    search: this.onBatchDialogSearch.bind(this),
                    contentWidth: "1000px", 

                    columns: [
                        new sap.m.Column({ header: new sap.m.Text({ text: "Batch" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Available Qty" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Sales Order" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "SO Item" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Storage Loc" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Plant" }) })
                    ]
                });
                this.getView().addDependent(this._oBatchDialog);
            }

            var aFilters = [
                new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.EQ, sMaterial),
                new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant),
                new sap.ui.model.Filter("StorageLocation", sap.ui.model.FilterOperator.EQ, sFromSloc)
            ];

            if(sEndBits) {
                aFilters.push(new sap.ui.model.Filter("Batch", sap.ui.model.FilterOperator.EQ, sLotNumber));
            }

            if (sSalesOrder) {
                aFilters.push(new sap.ui.model.Filter("SDDocument", sap.ui.model.FilterOperator.EQ, sSalesOrder));
            }
            if (sSalesOrderItem) {
                aFilters.push(new sap.ui.model.Filter("SDDocumentItem", sap.ui.model.FilterOperator.EQ, sSalesOrderItem));
            }

            this._oBatchDialog.bindAggregation("items", {
                path: "/ZI_GET_BATCH",
                template: new sap.m.ColumnListItem({
                    cells: [
                        new sap.m.Text({ text: "{Batch}" }),
                        new sap.m.Text({ text: "{QTY} {MaterialBaseUnit}" }),
                        new sap.m.Text({ text: "{ProductDescription}" }),
                        new sap.m.Text({ text: "{SDDocument}" }),
                        new sap.m.Text({ text: "{SDDocumentItem}" }),
                        new sap.m.Text({ text: "{StorageLocation}" }),
                        new sap.m.Text({ text: "{Plant}" })
                    ]
                }),
                filters: aFilters
            });

            this._oBatchDialog.open();
        },

        onBatchDialogSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oBinding = oEvent.getSource().getBinding("items");

            if (sValue) {
                oBinding.filter([new Filter("Batch", FilterOperator.Contains, sValue)]);
            } else {
                oBinding.filter([]);
            }
        },

        onBatchDialogConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oLocalModel = this.getView().getModel("local");

            if (oSelectedItem && this._sBatchUpdatePath) {

                var sSelectedBatch = oSelectedItem.getCells()[0].getText();

                oLocalModel.setProperty(this._sBatchUpdatePath + "/batch", sSelectedBatch);
            }

            this._sBatchUpdatePath = null;
        },

        _fetchBatchesInBackground: function (sPlant, sFromSloc, sSalesOrder, sSalesOrderItem, sProdOrder) {
            var oLocalModel = this.getView().getModel("local");
            var bIsEndBits = oLocalModel.getProperty("/selection/isEndBits");

            if (bIsEndBits) {
                this._fetchComponentsForEndBits(sProdOrder, sPlant, sFromSloc, sSalesOrder, sSalesOrderItem);
            } else {
                this._fetchStandardBatches(sPlant, sFromSloc, sSalesOrder, sSalesOrderItem, sProdOrder);
            }
        },

        _fetchStandardBatches: function (sPlant, sFromSloc, sSalesOrder, sSalesOrderItem, sProdOrder) {
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

        _fetchComponentsForEndBits: function (sProdOrder, sPlant, sFromSloc, sSalesOrder, sSalesOrderItem) {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var oModel = oView.getModel(); // Primary OData V4 Model

            var aFilters = [
                new Filter("ProductionOrder", FilterOperator.EQ, sProdOrder)
            ];

            var mParameters = {
                "$select": "Reservation,ReservationItem,ProductionOrder,Material,ProductDescription,Plant,StorageLocation,EntryUnit"
            };

            var oListBinding = oModel.bindList("/ZI_SET_COMP", null, null, aFilters, mParameters);

            oView.setBusy(true);

            oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                oView.setBusy(false);

                var aAllComponents = aContexts.map(function (oContext) {
                    return oContext.getObject();
                });

                var sToSloc = oLocalModel.getProperty("/selection/toSloc") || "";
                var sLotNumber = oLocalModel.getProperty("/selection/lotNumber") || "";

                // Construct the array with blank Batches and blank Quantities
                var aTableBatches = aAllComponents.map(function (comp) {
                    return {
                        batch: "", 
                        material: comp.Material,
                        description: comp.ProductDescription,
                        fromSloc: sFromSloc, 
                        toSloc: sToSloc,
                        salesOrder: sSalesOrder,
                        salesOrderItem: sSalesOrderItem,
                        plant: sPlant,
                        transferBatch: sLotNumber,

                        issuedQty: 0, 
                        transferredQty: 0, 
                        pendingQty: 0, 

                        qty: "", 
                        uom: comp.EntryUnit
                    };
                });

                oLocalModel.setProperty("/scannedBatches", aTableBatches);
                this._calculateTotalYield();

                if (aAllComponents.length > 0) {
                    sap.m.MessageToast.show("End Bits Mode: Loaded " + aAllComponents.length + " components. Please select batches.");
                } else {
                    sap.m.MessageToast.show("No components found for this Production Order.");
                }

            }.bind(this)).catch(function (oError) {
                oView.setBusy(false);
                console.error("Fetch failed:", oError);
                sap.m.MessageToast.show("Failed to load components from SAP.");
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

            aScannedBatches.forEach(function (oBatch) {
                fTotalQty += parseFloat(oBatch.qty) || 0;
            });

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
            oLocalModel.setProperty("/selection/prodOrder", ""); 
            // oLocalModel.setProperty("/selection/yieldQty", "");
            oLocalModel.setProperty("/selection/material", "");
            oLocalModel.setProperty("/selection/materialDescription", "");
            oLocalModel.setProperty("/yieldQty", ""); // Reset yield quantity
            oLocalModel.setProperty("/selection/lotNumber", ""); // Reset lot number
            oLocalModel.setProperty("/selection/productGroup", ""); // Reset product group
            oLocalModel.setProperty("/selection/deliveryDate", ""); // Reset delivery date
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

                if (fQtyToTransfer > fPendingQty && !oSelection.isEndBits) {
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

            };

            var oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
            var sFormattedDate = oDateFormat.format(oSelection.postingDate);
            var sSalesOrder = oSelection.salesOrder.padStart(10, '0');
            var sSalesOrderItem = oSelection.salesOrderItem.padStart(6, '0');
            var sProdOrder = oSelection.prodOrder.padStart(12, '0'); // Pad Production Order to 12 characters

            if(oSelection.deliveryDate > sFormattedDate)
            {
                MessageBox.error("Select a valid posting date");
                return;
            }
            // Format To fields
            // var sToSalesOrder = oSelection.toSalesOrder ? oSelection.toSalesOrder.padStart(10, '0') : "";
            // var sToSalesOrderItem = oSelection.toSalesOrderItem ? oSelection.toSalesOrderItem.padStart(6, '0') : "";


            var aItemsPayload = aScannedBatches.map(function (oBatch) {
                return {
                    "Material": oBatch.material,
                    "Qty": String(oBatch.qty),
                    "Unit": oBatch.uom,
                    "Batch": oBatch.batch,
                    "ToBatch": oBatch.transferBatch,
                    "FromSalesOrder": sSalesOrder,
                    "FromSalesOrderItem": sSalesOrderItem,
                    "ProdOrder": sProdOrder,
                    "StorlocFrom": oBatch.fromSloc,
                    "StorlocTo": oSelection.toSloc,
                    "MatDes": oBatch.description,
                    "Plant": oSelection.plant,
                    "PostingDate": sFormattedDate,
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
                            oLocalModel.setProperty("/selection/lotNumber", "");
                            oLocalModel.setProperty("/selection/productGroup", "");
                            // oLocalModel.setProperty("/selection/toSalesOrder", "");
                            // oLocalModel.setProperty("/selection/toSalesOrderItem", "");

                            if (!oSelection.isEndBits) {
                                oLocalModel.setProperty("/selection/remark", "");
                            }
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
// ==========================================
        // EXPORT TO EXCEL LOGIC
        // ==========================================
        onExportExcel: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var aScannedBatches = oLocalModel.getProperty("/scannedBatches");
            
            // 1. Get the End Bits toggle state
            var bIsEndBits = oLocalModel.getProperty("/selection/isEndBits");

            if (!aScannedBatches || aScannedBatches.length === 0) {
                sap.m.MessageToast.show("There are no scanned batches to export.");
                return;
            }

            var sToSloc = oLocalModel.getProperty("/selection/toSloc") || "";
            var sFromSloc = oLocalModel.getProperty("/selection/fromSloc") || "";
            var sSalesOrder = oLocalModel.getProperty("/selection/salesOrder") || "";
            var sSalesOrderItem = oLocalModel.getProperty("/selection/salesOrderItem") || "";
            var sLotNumber = oLocalModel.getProperty("/selection/lotNumber") || ""; 

            var aExportData = aScannedBatches.map(function (oBatch) {
                var oExportRow = Object.assign({}, oBatch);
                oExportRow.toSloc = sToSloc;
                oExportRow.fromSloc = sFromSloc;
                oExportRow.salesOrder = sSalesOrder;
                oExportRow.salesOrderItem = sSalesOrderItem;
                
                if (bIsEndBits) {
                    oExportRow.lotNumber = sLotNumber;
                }
                
                return oExportRow;
            });

            var aCols = this._createColumnConfig(bIsEndBits);

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

        _createColumnConfig: function (bIsEndBits) {
            var EdmType = exportLibrary.EdmType;

            var aCols = [
                { label: 'Material', property: 'material', type: EdmType.String },
                { label: 'Description', property: 'description', type: EdmType.String },
                { label: 'Batch', property: 'batch', type: EdmType.String }
            ];

            if (bIsEndBits) {
                aCols.push({ label: 'Batch Transfer', property: 'lotNumber', type: EdmType.String });
            }

            aCols.push(
                { label: 'From Sloc', property: 'fromSloc', type: EdmType.String },
                { label: 'To Sloc', property: 'toSloc', type: EdmType.String },
                { label: 'Sales Order', property: 'salesOrder', type: EdmType.String },
                { label: 'Item', property: 'salesOrderItem', type: EdmType.String }
            );

            if (!bIsEndBits) {
                aCols.push(
                    { label: 'Issued Qty', property: 'issuedQty', type: EdmType.Number },
                    { label: 'Transferred Qty', property: 'transferredQty', type: EdmType.Number },
                    { label: 'Pending Qty', property: 'pendingQty', type: EdmType.Number }
                );
            }

            aCols.push(
                { label: 'Qty To Transfer', property: 'qty', type: EdmType.Number },
                { label: 'UoM', property: 'uom', type: EdmType.String }
            );

            return aCols;
        }
    });
});
sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], 
function (JSONModel, Device) {
    "use strict";

    return {
        /**
         * Provides runtime information for the device the UI5 app is running on as a JSONModel.
         * @returns {sap.ui.model.json.JSONModel} The device model.
         */
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        },

        /**
         * Main JSON model for the 311E batching selection and scanning screen.
         * Contains form inputs, background cache, and the active table array.
         */
        createLocalModel: function () {
            var oModel = new JSONModel({
                
                // 1. Selection Screen State
                selection: {
                    postingDate: new Date(), 
                    plant: "",
                    salesOrder: "",
                    salesOrderItem: "",
                    // toSalesOrder: "",       
                    // toSalesOrderItem: "",    
                    fromSloc: "",        
                    toSloc: "",          
                    remark: "",
                    yieldQty: "",
                    material: "", 
                    prodOrder: "",       
                    materialDescription: "" ,
                    isEndBits: false,    
                    lotNumber: ""   ,     
                    productGroup: ""     
                },

                // 2. Background Data (e.g., Loaded from your backend view)
                allBatches: [],

                
                // { batch: "...", batchTransfer: "", material: "...", description: "...", qty: "...", uom: "..." }
                scannedBatches: []

            });

            // TwoWay binding allows the UI inputs (like the manual Batch Transfer input) 
            // to update this model instantly without extra code
            oModel.setDefaultBindingMode("TwoWay");
            
            return oModel;
        }
    };

});
/**
 * @author Grgur Grisogono
 * @author Nilton Gomes de Oliveira Neto - LabTIC
 * @author José Raupp da Rosa Junior - LabTIC
 *
 * IndexedDB proxy connects models and stores to local IndexedDB storage.
 *
 * Modified to work with new version of IndexedDB
 *
 * Version: 0.1
 *
 * TODO: respect sorters, filters, start and limit options on the Operation; failover option for remote proxies, ..
 */
Ext.define('Ext.data.proxy.IndexedDB2', {
    extend: 'Ext.data.proxy.Proxy',

    alias: 'proxy.idb2',

    alternateClassName: 'Ext.data.IdbProxy2',

    /**
     * @cfg {String} version
     * database version. If different than current, use updatedb event to update database
     */
    dbVersion: 1,

    /**
     * @cfg {String} dbName
     * Name of database
     */
    dbName: undefined,

    /**
     * @cfg {String} objectStoreName
     * Name of object store
     */
    objectStoreName: undefined,

    /**
     * @cfg {String} keyPath
     * Primary key for objectStore. Proxy will use reader's idProperty if not keyPath not defined.
     */
    keyPath: undefined,

    /**
     * @cfg {Boolean} autoIncrement
     * Set true if keyPath is to autoIncrement. Defaults to IndexedDB default specification (false)
     */
    autoIncrement: false,

    /**
     * @cfg {Array} indexes
     * Array of Objects. Properties required are "name" for index name and "field" to specify index field
     * e.g. indexes: [{name: 'name', field: 'somefield', options: {unique: false}}]
     */
    indexes: [],

    /**
     * @cfg {Array} initialData
     * Initial data that will be inserted in object store on store creation
     */
    initialData: [],

    /**
     * @private
     * indexedDB object (if browser supports it)
     */
    indexedDB: window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB,

    /**
     * @private
     * db object
     */
    db: undefined,

    /**
     * @private
     * used to monitor initial data insertion. A helper to know when all data is in. Helps fight asynchronous nature of idb.
     */
    initialDataCount: 0,

    /**
     * @private
     * Trigger that tells that proxy is currently inserting initial data
     */
    insertingInitialData: false,

    /**
     * Creates the proxy, throws an error if local storage is not supported in the current browser.
     * @param {Object} config (optional) Config object.
     */
    constructor: function (config) {
        this.callParent(arguments);

        this.checkDependencies();

        this.addEvents('dbopen', 'updatedb', 'exception', 'cleardb', 'initialDataInserted', 'noIdb');

        if (!window.indexedDB) {
            window.alert("Your browser doesn't support the latest version of IndexedDB. Try using BrowserDB to automatically switch to the proper proxy (IndexedDB or WebDB).");
        }

        this.initialize();
    },

    /**
     * @private
     * Sets up the Proxy by opening database and creating object store if necessary
     */
    initialize: function () {
        var me = this,
            request = me.indexedDB.open(me.dbName, me.dbVersion);

        me.on('updatedb', me.addInitialData);

        request.onupgradeneeded = function (e) {
            var db = me.db = me.indexedDB.db = e.target.result,
                indexes = me.indexes, keyPath, store, i;

            //clean old versions
            if (db.objectStoreNames.contains(me.objectStoreName)) {
                console.log(me.objectStoreName);
                db.deleteObjectStore(me.objectStoreName);
            }

            //set keyPath. Use idProperty if keyPath is not specified
            if (!me.keyPath) {
                me.keyPath = me.getReader().getIdProperty();
            }

            // create objectStore
            keyPath = me.keyPath ? me.keyPath : undefined;
            store = db.createObjectStore(me.objectStoreName, {keyPath: keyPath, autoIncrement: me.autoIncrement});

            // set indexes
            for (i in indexes) {
                if (indexes.hasOwnProperty(i)) {
                    store.createIndex(i, indexes[i].field, indexes[i].options);
                }
            }
            //Database is open and ready so fire dbopen event
            me.fireEvent('updatedb', me, db);
        };

        request.onsuccess = function (e) {
            console.log('success dbopen');
            var db = me.db = me.indexedDB.db = e.target.result;
            me.fireEvent('dbopen', me, db);
        };

        request.onerror = me.onerror;
    },

    /**
     * Universal error reporter for debugging purposes
     * @param {Object} err Error object.
     */
    onError: function (err) {
        if (window.console) console.log(err);
    },

    /**
     * Check if all needed config options are set
     */
    checkDependencies: function () {
        var me = this;
        window.p = me;
        if (!me.indexedDB) {
            me.fireEvent('noIdb');
            Ext.Error.raise("IndexedDB is not supported in your browser.");
        }
        if (!Ext.isString(me.dbName))  Ext.Error.raise("The dbName string has not been defined in your Ext.data.proxy.IndexedDB");
        if (!Ext.isString(me.objectStoreName)) Ext.Error.raise("The objectStoreName string has not been defined in your Ext.data.proxy.IndexedDB");

        return true;
    },

    /**
     * Add initial data if set at {@link #initialData}
     */
    addInitialData: function () {
        this.addData();
    },

    /**
     * Add data when needed
     * Also add initial data if set at {@link #initialData}
     * @param {Array/Ext.data.Store} newData Data to add as array of objects or a store instance. Optional
     * @param {Boolean} clearFirst Clear existing data first
     */
    addData: function (newData, clearFirst) {
        var me = this,
            model = me.getModel().getName(),
            data = newData || me.initialData;

        //clear objectStore first
        if (clearFirst === true) {
            me.clear();
            me.addData(data);
            return;
        }

        if (Ext.isString(data)) {
            var storeById = Ext.data.StoreManager.lookup(data);
            if (!Ext.isEmpty(storeById)) {
                data = me.getDataFromStore(storeById);
            }
        } else if (Ext.isObject(data) && data.isStore === true) {
            data = me.getDataFromStore(data);
        }

        me.initialDataCount = data.length;
        me.insertingInitialData = true;

        Ext.each(data, function (entry) {
            Ext.ModelManager.create(entry, model).save();
        })
    },

    /**
     * Get data from store. Usually from Server proxy.
     * Useful if caching data data that don't change much (e.g. for comboboxes)
     * Used at {@link #addData}
     * @private
     * @param {Ext.data.Store} store Store instance
     * @return {Array} Array of raw data
     */
    getDataFromStore: function (store) {
        var data = [];
        store.each(function (item) {
            data.push(item.data)
        });
        return data;
    },

    //inherit docs
    create: function (operation, callback, scope) {
        var records = operation.records,
            length = records.length,
            record, i;
        operation.setStarted();
        for (i = 0; i < length; i++) {
            record = records[i];
            this.setRecord(record);
        }
        operation.setCompleted();
        operation.setSuccessful();
        if (typeof callback == 'function') {
            callback.call(scope || this, operation);
        }
    },

    //inherit docs
    read: function (operation, callback, scope) {
        var records = [],
            me = this;
        var finishReading = function (record, request, event) {
            me.readCallback(operation, record);

            if (typeof callback == 'function') {
                callback.call(scope || this, operation);
            }
        }
        //read a single record
        if (operation.id) {
            this.getRecord(operation.id, finishReading, me);
        } else { //read all records
            this.getAllRecords(finishReading, me);
            operation.setSuccessful();
        }
    },

    /**
     * Injects data in operation instance
     */
    readCallback: function (operation, records) {
        var rec = Ext.isArray(records) ? records : [records];
        operation.setSuccessful();
        operation.setCompleted();
        operation.resultSet = Ext.create('Ext.data.ResultSet', {
            records: rec,
            total: rec.length,
            loaded: true
        });
    },

    //inherit docs
    update: function (operation, callback, scope) {
        var records = operation.records,
            length = records.length,
            record, i;
        operation.setStarted();

        for (i = 0; i < length; i++) {
            record = records[i];
            this.updateRecord(record);
        }
        operation.setCompleted();
        operation.setSuccessful();

        if (typeof callback == 'function') {
            callback.call(scope || this, operation);
        }
    },

    //inherit
    destroy: function (operation, callback, scope) {
        var records = operation.records,
            length = records.length,
            i;
        for (i = 0; i < length; i++) {
            this.removeRecord(records[i].getId(), false);
        }
        operation.setCompleted();
        operation.setSuccessful();
        if (typeof callback == 'function') {
            callback.call(scope || this, operation);
        }
    },

    /**
     * Create objectStore instance
     * @param {String} type Transaction type (r, rw)
     * @param {Function} callback Callback function
     * @param {Object} scope Callback fn scope
     * @return {Object} IDB objectStore instance
     */
    getObjectStore: function (type, callback, scope) {
        try {
            var me = this,
                transTypes = {
                    'rw': 'readwrite',
                    'r': 'readonly',
                    'vc': 'versionchange'
                },
                transaction = me.db.transaction([me.objectStoreName], type ? transTypes[type] : undefined),
                objectStore = transaction.objectStore(me.objectStoreName);
        } catch (e) {
            //retry until available due to asynchronous nature of indexedDB transaction. Not the best of workarounds.
            Ext.defer(callback, 20, scope || me, [type, callback, scope]);
            return false;
        }

        return objectStore;
    },

    /**
     * @private
     * Fetches a single record by id.
     * @param {Mixed} id Record id
     * @param {Function} callback Callback function
     * @param {Object} scope Callback fn scope
     */
    getRecord: function (id, callback, scope) {
        var me = this,
            objectStore = me.getObjectStore('r', Ext.bind(me.getRecord, me, [id, callback, scope])),
            Model = this.model,
            record;
        if (!objectStore) return false;

        var request = objectStore.get(id);
        request.onerror = function (event) {
            me.fireEvent('exception', me, event);
        };
        request.onsuccess = function (event) {
            record = new Model(request.result, id);
            if (typeof callback == 'function') {
                callback.call(scope || me, record, request, event);
            }
        };

        return true;
    },

    /**
     * @private
     * Fetches all records
     * @param {Function} callback Callback function
     * @param {Object} scope Callback fn scope
     */
    getAllRecords: function (callback, scope) {
        var me = this,
            objectStore = me.getObjectStore('r', Ext.bind(me.getAllRecords, me, [callback, scope])),
            Model = this.model,
            records = [];
        if (!objectStore) return;

        var request = objectStore.openCursor();
        request.onerror = function (event) {
            me.fireEvent('exception', me, event);
        };
        request.onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
                records.push(new Model(cursor.value, cursor.key));
                cursor.continue();
            }else {
                if (typeof callback == 'function') {
                    console.log(records);
                    callback.call(scope || me, records, request, event)
                }
            }

        };
    },

    /**
     * Saves the given record in the Proxy.
     * @param {Ext.data.Model} record The model instance
     */
    setRecord: function (record) {
        var me = this,
            rawData = record.data,
            objectStore = me.getObjectStore('rw', Ext.bind(me.setRecord, me, [record]));
        if (!objectStore) return;

        var request = objectStore.add(rawData);
        request.onsuccess = function () {
            if (me.insertingInitialData) {
                me.initialDataCount--;
                if (me.initialDataCount === 0) {
                    me.insertingInitialData = false;
                    me.fireEvent('initialDataInserted');
                }
            }
        }

    },

    /**
     * Updates the given record.
     * @param {Ext.data.Model} record The model instance
     */
    updateRecord: function (record) {
        var me = this,
            objectStore = me.getObjectStore('rw', Ext.bind(me.updateRecord, me, [record])),
            newData = record.data;

        if (!objectStore) return false;

        var request = objectStore.put(newData);

        request.onerror = function (event) {
            me.fireEvent('exception', me, event);
        };

        return true;
    },

    /**
     * @private
     * Physically removes a given record from the object store.
     * @param {Mixed} id The id of the record to remove
     */
    removeRecord: function (id) {
        var me = this,
            objectStore = me.getObjectStore('rw', Ext.bind(me.removeRecord, me, [id]));
        if (!objectStore) return;

        var request = objectStore.delete(id);
        request.onerror = function (event) {
            me.fireEvent('exception', me, event);
        };
    },

    /**
     * Destroys all records stored in the proxy
     */
    clear: function (callback, scope) {
        var me = this,
            objectStore = me.getObjectStore('rw', Ext.bind(me.clear, me, [callback, scope]));
        if (!objectStore) return;

        var request = objectStore.clear();
        request.onerror = function (event) {
            me.fireEvent('exception', me, event);
        };
    }
});
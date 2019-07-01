const mongoose =  require("mongoose");
const uuid = require("node-uuid");

const RequestError = require("../errors/requestError");
const CreateError = require("../errors/createError");
const UpdateError = require("../errors/updateError");
const DeleteError = require("../errors/deleteError");
const UnknownPropertyError = require("../errors/unknownPropertyError");


const transactionSchema = new mongoose.Schema({
    //_id: { type: String, unique: true, required: true, default: () => uuid.v1() },
    operations: [],
    rollbackIndex: Number,
    status: {
        default: "Pending",
        type: String
    },
});




/** The operations and transaction possible states */
const Status = {
    pending: "Pending",
    success: "Success",
    error: "Error",
    rollback: "Rollback",
    errorRollback: "ErrorRollback"
};

/** Class representing a transaction. */
module.exports = class Transaction {

    /**
     * Create a transaction.
     * @param useDb - The boolean parameter allow to use transaction collection on db (default false)
     * @param transactionId - The id of the transaction to load, load the transaction
     *                        from db if you set useDb true (default "")
     */
    constructor(useDb = false, connection, application) {
        this._useDb = useDb
        this._transactionId = ""
        this._connection = connection;
        this._application = application;
        if(connection)
            this.Model  = this.connection.model('_transactions', transactionSchema);
    }

        /** Index used for retrieve the executed transaction in the run */
        get rollbackIndex() { return this._rollbackIndex; }
        set rollbackIndex(value) { return this._rollbackIndex = value; }
   
       /** Boolean value for enable or disable saving transaction on db */
       get useDb() { return this._useDb; }
       set useDb(value) { return this._useDb = value; }
   
       /** The id of the current transaction document on database */
       get transactionId() { return this._transactionId; }
       set transactionId(value) { return this._transactionId = value; }
   
       /** The actions to execute on mongoose collections when transaction run is called */
       get operations() { return this._operations; }
       set operations(value) { return this._operations = value; }
   
       get application() { return this._application; }
       set application(value) { return this._application = value; }
   
       get Model() { return this._Model; }
       set Model(value) { return this._Model = value; }

    /**
     * Load transaction from transaction collection on db.
     * @param transactionId - The id of the transaction to load.
     * @trows Error - Throws error if the transaction is not found
     */
     async loadDbTransaction(transactionId) {

        const loadedTransaction = await this.Model.findById(transactionId).lean().exec()
        if (loadedTransaction && loadedTransaction.operations) {
            loadedTransaction.operations.forEach((operation) => {
                operation.model = this.connection.model(operation.modelName);
            });
            this.operations = loadedTransaction.operations
            this.rollbackIndex = loadedTransaction.rollbackIndex
            this.transactionId = transactionId
            return loadedTransaction
        } else {
            throw new Error('Transaction not found')
            // return null
        }

    }

    /**
     * Remove transaction from transaction collection on db,
     * if the transactionId param is null, remove all documents in the collection.
     * @param transactionId - Optional. The id of the transaction to remove (default null).
     */
     async removeDbTransaction(transactionId = null) {

        try {
            if (transactionId === null) {
                await this.Model.remove({}).exec()
            } else {
                await this.Model.findByIdAndRemove(transactionId).exec()
            }
        } catch (error) {
            throw new Error('Fail remove transaction[s] in removeDbTransaction')
        }

    }

    /**
     * If the instance is db true, return the actual or new transaction id.
     * @throws Error - Throws error if the instance is not a db instance.
     */
     async getTransactionId() {
        if (this.transactionId === "") {
            await this.createTransaction();
        }
        return this.transactionId;

    }

    /**
     * Get transaction operations array from transaction object or collection on db.
     * @param transactionId - Optional. If the transaction id is passed return the elements of the transaction id
     *                                  else return the elements of current transaction (default null).
     */
     async getOperations(transactionId = null) {

        if (transactionId) {
            return await this.Model.findById(transactionId).lean().exec()
        } else {
            return this.operations
        }

    }

    /**
     * Save transaction operations array on db.
     * @throws Error - Throws error if the instance is not a db instance.
     * @return transactionId - The transaction id on database
     */
     async saveOperations() {

        if (this.transactionId === "") {
            await this.createTransaction()
        }

        await this.Model.findOneAndUpdate(this.transactionId, {
            operations: this.operations,
            rollbackIndex: this.rollbackIndex
        })

        return this.transactionId

    }

    /**
     * Clean the operations object to begin a new transaction on the same instance.
     */
     async clean() {
        this.operations = [];
        this.rollbackIndex = 0
        this.transactionId = ""
        if (this.useDb) {
            this.transactionId = await this.createTransaction()
        }
    }

    async remove() {
        await this.removeDbTransaction(this.transactionId);
    }

    /**
     * Create the insert transaction and rollback states.
     * @param modelName - The string containing the mongoose model name.
     * @param data - The object containing data to insert into mongoose this.Model.
     * @returns id - The id of the object to insert.
     */
     insert(modelName, data, options = {}) {
        const model = this.connection.model(modelName);

        if (!data._id) {
            data._id = uuid.v1();
        }

        const transactionObj = {
            data,
            findId: data._id,
            model,
            modelName,
            oldModel: null,
            options,
            rollbackType: "remove",
            status: Status.pending,
            type: "insert",
        };

        this.operations.push(transactionObj);

        return data._id;

    }

    /**
     * Create the findOneAndUpdate transaction and rollback states.
     * @param modelName - The string containing the mongoose model name.
     * @param findId - The id of the object to update.
     * @param dataObj - The object containing data to update into mongoose this.Model.
     */
     update(modelName, findId, data, options = {}) {
        const model = this.connection.model(modelName);
        const transactionObj = {
            data,
            findId,
            model,
            modelName,
            oldModel: null,
            options,
            rollbackType: "update",
            status: Status.pending,
            type: "update",
        };

        this.operations.push(transactionObj);

    }

    /**
     * Create the remove transaction and rollback states.
     * @param modelName - The string containing the mongoose model name.
     * @param findObj - The object containing data to find mongoose collection.
     */
     remove(modelName, findId, options = {}) {
        const model = this.connection.model(modelName);
        const transactionObj = {
            data: null,
            findId,
            model,
            modelName,
            oldModel: null,
            options,
            rollbackType: "insert",
            status: Status.pending,
            type: "remove",
        };

        this.operations.push(transactionObj);

    }

    /**
     * Run the operations and check errors.
     * @returns Array of objects - The objects returned by operations
     *          Error - The error object containing:
     *                  data - the input data of operation
     *                  error - the error returned by the operation
     *                  executedTransactions - the number of executed operations
     *                  remainingTransactions - the number of the not executed operations
     */
     async run() {

        if (this.useDb && this.transactionId === "") {
            await this.createTransaction()
        }

        const final = []

        return this.operations.reduce((promise, transaction, index) => {

            return promise.then(async (result) => {

                let operation = {}

                switch (transaction.type) {
                    case "insert":
                        operation = this.insertTransaction(transaction.model, transaction.data)
                        break;
                    case "update":
                        operation = this.findByIdTransaction(transaction.model, transaction.findId)
                            .then((findRes) => {
                                transaction.oldModel = findRes;
                                return this.updateTransaction(
                                    transaction.model,
                                    transaction.findId,
                                    transaction.data,
                                    transaction.options
                                )
                            })
                        break;
                    case "remove":
                        operation = this.findByIdTransaction(transaction.model, transaction.findId)
                            .then((findRes) => {
                                transaction.oldModel = findRes;
                                return this.removeTransaction(transaction.model, transaction.findId)
                            })
                        break;
                }

                return operation.then(async (query) => {
                    this.rollbackIndex = index
                    this.updateOperationStatus(Status.success, index)

                    if (index === this.operations.length - 1) {
                        await this.updateDbTransaction(Status.success)
                    }

                    final.push(query)
                    return final

                }).catch(async (err) => {
                    this.updateOperationStatus(Status.error, index)

                    await this.updateDbTransaction(Status.error)

                    throw err
                })

            })

        }, Promise.resolve([]))

    }

    /**
     * Rollback the executed operations if any error occurred.
     * @param   stepNumber - (optional) the number of the operation to rollback - default to length of
     *                            operation successfully runned
     * @returns Array of objects - The objects returned by rollback operations
     *          Error - The error object containing:
     *                  data - the input data of operation
     *                  error - the error returned by the operation
     *                  executedTransactions - the number of rollbacked operations
     *                  remainingTransactions - the number of the not rollbacked operations
     */
     async rollback(howmany = this.rollbackIndex + 1) {

        if (this.useDb && this.transactionId === "") {
            await this.createTransaction()
        }

        let transactionsToRollback = this.operations.slice(0, this.rollbackIndex + 1)

        transactionsToRollback.reverse()

        if (howmany !== this.rollbackIndex + 1) {
            transactionsToRollback = transactionsToRollback.slice(0, howmany)
        }

        const final = []

        return transactionsToRollback.reduce((promise, transaction, index) => {

            return promise.then((result) => {

                let operation = {}

                switch (transaction.rollbackType) {
                    case "insert":
                        operation = this.insertTransaction(transaction.model, transaction.oldModel)
                        break;
                    case "update":
                        operation = this.updateTransaction(transaction.model,
                            transaction.findId, transaction.oldModel)
                        break;
                    case "remove":
                        operation = this.removeTransaction(transaction.model, transaction.findId)
                        break;
                }

                return operation.then(async (query) => {
                    this.rollbackIndex--

                    this.updateOperationStatus(Status.rollback, index)
                    if (index === this.operations.length - 1) {
                        await this.updateDbTransaction(Status.rollback)
                    }

                    final.push(query)
                    return final

                }).catch(async (err) => {

                    this.updateOperationStatus(Status.errorRollback, index)
                    await this.updateDbTransaction(Status.errorRollback)

                    throw err
                })

            })

        }, Promise.resolve([]))

    }

     async findByIdTransaction(model, findId) {
        return await model.findById(findId).lean().exec();
    }

     async createTransaction() {
        if (this.useDb) {

            const transaction = await this.Model.create({
                operations: this.operations,
                rollbackIndex: this.rollbackIndex
            })

            this.transactionId = transaction._id

        } else {
            throw new Error("You must set useDB true in the constructor")
        }
    }

     insertTransaction(model, data) {
        return new Promise((resolve, reject) => {
            let item = new model();
            item = Object.assign(item, data);
            item.save((err, result) => {
                if (err) {
                    return reject(new CreateError("", [err], this.application.app, this.application.locale, true))
                } else {
                    return resolve(result)
                }
            });
        });
    }

     updateTransaction(model, id, data, options = { new: false }) {

        return new Promise((resolve, reject) => {
            model.findById(id, (err, result) => {

                if (err) {
                    return reject(this.transactionError(err, { id, data }))
                } else {
                    if (!result) {
                        return reject(this.transactionError(new Error('Entity not found!'), { id, data }))
                    }
                    
                    result = Object.assign(result, data);
                    result.save((err2, final) => {
                        if (err2) {
                            return reject(this.transactionError(new UpdateError("", [err2], this.application.app, this.application.locale, true), { id, data }))
                        }
                        return resolve(final);
                    })
                    
                }

            });
        });
    }

     removeTransaction(model, id) {
        return new Promise((resolve, reject) => {

            model.findByIdAndRemove(id, (err, data) => {

                if (err) {
                    return reject(this.transactionError(err, id))
                } else {

                    if (data == null) {
                        return reject(this.transactionError(new Error('Entity not found'), id))
                    } else {
                        return resolve(data)
                    }

                }
            });

        });
    }

     transactionError(error, data) {
        return {
            data,
            error,
            executedTransactions: this.rollbackIndex + 1,
            remainingTransactions: this.operations.length - (this.rollbackIndex + 1),
        }
    }

     updateOperationStatus(status, index) {
        this.operations[index].status = status
    }

     async updateDbTransaction(status) {
        if (this.useDb && this.transactionId !== "") {
            return await this.Model.findByIdAndUpdate(
                this.transactionId,
                {
                    operations: this.operations,
                    rollbackIndex: this.rollbackIndex,
                    status
                },
                { new: true }
            )
        }
    }
}

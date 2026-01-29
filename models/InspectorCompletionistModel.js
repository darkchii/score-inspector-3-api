const { DataTypes } = require("@sequelize/core");

const InspectorCompletionistModel = (db) => db.define('InspectorCompletionist', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    mode: { type: DataTypes.INTEGER, primaryKey: true },
    completion_date: { type: DataTypes.DATE },
    scores: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
    tableName: 'completionists',
    timestamps: false
});

module.exports = InspectorCompletionistModel;
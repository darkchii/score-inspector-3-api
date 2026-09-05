const { DataTypes } = require("@sequelize/core");

const InspectorActivityLogModel = (db) => db.define('InspectorActivityLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    data: { type: DataTypes.JSON },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: 'activity_logs',
    timestamps: false
});

module.exports = InspectorActivityLogModel;
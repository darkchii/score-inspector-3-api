const { DataTypes } = require("@sequelize/core");

const InspectorStatModel = (db) => db.define('Stat', {
    metric: { type: DataTypes.STRING, primaryKey: true, },
    data: { type: DataTypes.STRING, allowNull: true, },
    last_updated: { type: DataTypes.DATE },
}, {
    tableName: 'stats',
    timestamps: false
});
module.exports.InspectorStatModel = InspectorStatModel;
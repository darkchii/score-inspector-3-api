const { DataTypes } = require("@sequelize/core");

const InspectorNotificationModel = (db) => db.define('InspectorNotification', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
    tableName: 'notifications',
    timestamps: false
});

module.exports = InspectorNotificationModel;
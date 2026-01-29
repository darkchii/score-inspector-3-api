const { DataTypes } = require("@sequelize/core");

const InspectorRoleModel = (db) => db.define('InspectorRole', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    icon: { type: DataTypes.STRING },
    color: { type: DataTypes.STRING },
    is_visible: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_listed: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
    tableName: 'roles',
    timestamps: false
});

module.exports = InspectorRoleModel;
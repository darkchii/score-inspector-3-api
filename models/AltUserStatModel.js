const { DataTypes } = require("@sequelize/core");

const AltUserStatModel = (db) => db.define('UserStat', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    mode_bucket: { type: DataTypes.INTEGER, primaryKey: true },
    fa_bucket: { type: DataTypes.INTEGER, primaryKey: true },
    diff_bucket: { type: DataTypes.INTEGER, primaryKey: true },
    metric_type: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.INTEGER },
    total: { type: DataTypes.INTEGER },
    completed_up_to: { type: DataTypes.DATE },
    lchg_time: { type: DataTypes.DATE }
}, {
    tableName: 'userstats',
    timestamps: false
});

module.exports = AltUserStatModel;
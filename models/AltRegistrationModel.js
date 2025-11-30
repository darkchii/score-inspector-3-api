const { DataTypes } = require("@sequelize/core");

const AltRegistrationModel = (db) => db.define('AltRegistration', {
    user_id: { type: DataTypes.BIGINT, primaryKey: true },
    discordname: { type: DataTypes.STRING },
    discordid: { type: DataTypes.BIGINT },
    registrationdate: { type: DataTypes.DATE },
    is_synced: { type: DataTypes.BOOLEAN },
    lchg_time: { type: DataTypes.DATE }
}, {
    tableName: 'registrations',
    timestamps: false
});

module.exports = AltRegistrationModel;
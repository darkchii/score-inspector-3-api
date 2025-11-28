const { DataTypes } = require("@sequelize/core");

const TeamModel = (db) => db.define('Team', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING },
    short_name: { type: DataTypes.STRING },
    flag_url: { type: DataTypes.STRING },
    members: { type: DataTypes.INTEGER },
    last_updated: { type: DataTypes.DATE },
    deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    last_scraped: { type: DataTypes.DATE },
    applications_open: { type: DataTypes.BOOLEAN, defaultValue: false },
    header_url: { type: DataTypes.STRING },
    url: { type: DataTypes.STRING },
    color: { type: DataTypes.STRING },
    created_at: { type: DataTypes.DATE }
}, {
    tableName: 'osu_teams',
    timestamps: false
});

module.exports = TeamModel;
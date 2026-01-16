const { DataTypes } = require("@sequelize/core");

const AltBeatmapPackModel = (db) => db.define('BeatmapPack', {
    tag: { type: DataTypes.STRING, primaryKey: true },
    name: { type: DataTypes.STRING },
    author: { type: DataTypes.STRING },
    pack_date: { type: DataTypes.DATE },
    url: { type: DataTypes.STRING },
    no_diff_reduction: { type: DataTypes.BOOLEAN },
    ruleset_id: { type: DataTypes.INTEGER },
    beatmapset_ids: { type: DataTypes.ARRAY(DataTypes.INTEGER) }
}, {
    tableName: 'beatmappack',
    timestamps: false
});

module.exports = AltBeatmapPackModel;
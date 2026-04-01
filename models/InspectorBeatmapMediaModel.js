const { DataTypes } = require("@sequelize/core");

const InspectorBeatmapMediaModel = (db) => db.define('InspectorBeatmapMedia', {
    beatmapset_id: { type: DataTypes.INTEGER, primaryKey: true },
    youtube_id: { type: DataTypes.STRING },
}, {
    tableName: 'beatmap_media',
    timestamps: false
});

module.exports = InspectorBeatmapMediaModel;
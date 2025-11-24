const { DataTypes } = require("@sequelize/core");

const AltBeatmapLiveModel = (db) => db.define('BeatmapLive', {
    beatmap_id: { type: DataTypes.INTEGER, primaryKey: true },
    user_id: { type: DataTypes.INTEGER },
    beatmapset_id: { type: DataTypes.INTEGER },
    mode: { type: DataTypes.INTEGER },
    status: { type: DataTypes.INTEGER },
    stars: { type: DataTypes.FLOAT },
    od: { type: DataTypes.FLOAT },
    ar: { type: DataTypes.FLOAT },
    bpm: { type: DataTypes.FLOAT },
    cs: { type: DataTypes.FLOAT },
    hp: { type: DataTypes.FLOAT },
    length: { type: DataTypes.INTEGER },
    drain_time: { type: DataTypes.INTEGER },
    count_circles: { type: DataTypes.INTEGER },
    count_sliders: { type: DataTypes.INTEGER },
    count_spinners: { type: DataTypes.INTEGER },
    max_combo: { type: DataTypes.INTEGER },
    pass_count: { type: DataTypes.INTEGER },
    play_count: { type: DataTypes.INTEGER },
    fc_count: { type: DataTypes.INTEGER },
    ss_count: { type: DataTypes.INTEGER },
    favourite_count: { type: DataTypes.INTEGER },
    ranked_date: { type: DataTypes.DATE },
    submitted_date: { type: DataTypes.DATE },
    last_updated: { type: DataTypes.DATE },
    version: { type: DataTypes.STRING },
    title: { type: DataTypes.STRING },
    artist: { type: DataTypes.STRING },
    source: { type: DataTypes.STRING },
    tags: { type: DataTypes.TEXT },
    checksum: { type: DataTypes.STRING },
    track_id: { type: DataTypes.INTEGER },
    pack: { type: DataTypes.STRING },
    lchg_time: { type: DataTypes.DATE }
}, {
    tableName: 'beatmaplive',
    timestamps: false
});

module.exports = AltBeatmapLiveModel;
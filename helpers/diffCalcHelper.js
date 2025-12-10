const { default: axios } = require("axios");

function GetUrl() {
    if (process.env.NODE_ENV === 'development') {
        return process.env.DIFF_CALC_URL_DEV;
    }

    return process.env.DIFF_CALC_URL;
}

module.exports.FetchDifficultyData = FetchDifficultyData;
async function FetchDifficultyData(beatmapId, rulesetId = 0, mods = null) {
    if(!beatmapId || isNaN(beatmapId) || beatmapId <= 0){
        throw new Error('Invalid beatmap ID');
    }

    const url = GetUrl();

    const response = await axios.post(`http://${url}/attributes`, {
        beatmap_id: parseInt(beatmapId),
        mods: mods,
        ruleset_id: rulesetId
    }, {
        timeout: 15000,
        headers: {
            "Accept-Encoding": "gzip,deflate,compress"
        }
    });

    console.log('Difficulty data fetched:', response.data);

    if (response.status !== 200 || !response.data) {
        throw new Error('Failed to fetch difficulty data');
    }

    return response.data;
}


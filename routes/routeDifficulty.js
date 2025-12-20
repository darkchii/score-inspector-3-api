const express = require('express');
const { AltBeatmapLive } = require('../helpers/db');
const { FetchDifficultyData, FetchDifficultyDetailed } = require('../helpers/diffCalcHelper');
const { OSU_SLUGS } = require('../helpers/osuHelper');
const { GetReplay } = require('../helpers/osuApiHelper');
const router = express.Router();

function parseRequest(params, body) {
    const { beatmapId, rulesetOrBeatmapId } = params;
    //if post, mods may be in body
    const { mods, scoreId } = body || {};
    let actualBeatmapId = beatmapId;
    let rulesetId = 0;
    if (!actualBeatmapId) {
        actualBeatmapId = rulesetOrBeatmapId;
    }

    if (isNaN(actualBeatmapId)) {
        throw new Error('Beatmap ID must be a number');
    }

    if (!isNaN(beatmapId)) {
        if (!isNaN(rulesetOrBeatmapId)) {
            rulesetId = parseInt(rulesetOrBeatmapId);
        } else if (rulesetOrBeatmapId.length > 0) {
            const slugLower = rulesetOrBeatmapId.toLowerCase();
            if (OSU_SLUGS.hasOwnProperty(slugLower)) {
                rulesetId = OSU_SLUGS[slugLower];
            } else {
                throw new Error('Invalid ruleset slug');
            }
        }
    }

    return { actualBeatmapId, rulesetId, mods, scoreId };
}

router.all('/:rulesetOrBeatmapId{/:beatmapId}/detailed', async (req, res) => {
    let actualBeatmapId, rulesetId, mods;
    try {
        ({ actualBeatmapId, rulesetId, mods } = parseRequest(req.params, req.body));
    } catch (parseError) {
        return res.status(400).json({ error: parseError.message });
    }

    console.log('Detailed difficulty request:', { actualBeatmapId, rulesetId, mods });

    try {
        const diff = await FetchDifficultyDetailed(actualBeatmapId, rulesetId, mods);
        if (diff) {
            return res.status(200).json(diff);
        } else {
            return res.status(404).json({ error: 'Data not found' });
        }
    } catch (error) {
        console.error('Error during detailed retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

router.all('/:rulesetOrBeatmapId{/:beatmapId}', async (req, res) => {
    let actualBeatmapId, rulesetId, mods;
    try {
        ({ actualBeatmapId, rulesetId, mods } = parseRequest(req.params, req.body));
    } catch (parseError) {
        return res.status(400).json({ error: parseError.message });
    }

    try {
        const diff = await FetchDifficultyData(actualBeatmapId, rulesetId, mods);
        if (diff) {
            return res.status(200).json(diff);
        } else {
            return res.status(404).json({ error: 'Difficulty data not found' });
        }
    } catch (error) {
        console.error('Error during difficulty retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

module.exports = router;

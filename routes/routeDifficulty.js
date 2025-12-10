const express = require('express');
const { AltBeatmapLive } = require('../helpers/db');
const { FetchDifficultyData } = require('../helpers/diffCalcHelper');
const router = express.Router();

router.all('/:beatmapId', async (req, res) => {
    const { beatmapId } = req.params;
    if (!beatmapId) {
        return res.status(400).json({ error: 'Beatmap ID parameter is required' });
    }

    //validate that beatmapId is a number
    if (isNaN(beatmapId)) {
        return res.status(400).json({ error: 'Beatmap ID must be a number' });
    }

    try {
        const diff = await FetchDifficultyData(beatmapId);
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

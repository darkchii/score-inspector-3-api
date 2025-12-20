const express = require('express');
const { GetReplay, GetScore } = require('../helpers/osuApiHelper');
const apicache = require('apicache-plus');
const { FetchReplayProcessed } = require('../helpers/diffCalcHelper');
const router = express.Router();

router.get('/:scoreId', apicache('24 hours'), async (req, res) => {
    const { scoreId } = req.params;

    //returns octet-stream

    if (!scoreId) {
        return res.status(400).json({ error: 'Score ID parameter is required' });
    }

    try {
        const response = await GetReplay(req.params.scoreId);
        if (response) {
            return res.status(200).json(response);
        } else {
            return res.status(404).json({ error: 'No replay found' });
        }
    } catch (error) {
        console.error('Error during getting replay data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:scoreId/processed', async (req, res) => {
    const { scoreId } = req.params;

    //returns octet-stream

    if (!scoreId) {
        return res.status(400).json({ error: 'Score ID parameter is required' });
    }

    try {
        const score = await GetScore(scoreId);
        if(!score) {
            return res.status(404).json({ error: 'Score not found' });
        }

        const replay = await GetReplay(scoreId, false);
        if(!replay) {
            return res.status(404).json({ error: 'Replay not found' });
        }

        const processedReplay = await FetchReplayProcessed(score.beatmap_id, replay, score.ruleset_id, score.mods);

        if (processedReplay) {
            return res.status(200).json(processedReplay);
        } else {
            return res.status(404).json({ error: 'No processed replay found' });
        }
    } catch (error) {
        console.error('Error during getting replay data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

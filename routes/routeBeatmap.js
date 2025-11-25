const express = require('express');
const { AltBeatmapLive } = require('../helpers/db');
const router = express.Router();
const apicache = require('apicache-plus');

router.get('/all', apicache('1 hour') ,async (req, res) => {
    try {
        const beatmaps = await AltBeatmapLive.findAll();
        return res.status(200).json(beatmaps);
    } catch (error) {
        console.error('Error fetching all beatmaps:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:beatmapId', apicache('1 hour'), async (req, res) => {
    //Validate beatmapId
    const { beatmapId } = req.params;
    if (!beatmapId) {
        return res.status(400).json({ error: 'Beatmap ID parameter is required' });
    }

    //validate that beatmapId is a number
    if (isNaN(beatmapId)) {
        return res.status(400).json({ error: 'Beatmap ID must be a number' });
    }

    try {
        const Beatmap = await AltBeatmapLive.findOne({ where: { beatmap_id: beatmapId } });
        if (Beatmap) {
            return res.status(200).json(Beatmap);
        } else {
            return res.status(404).json({ error: 'Beatmap not found' });
        }   
    } catch (error) {
        console.error('Error fetching beatmap:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
